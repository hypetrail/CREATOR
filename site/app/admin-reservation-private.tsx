'use client';

import {useState} from 'react';
import {fleetApi,formatPeriod} from '../lib/fleet-client';
import AdminCustomerData,{type ReservationContact} from './admin-customer-data';

interface PrivateDocument {id:string;kind:string;created_ms:number;document_version?:string}
const historicalFields=[['name','Nome'],['cpf','CPF'],['birth','Nascimento'],['phone','WhatsApp'],['email','E-mail'],['street','Endereço'],['number','Número'],['complement','Complemento'],['district','Bairro'],['city','Cidade'],['state','UF'],['cep','CEP'],['guardian','Responsável'],['guardianCPF','CPF do responsável'],['guardianPhone','WhatsApp do responsável']] as const;

export default function AdminReservationPrivate({reservationId,closed=false}:{reservationId:string;closed?:boolean}){
 const [contact,setContact]=useState<ReservationContact|null>(null),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false);
 const [notice,setNotice]=useState(''),[error,setError]=useState(''),[editing,setEditing]=useState(false),[reason,setReason]=useState('');
 const [legacyLoaded,setLegacyLoaded]=useState(false),[legacyBusy,setLegacyBusy]=useState(false),[legacyError,setLegacyError]=useState('');
 const [customer,setCustomer]=useState<Record<string,string>|null>(null),[documents,setDocuments]=useState<PrivateDocument[]>([]);
 const load=async()=>{
  setBusy(true);setError('');
  try{const result=await fleetApi<{contact:ReservationContact|null}>(`admin/contact?reservation_id=${encodeURIComponent(reservationId)}`);setContact(result.contact);setLoaded(true);}
  catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível consultar o contato.');}
  finally{setBusy(false);}
 };
 const act=async(path:string,payload:Record<string,unknown>,success:string)=>{
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const result=await fleetApi<{message?:string}>(path,{reservation_id:reservationId,...payload});setNotice(result.message||success);await load();}
  catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível concluir esta ação.');}
  finally{setBusy(false);}
 };
 const loadLegacy=async()=>{
  if(legacyBusy)return;setLegacyBusy(true);setLegacyError('');
  const responses=await Promise.allSettled([
   fleetApi<{customer:Record<string,string>|null}>(`admin/customer-data?reservation_id=${encodeURIComponent(reservationId)}`),
   fleetApi<{documents:PrivateDocument[]}>(`admin/private-documents?reservation_id=${encodeURIComponent(reservationId)}`),
  ]);
  if(responses[0].status==='fulfilled')setCustomer(responses[0].value.customer);
  if(responses[1].status==='fulfilled')setDocuments(responses[1].value.documents);
  if(responses.some(result=>result.status==='rejected'))setLegacyError('Não foi possível consultar todo o arquivo histórico. A consulta depende dos recursos e chaves usados no registro original.');
  setLegacyLoaded(true);setLegacyBusy(false);
 };
 return <section className="fa-private-customer" aria-label="Contato e avisos desta reserva">
  <h4>Contato e avisos desta reserva</h4><p className="fa-note">Consulta exclusiva do administrador. O fluxo atual guarda apenas WhatsApp e nome opcional, junto dos dados da locação.</p>
  <div className="fa-row"><button type="button" className="fa-button fa-secondary" disabled={busy} onClick={()=>void load()}>{busy?'Consultando contato…':loaded?'Atualizar contato':'Consultar contato'}</button>{loaded&&<button type="button" className="fa-text" onClick={()=>{setContact(null);setLoaded(false);setEditing(false);setReason('');setNotice('');}}>Ocultar contato</button>}</div>
  {notice&&<p className="fa-info" role="status">{notice}</p>}{error&&<p className="fa-alert" role="alert">{error}</p>}
  {loaded&&contact&&<><dl className="fa-booking-details"><div><dt>WhatsApp</dt><dd>{contact.phone}</dd></div>{contact.name&&<div><dt>Nome para atendimento</dt><dd>{contact.name}</dd></div>}<div><dt>Avisos operacionais</dt><dd>{contact.revoked_ms||contact.whatsapp_consent===false?'Autorização revogada':'Autorizados para esta reserva'}</dd></div></dl>{!closed&&<div className="fa-row"><button type="button" className="fa-button fa-secondary" disabled={busy} onClick={()=>setEditing(previous=>!previous)}>{editing?'Fechar contato':'Conferir ou corrigir contato'}</button>{!contact.revoked_ms&&contact.whatsapp_consent!==false&&<button type="button" className="fa-text" disabled={busy} onClick={()=>void act('admin/contact/revoke',{},'Autorização revogada. Novos avisos desta reserva ficam bloqueados.')}>Revogar avisos operacionais</button>}</div>}</>}
  {loaded&&!closed&&(!contact||editing)&&<AdminCustomerData key={contact?.phone||'new'} reservationId={reservationId} contact={contact} disabled={busy} onSaved={async()=>{await load();setEditing(false);setNotice('Contato e autorização da reserva registrados. Confira o processamento em Avisos do WhatsApp.');}}/>}
  {loaded&&!contact&&closed&&<p>Nenhum contato mínimo registrado nesta reserva encerrada.</p>}
  {loaded&&contact&&!closed&&!contact.revoked_ms&&contact.whatsapp_consent!==false&&<form aria-label="Avisar pendência da reserva" onSubmit={async event=>{event.preventDefault();await act('admin/contact/pending',{reason},'Aviso de pendência preparado para o WhatsApp autorizado.');}}><h4>Pendência no atendimento</h4><label>O que falta para concluir a reserva?<textarea required minLength={5} maxLength={500} rows={3} value={reason} onChange={event=>setReason(event.target.value)} placeholder="Ex.: precisamos combinar o horário de retirada. Evite dados pessoais."/></label><button className="fa-button fa-secondary" disabled={busy||reason.trim().length<5}>Preparar aviso de pendência</button><p className="fa-note">Este aviso é criado pela equipe para uma reserva já registrada. Ele não identifica pessoas que abandonaram o site sem informar contato.</p></form>}
  <details className="fa-legacy-records"><summary>Arquivo de versões anteriores (somente consulta)</summary><p>Identificações e PDFs já registrados permanecem no histórico. Novos cadastros completos, envio por e-mail e vínculos externos não fazem parte deste fluxo.</p><button type="button" className="fa-button fa-secondary" disabled={legacyBusy} onClick={()=>void loadLegacy()}>{legacyBusy?'Consultando arquivo…':'Consultar arquivo histórico'}</button>{legacyError&&<p className="fa-alert" role="alert">{legacyError}</p>}{legacyLoaded&&customer&&<dl className="fa-booking-details fa-private-fields">{historicalFields.map(([key,label])=>customer[key]?<div key={key}><dt>{label}</dt><dd>{customer[key]}</dd></div>:null)}</dl>}{legacyLoaded&&documents.length>0&&<ul>{documents.map(document=><li key={document.id}><a href={`/api/fleet/admin/private-documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">{document.kind==='pickup_confirmation'?'PDF histórico da retirada':'PDF histórico da reserva'}</a><span> · {formatPeriod(document.created_ms)}</span></li>)}</ul>}{legacyLoaded&&!customer&&!documents.length&&!legacyError&&<p>Não há identificação completa ou PDF histórico para esta reserva.</p>}{legacyLoaded&&<button type="button" className="fa-text" onClick={()=>{setCustomer(null);setDocuments([]);setLegacyLoaded(false);setLegacyError('');}}>Ocultar arquivo histórico</button>}</details>
 </section>;
}
