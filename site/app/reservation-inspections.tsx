'use client';

import {useEffect,useState} from 'react';
import {fleetApi,formatPeriod} from '../lib/fleet-client';
import {phone} from '../lib/rental';

type InspectionKind='departure'|'return';
const checkLabels={brakes:'Freios',tires:'Pneus',lights:'Iluminação e setas',battery:'Bateria e recarga',charger:'Carregador',key:'Chave e acessórios',condition:'Estado geral e avarias'};
type CheckKey=keyof typeof checkLabels;
type Checks=Record<CheckKey,boolean>;
interface Inspection {id:string;kind:InspectionKind;checks:Checks;notes:string;photo_ids:string[];photo_storage?:string;local_photo_names?:string[];created_ms:number;maintenance_required?:boolean}
interface RawInspection extends Partial<Inspection> {id:string;payload?:string|Record<string,unknown>}
interface Props {reservationId:string;code:string;whatsapp:string;kind?:InspectionKind;disabled?:boolean;onTransition?:(inspectionId:string)=>Promise<boolean|undefined>}
const emptyChecks=()=>Object.fromEntries(Object.keys(checkLabels).map(key=>[key,false])) as Checks;
async function preparePhoto(file:File){
 const image=await createImageBitmap(file);
 try{
  if(!image.width||!image.height||image.width*image.height>60_000_000)throw new Error('A imagem é muito grande para preparar no navegador. Use uma foto menor.');
  const scale=Math.min(1,1920/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('Não foi possível preparar a imagem neste navegador.');
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Não foi possível preparar a foto.')),'image/jpeg',.88));
  if(blob.size>5*1024*1024)throw new Error('A foto preparada ultrapassou 5 MB. Use uma imagem menor.');
  return new File([blob],'vistoria-'+crypto.randomUUID()+'.jpg',{type:'image/jpeg'});
 }finally{image.close();}
}
function inspectionValue(raw:RawInspection):Inspection{
 let details:Record<string,unknown>={};
 try{details=typeof raw.payload==='string'?JSON.parse(raw.payload):raw.payload||{};}catch{/* Older entries may not have a payload. */}
 const data={...details,...raw};
 return {id:raw.id,kind:data.kind==='return'?'return':'departure',checks:(data.checks||emptyChecks()) as Checks,notes:String(data.notes||''),photo_storage:String(data.photo_storage||'cloud'),local_photo_names:Array.isArray(data.local_photo_names)?data.local_photo_names as string[]:[],photo_ids:Array.isArray(data.photo_ids)?data.photo_ids.filter((value):value is string=>typeof value==='string'):[],created_ms:Number(data.created_ms)||0,maintenance_required:data.maintenance_required===true};
}

export default function ReservationInspections({reservationId,code,whatsapp,kind,disabled=false,onTransition}:Props){
 const [open,setOpen]=useState(false),[history,setHistory]=useState<Inspection[]>([]),[loading,setLoading]=useState(false);
 const [checks,setChecks]=useState<Checks>(emptyChecks),[notes,setNotes]=useState(''),[photos,setPhotos]=useState<string[]>([]);
 const [maintenanceRequired,setMaintenanceRequired]=useState(false);
 const [localPhotos,setLocalPhotos]=useState(true),[localNames,setLocalNames]=useState<string[]>([]),[localConfirmed,setLocalConfirmed]=useState(false);
 const [archiveBusy,setArchiveBusy]=useState(''),[archiveStates,setArchiveStates]=useState<Record<string,string>>({});
 const [saved,setSaved]=useState<Inspection|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false);
 const load=async()=>{setLoading(true);try{const value=await fleetApi<{inspections:RawInspection[]}>(`admin/inspections?reservation_id=${encodeURIComponent(reservationId)}`);setHistory((value.inspections||[]).map(inspectionValue));}catch(cause){setError((cause as Error).message);}finally{setLoading(false);}};
 useEffect(()=>{if(!open)return;let active=true;fleetApi<{inspections:RawInspection[]}>(`admin/inspections?reservation_id=${encodeURIComponent(reservationId)}`).then(value=>{if(active)setHistory((value.inspections||[]).map(inspectionValue));}).catch(cause=>{if(active)setError(cause.message);});return()=>{active=false;};},[open,reservationId]);
 const invalidate=()=>{setSaved(null);setNotice('');setConfirmed(false);};
 const upload=async(files:FileList|null)=>{
  if(!files?.length||busy)return;setError('');setBusy(true);invalidate();
  try{
   if(photos.length+files.length>8)throw new Error('Selecione até oito fotos por vistoria.');
   for(const file of files){
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Use JPG, PNG ou WebP com até 5 MB por foto.');
    const prepared=await preparePhoto(file);
    const form=new FormData();form.set('photo',prepared);form.set('reservation_id',reservationId);
    const response=await fetch('/api/fleet/admin/inspection-photos',{method:'POST',body:form,cache:'no-store'});
    const value=await response.json() as {id?:string;error?:string};
    if(!response.ok||!value.id)throw new Error(value.error||'Não foi possível enviar a foto da vistoria.');
    setPhotos(previous=>[...previous,value.id!]);
   }
  }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
 };
 const whatsappMessage=(entry:Inspection)=>{
  let destination='';try{destination=phone(whatsapp);}catch{setError('Confira o WhatsApp oficial nas configurações da empresa.');return;}
  const message=`CALORI GO — VISTORIA ${entry.kind==='departure'?'DE SAÍDA':'DE DEVOLUÇÃO'}\nReserva: ${code}\nRegistro: ${entry.id}\nData: ${formatPeriod(entry.created_ms)}\n\n${Object.entries(checkLabels).map(([key,label])=>`${entry.checks[key as CheckKey]?'Conferido':'Não conferido'}: ${label}`).join('\n')}\n\nObservações e fotos disponíveis no relatório privado da vistoria.\n\n${entry.photo_storage==='local'?`${entry.local_photo_names?.length||0} foto(s) guardada(s) no computador; o relatório contém somente referências.`:`${entry.photo_ids.length} foto(s) registrada(s) no painel protegido.`} Baixe o relatório PDF e anexe-o manualmente nesta conversa.`;
  window.open(`https://wa.me/${destination}?text=${encodeURIComponent(message)}`,'_blank','noopener,noreferrer');
  setNotice('Checklist aberto no WhatsApp da empresa. Baixe o relatório privado, anexe o arquivo e toque em Enviar. Abrir a conversa não envia o PDF ou as imagens automaticamente.');
 };
 const sendArchive=async(entry:Inspection)=>{
  if(archiveBusy)return;setArchiveBusy(entry.id);setError('');setNotice('');
  try{const response=await fleetApi<{status:string;message:string}>('admin/inspection-archive',{inspection_id:entry.id});setArchiveStates(previous=>({...previous,[entry.id]:response.status}));setNotice(response.message||'Solicitação de envio processada. Confira o resultado no serviço de mensagens.');}
  catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível concluir o envio do relatório.');}
  finally{setArchiveBusy('');}
 };
 const archiveActions=(entry:Inspection)=><div className="fa-row fa-inspection-delivery"><a className="fa-button fa-secondary" href={`/api/fleet/admin/inspection-report/${encodeURIComponent(entry.id)}`} target="_blank" rel="noreferrer">Baixar PDF da vistoria</a><button type="button" className="fa-button fa-secondary" disabled={!!archiveBusy||busy||['submitted','already_sent','uncertain'].includes(archiveStates[entry.id])} onClick={()=>void sendArchive(entry)}>{archiveBusy===entry.id?'Enviando relatório…':archiveStates[entry.id]==='uncertain'?'Resultado incerto — conferir envio':['submitted','already_sent'].includes(archiveStates[entry.id])?'Relatório aceito pelo WhatsApp':'Enviar relatório ao WhatsApp da empresa'}</button></div>;
 return <details className="fa-inspection" open={open} onToggle={event=>setOpen(event.currentTarget.open)}>
  <summary>{kind==='departure'?'Vistoria de saída e confirmação da retirada':kind==='return'?'Vistoria de devolução e encerramento':'Histórico das vistorias'}</summary>
  {open&&<div className="fa-stack fa-inspection-content">
   {error&&<p className="fa-alert" role="alert">{error}</p>}{notice&&<p className="fa-info" role="status">{notice}</p>}
   {kind&&<form aria-label={`Vistoria ${kind==='departure'?'de saída':'de devolução'} ${code}`} onSubmit={async event=>{
    event.preventDefault();if(busy)return;setError('');setBusy(true);
    try{
     if(localPhotos?(!localNames.length||!localConfirmed):!photos.length)throw new Error('Registre ao menos uma foto e confirme que ela está guardada no computador.');
     if(Object.values(checks).some(value=>!value))throw new Error('Confirme que todos os itens foram conferidos.');
     const value=await fleetApi<{inspection?:RawInspection;id?:string}>('admin/inspections',{reservation_id:reservationId,kind,checks,notes,photo_ids:localPhotos?[]:photos,photo_storage:localPhotos?'local':'cloud',local_photo_names:localPhotos?localNames:[],maintenance_required:maintenanceRequired});
     const raw=value.inspection||(value.id?{id:value.id,kind,checks,notes,photo_ids:localPhotos?[]:photos,photo_storage:localPhotos?'local':'cloud',local_photo_names:localPhotos?localNames:[],maintenance_required:maintenanceRequired,created_ms:Date.now()}:null);
     if(!raw)throw new Error('A vistoria não retornou um identificador. Atualize o histórico antes de continuar.');
     const entry=inspectionValue(raw);setSaved(entry);setNotice(localPhotos?'Vistoria salva. As fotos permanecem no computador; o site registrou somente as referências.':'Vistoria salva no painel protegido. O checklist e as fotos podem ser encaminhados ao WhatsApp da empresa.');await load();
    }catch(cause){setError((cause as Error).message);}finally{setBusy(false);}
   }}><fieldset disabled={busy||disabled}>
    <h4>{kind==='departure'?'Conferência de saída':'Conferência de devolução'}</h4>
    <p>Marque cada conferência realizada e descreva avarias ou falhas nas observações. A marcação confirma a inspeção, não declara que a moto está sem problemas.</p>
    <div className="fa-inspection-checks">{(Object.entries(checkLabels) as [CheckKey,string][]).map(([key,label])=><label className="fa-check" key={key}><input type="checkbox" required checked={checks[key]} onChange={event=>{invalidate();setChecks(previous=>({...previous,[key]:event.target.checked}));}}/>Conferi {label.toLocaleLowerCase('pt-BR')}</label>)}</div>
    <label>Identificações, condição da bateria, avarias e observações<textarea rows={4} maxLength={4000} value={notes} onChange={event=>{invalidate();setNotes(event.target.value);}} placeholder="Identifique bateria, carregador e acessórios; registre a carga e os danos observados. Evite incluir dados pessoais neste campo."/></label>
    {kind==='return'&&<label className="fa-check"><input type="checkbox" checked={maintenanceRequired} onChange={event=>{invalidate();setMaintenanceRequired(event.target.checked);}}/>Há falha ou avaria que exige manutenção. Manter esta moto fora de operação após a devolução.</label>}
    <label className="fa-check"><input type="checkbox" checked={localPhotos} onChange={event=>{setLocalPhotos(event.target.checked);invalidate();}}/>Guardar fotos no computador, sem enviar imagens ao site</label>
    {localPhotos?<><label className="fa-upload">Selecionar fotos já guardadas no computador<input type="file" accept="image/*" multiple onChange={event=>{const names=Array.from(event.target.files||[]).map(file=>file.name);setLocalNames([...new Set(names)]);setLocalConfirmed(false);invalidate();event.target.value='';}}/></label><p className="fa-note">Pasta sugerida: {code}/{kind==='departure'?'saida':'devolucao'}. Só os nomes serão registrados; o site não copia nem guarda as imagens.</p><ul>{localNames.map(name=><li key={name}>{name}</li>)}</ul><label className="fa-check"><input required type="checkbox" checked={localConfirmed} onChange={event=>{setLocalConfirmed(event.target.checked);invalidate();}}/>Confirmei que as fotos estão salvas na pasta desta reserva no meu computador.</label></>:<><label className="fa-upload">Fotos da vistoria — ao menos uma, até oito<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event=>{void upload(event.target.files);event.target.value='';}}/></label>
    <p className="fa-note">As fotos são otimizadas para o registro da vistoria e ficam protegidas no painel. Use até 5 MB por imagem. Mantenha os originais se precisar deles; estas fotos não entram na galeria pública do catálogo.</p>
    <div className="fa-inspection-photos">{photos.map((id,index)=><div key={id}><a href={`/api/fleet/admin/inspection-photos/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Abrir foto {index+1}</a><button type="button" className="fa-text fa-danger" onClick={()=>{invalidate();setPhotos(previous=>previous.filter(value=>value!==id));}}>Retirar desta vistoria</button></div>)}</div>
    </>}
    <button className="fa-button fa-secondary" disabled={busy||(localPhotos?(!localNames.length||!localConfirmed):!photos.length)}>{busy?'Salvando fotos e vistoria…':'Salvar vistoria '+(kind==='departure'?'de saída':'de devolução')}</button>
   </fieldset></form>}
   {saved&&onTransition&&<div className="fa-inspection-confirm"><p><strong>Vistoria salva:</strong> {saved.id}</p><label className="fa-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>{kind==='departure'?'Conferi a situação do pagamento, documentação, elegibilidade e assinatura do cliente ou responsável. A moto pode ser entregue.':'Conferi o retorno e registrei os equipamentos e eventuais avarias. A devolução pode ser encerrada.'}</label><div className="fa-row"><button type="button" className="fa-button" disabled={!confirmed||disabled||busy} onClick={async()=>{setBusy(true);try{await onTransition(saved.id);}finally{setBusy(false);}}}>{kind==='departure'?'Confirmar retirada e iniciar tempo':'Confirmar devolução'}</button><button type="button" className="fa-button fa-secondary" onClick={()=>whatsappMessage(saved)}>Preparar checklist no WhatsApp da empresa</button></div>{archiveActions(saved)}<p className="fa-note">{kind==='departure'?'O prazo começa no horário registrado pelo servidor ao confirmar a retirada. Se isso afetar outra reserva, o sistema exigirá resolver o conflito antes da entrega.':'O horário real será registrado pelo servidor. A moto terá intervalo de preparação antes de uma nova locação; falhas precisam ser tratadas pela administração.'}</p></div>}
   <div className="fa-section-title"><h4>Registros preservados</h4><button type="button" className="fa-text" disabled={loading} onClick={()=>void load()}>Atualizar vistorias</button></div>
   {!history.length&&<p>{loading?'Consultando vistorias…':'Nenhuma vistoria registrada nesta reserva.'}</p>}
   {history.map(entry=><article key={entry.id} className="fa-inspection-record"><h4>{entry.kind==='departure'?'Saída':'Devolução'} · {formatPeriod(entry.created_ms)}</h4><p>{entry.notes||'Sem observações.'}</p>{entry.maintenance_required&&<p className="fa-danger">Manutenção solicitada nesta vistoria.</p>}<p className="fa-note">Registro {entry.id} · {entry.photo_ids.length} foto(s)</p><div className="fa-row"><button type="button" className="fa-button fa-secondary" onClick={()=>whatsappMessage(entry)}>Preparar checklist no WhatsApp da empresa</button>{entry.photo_ids.map((id,index)=><a key={id} className="fa-link" href={`/api/fleet/admin/inspection-photos/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Foto {index+1}</a>)}</div>{archiveActions(entry)}</article>)}
   <p className="fa-note">O relatório reúne a vistoria e as fotos em um PDF privado. O envio pelo botão depende do WhatsApp Business, do modelo de mensagem aprovado e do destinatário da empresa configurado. Abrir a conversa manual prepara somente o checklist; a equipe anexa o relatório e confirma o envio.</p>
  </div>}
 </details>;
}
