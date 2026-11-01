import {env} from 'cloudflare:workers';
import {db,HttpError} from './rental-server';
import {createInspectionPdf} from './inspection-pdf';
import {loadPdfFont} from './font-server';
import {inspectionArchiveConfigured,sendInspectionArchivePDF,type WhatsAppEnvironment} from './whatsapp-server';
import {recordAudit} from './operation-records-server';

interface Inspection {id:string;reservation_id:string;kind:'departure'|'return';payload:string;created_ms:number;created_by:string;code:string;model_name:string;color_name:string;unit_label:string}
const environment=()=>env as Cloudflare.Env&WhatsAppEnvironment;
async function report(id:string,requestUrl:string){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new HttpError(404,'Vistoria não encontrada.');
 const row=await db().prepare('SELECT i.*,r.code,r.model_name,r.color_name,r.unit_label FROM rental_inspections i JOIN reservations r ON r.id=i.reservation_id WHERE i.id=?').bind(id).first<Inspection>();
 if(!row)throw new HttpError(404,'Vistoria não encontrada.');
 const payload=JSON.parse(row.payload) as {checks:Record<string,boolean>;notes:string;maintenance_required:boolean;photo_ids:string[];local_photo_names?:string[];photo_storage?:string};
 const photos=[];let size=0;
 for(const photoId of payload.photo_ids){
  const photo=await db().prepare('SELECT id,mime,storage_key,sha256,created_ms FROM inspection_photos WHERE id=? AND reservation_id=?').bind(photoId,row.reservation_id).first<{id:string;mime:string;storage_key:string;sha256:string;created_ms:number}>();
  if(!photo)throw new HttpError(409,'Uma foto da vistoria não está disponível.');
  if(!['image/jpeg','image/png'].includes(photo.mime))throw new HttpError(409,'O relatório exige fotos JPG ou PNG. Envie uma nova vistoria com imagens compatíveis.');
  const object=await env.BUCKET?.get(photo.storage_key);
  if(!object)throw new HttpError(503,'Não foi possível recuperar uma foto da vistoria.');
  const bytes=new Uint8Array(await object.arrayBuffer());size+=bytes.length;
  if(size>12*1024*1024)throw new HttpError(413,'As fotos ultrapassam o limite do relatório. Use imagens otimizadas.');
  photos.push({id:photo.id,mime:photo.mime,sha256:photo.sha256,uploaded_ms:photo.created_ms,bytes});
 }
 const bytes=await createInspectionPdf({id:row.id,code:row.code,model:row.model_name,color:row.color_name,unit:row.unit_label,kind:row.kind,created_ms:row.created_ms,created_by:row.created_by,checks:payload.checks,notes:payload.notes+(payload.photo_storage==='local'?'\nFOTOS GUARDADAS NO COMPUTADOR (não anexadas ao site):\n'+(payload.local_photo_names||[]).join('\n'):''),maintenance_required:payload.maintenance_required,photos,fontBytes:await loadPdfFont(requestUrl)});
 return {row,bytes};
}
export async function inspectionReportResponse(id:string,requestUrl:string){
 const value=await report(id,requestUrl);
 return new Response(new Uint8Array(value.bytes),{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':`attachment; filename="Vistoria-${value.row.code}.pdf"`}});
}
export async function archiveInspection(input:Record<string,unknown>,requestUrl:string,actor:string){
 if(Object.keys(input).some(key=>key!=='inspection_id'))throw new HttpError(400,'Informe somente a vistoria a encaminhar.');
 const id=String(input.inspection_id||'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!await db().prepare('SELECT id FROM rental_inspections WHERE id=?').bind(id).first())throw new HttpError(404,'Vistoria não encontrada.');
 if(!inspectionArchiveConfigured(environment()))return {status:'not_configured',message:'Conecte o WhatsApp Business, o modelo de mensagem aprovado e o número de arquivo da empresa. O relatório já pode ser baixado e enviado manualmente.'};
 const previous=await db().prepare('SELECT status,lease_ms,attempts FROM inspection_archives WHERE inspection_id=?').bind(id).first<{status:string;lease_ms:number;attempts:number}>();
 if(previous?.status==='submitted')return {status:'already_sent',message:'Este relatório já foi aceito pelo WhatsApp. A aceitação não confirma a entrega.'};
 if(previous?.status==='unknown'||(previous?.status==='sending'&&previous.lease_ms<Date.now())){
  await db().prepare("UPDATE inspection_archives SET status='unknown',updated_ms=? WHERE inspection_id=?").bind(Date.now(),id).run();
  return {status:'uncertain',message:'O resultado anterior não foi confirmado. Confira o WhatsApp da empresa antes de repetir; o reenvio automático está bloqueado.'};
 }
 if(previous&&previous.attempts>=5)return {status:'failed',message:'Limite de tentativas atingido. Confira o provedor antes de continuar.'};
 await db().prepare("INSERT OR IGNORE INTO inspection_archives (inspection_id,status,updated_ms) VALUES (?,'pending',?)").bind(id,Date.now()).run();
 const claimed=await db().prepare("UPDATE inspection_archives SET status='sending',lease_ms=?,attempts=attempts+1,updated_ms=? WHERE inspection_id=? AND status IN ('pending','failed','not_configured') AND attempts<5 RETURNING inspection_id").bind(Date.now()+120_000,Date.now(),id).first();
 if(!claimed)return {status:'processing',message:'O envio do relatório já está em processamento.'};
 const record=(status:string,providerId='')=>db().prepare('UPDATE inspection_archives SET status=?,provider_id=?,lease_ms=0,updated_ms=? WHERE inspection_id=?').bind(status,providerId,Date.now(),id).run();
 let mayHaveSent=false;
 try{
  const value=await report(id,requestUrl);mayHaveSent=true;
  const result=await sendInspectionArchivePDF({environment:environment(),documentBytes:value.bytes,filename:`Vistoria-${value.row.code}.pdf`,parameters:[value.row.code,value.row.kind==='departure'?'Saída':'Devolução',value.row.id]});
  if(result.status==='submitted'){await record('submitted',result.provider_id);await recordAudit(actor,'inspection_archive_submitted',id,{});return {status:'submitted',message:'Relatório com checklist e fotos aceito pelo WhatsApp para o arquivo da empresa. A entrega ainda depende do provedor.'};}
  await record(result.status==='uncertain'?'unknown':result.status);
  return {status:result.status,message:result.status==='uncertain'?'O provedor não confirmou o resultado. Confira o WhatsApp antes de repetir.':'O envio não foi concluído. O relatório continua disponível no painel.'};
 }catch{await record(mayHaveSent?'unknown':'failed');return {status:mayHaveSent?'uncertain':'failed',message:mayHaveSent?'O resultado do envio não foi confirmado. Confira o WhatsApp da empresa antes de repetir.':'Não foi possível preparar o relatório. Confira as fotos e tente novamente.'};}
}
