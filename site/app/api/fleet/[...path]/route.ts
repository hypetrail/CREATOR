import {registerWhatsAppContact,queueReadyWhatsApp,queueOwnerReservationWhatsApp,queuePendingWhatsApp} from '../../../../lib/reservation-whatsapp-server';
import * as fleet from '../../../../lib/fleet-server';
import * as rental from '../../../../lib/rental-server';
import * as documents from '../../../../lib/document-server';
import type {DeliveryNotice} from '../../../../lib/document-delivery-server';
import * as operations from '../../../../lib/operation-records-server';
import * as notifications from '../../../../lib/notification-server';
import * as privateData from '../../../../lib/private-customer-store';
import {inspectionReportResponse,archiveInspection} from '../../../../lib/inspection-archive-server';
import {validateMinimalContact,readMinimalReservationContact,replaceMinimalReservationContact,revokeMinimalReservationConsent} from '../../../../lib/reservation-contact-server';
import {createCareGuidePdf} from '../../../../lib/care-pdf';
import {defaultCareGuide} from '../../../../lib/care-guide';
import {loadPdfFont} from '../../../../lib/font-server';
import {DeliveryInputError} from '../../../../lib/customer-delivery';
export const dynamic='force-dynamic';

async function readBody(req:Request,limit:number){
 if(Number(req.headers.get('content-length')||0)>limit)throw new fleet.HttpError(413,'Solicitação muito grande.');
 const reader=req.body?.getReader();if(!reader)throw new fleet.HttpError(400,'Dados da solicitação ausentes.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>limit){await reader.cancel();throw new fleet.HttpError(413,'Solicitação muito grande.');}chunks.push(next.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return bytes;
}
async function prepareMessages(reserved:{id:string;delivery_token?:string},contact:unknown){
 if(!reserved.delivery_token){try{await queueOwnerReservationWhatsApp(reserved.id);return {status:'queued',contact_saved:true,message:'Reserva e contato registrados. Avisos preparados para processamento no servidor.'};}catch{return {status:'failed',contact_saved:true,message:'Reserva e contato registrados; confira a fila de avisos.'};}}
 try{return await registerWhatsAppContact({reservation_id:reserved.id,delivery_token:reserved.delivery_token,contact,whatsapp_consent:true});}
 catch{return {status:'failed',contact_saved:true,message:'Reserva e contato registrados. A preparação dos avisos precisa ser conferida pela equipe.'};}
}
async function limitPublicReservations(req:Request){
 const now=Date.now(),ip=req.headers.get('cf-connecting-ip')||'unknown';
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('minimal-reservation:'+ip));
 const key=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const hit=await rental.db().prepare('INSERT INTO customer_auth_limits (key_hash,window_ms,count) VALUES (?,?,1) ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN window_ms<=? THEN 1 ELSE count+1 END,window_ms=CASE WHEN window_ms<=? THEN excluded.window_ms ELSE window_ms END RETURNING count').bind(key,now,now-600000,now-600000).first<{count:number}>();
 if(!hit||hit.count>5)throw new fleet.HttpError(429,'Muitas solicitações. Aguarde alguns minutos ou fale com a loja.');
}
async function handle(req:Request){
 try{
  const url=new URL(req.url),path=url.pathname.replace(/^\/api\/fleet\//,'');
  let actor='';
  const multipart=path==='admin/photos'||path==='admin/inspection-photos';
  if(req.method!=='GET'){
   if(req.headers.get('origin')&&req.headers.get('origin')!==url.origin)throw new fleet.HttpError(403,'Origem da solicitação inválida.');
   if(req.headers.get('sec-fetch-site')==='cross-site')throw new fleet.HttpError(403,'Origem da solicitação inválida.');
   if(!multipart&&!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new fleet.HttpError(415,'Envie os dados em JSON.');
  }
  if(path==='admin'||path.startsWith('admin/')){
   actor=await rental.identity(req);
   await fleet.initialize(actor);await rental.admin(actor);
  }
  if(req.method==='POST'&&multipart){
   if(!req.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data'))throw new fleet.HttpError(415,'Envie a foto como formulário.');
   const bytes=await readBody(req,8*1024*1024+65536);
   const uploadRequest=new Request(req.url,{method:'POST',headers:req.headers,body:bytes});
   if(path==='admin/inspection-photos')return Response.json(await operations.uploadInspectionPhoto(uploadRequest,actor),{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   const uploaded=await rental.uploadPhoto(uploadRequest);
   return Response.json({url:uploaded.url.replace('/api/rental/photos/','/api/fleet/photos/')},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(req.method==='GET'&&path.startsWith('admin/inspection-photos/'))return await operations.inspectionPhotoResponse(path.slice('admin/inspection-photos/'.length));
  if(req.method==='GET'&&path.startsWith('admin/inspection-report/'))return await inspectionReportResponse(path.slice('admin/inspection-report/'.length),req.url);
  if(req.method==='GET'&&path.startsWith('admin/private-documents/')){
   const id=path.slice('admin/private-documents/'.length);
   const response=await privateData.documentResponseForOwner(id);
   await operations.recordAudit(actor,'private_document_opened',id,{});
   return response;
  }
  if(req.method==='GET'&&path.startsWith('photos/'))return await fleet.photoResponse(path.slice(7));
  if(req.method==='GET'&&path==='care-guide'){
   const bytes=await createCareGuidePdf(await loadPdfFont(req.url));
   return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="Guia-Cuidados-T1-CaloriMob.pdf"','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff','X-Care-Guide-Version':defaultCareGuide.version}});
  }
  let input:Record<string,unknown>={};
  if(req.method==='POST'){
   const bytes=await readBody(req,65_536);
   const parsed=JSON.parse(new TextDecoder().decode(bytes));
   if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new fleet.HttpError(400,'Solicitação inválida.');
   input=parsed;
  }
  let result:unknown;
  if(req.method==='GET'&&path==='catalog')result=await fleet.catalog();
  else if(req.method==='GET'&&path==='availability')result=await fleet.availability(url.searchParams.get('start')||'',url.searchParams.get('end')||'');
  else if(req.method==='POST'&&path==='quote')result=await fleet.quote(input);
  else if(req.method==='POST'&&path==='reservations'){
   validateMinimalContact(input.contact);
   if(input.whatsapp_consent!==true)throw new fleet.HttpError(400,'Autorize os avisos operacionais desta reserva.');
   if(!await rental.db().prepare('SELECT id FROM reservations WHERE request_key=?').bind(String(input.request_key||'')).first())await limitPublicReservations(req);
   const reserved=await fleet.reserve(input);
   result={...reserved,contact_saved:true,delivery:await prepareMessages(reserved,input.contact)};
  }
  else if(req.method==='POST'&&path==='contact')result=await registerWhatsAppContact(input);
  else if(req.method==='POST'&&path==='documents/send')throw new fleet.HttpError(410,'O cadastro completo e o envio por e-mail foram encerrados. Use o contato mínimo da reserva.');
  else if(req.method==='POST'&&path==='admin/documents/send')throw new fleet.HttpError(410,'Envio por e-mail encerrado. Use os avisos pelo WhatsApp da reserva.');
  else if(req.method==='GET'&&path==='admin/private-documents'){
   const value=await privateData.listPrivateDocumentsForOwner(url.searchParams.get('reservation_id')||'');
   result={documents:value.documents.map(document=>({...document,url:'/api/fleet/admin/private-documents/'+document.id}))};
  }
  else if(req.method==='GET'&&path==='admin/customer-data'){
   const id=url.searchParams.get('reservation_id')||'';
   if(!await rental.db().prepare('SELECT id FROM reservations WHERE id=?').bind(id).first())throw new fleet.HttpError(404,'Reserva não encontrada.');
   const customer=await privateData.readReservationCustomer(id);
   await operations.recordAudit(actor,'private_customer_viewed',id,{});
   result={customer,storage_configured:privateData.privateStorageConfigured()};
  }
  else if(req.method==='POST'&&path==='admin/customer-data')throw new fleet.HttpError(410,'Novos cadastros completos foram encerrados. Use o contato mínimo da reserva.');
  else if(req.method==='GET'&&path==='admin/contact')result={contact:await readMinimalReservationContact(url.searchParams.get('reservation_id')||'')};
  else if(req.method==='POST'&&path==='admin/contact'){
   if(Object.keys(input).some(key=>!['reservation_id','contact','whatsapp_consent'].includes(key)))throw new fleet.HttpError(400,'Informe somente o contato e a autorização desta reserva.');
   result={ok:true,contact:await replaceMinimalReservationContact(String(input.reservation_id||''),input.contact,input.whatsapp_consent===true),message:'Contato registrado. Envios já aceitos ou incertos não são repetidos automaticamente.'};
   if(input.whatsapp_consent===true)await queueOwnerReservationWhatsApp(String(input.reservation_id||''));
  }
  else if(req.method==='POST'&&path==='admin/contact/pending'){
   if(Object.keys(input).some(key=>!['reservation_id','reason'].includes(key)))throw new fleet.HttpError(400,'Informe somente a reserva e a pendência.');
   result=await queuePendingWhatsApp(String(input.reservation_id||''),String(input.reason||''));
   await operations.recordAudit(actor,'reservation_pending',String(input.reservation_id||''),{});
  }
  else if(req.method==='POST'&&path==='admin/contact/revoke'){
   if(Object.keys(input).some(key=>key!=='reservation_id'))throw new fleet.HttpError(400,'Informe somente a reserva.');
   await revokeMinimalReservationConsent(String(input.reservation_id||''));result={ok:true,message:'Avisos desta reserva revogados.'};
  }
  else if(req.method==='GET'&&path==='admin/documents')result=await documents.documentAdmin();
  else if(req.method==='POST'&&path==='admin/documents')result=await documents.saveDocumentVersion(input);
  else if(req.method==='POST'&&path==='admin/customer-reference')throw new fleet.HttpError(410,'O vínculo de novos cadastros externos foi encerrado.');
  else if(req.method==='GET'&&path==='admin'){
   const data=await fleet.adminData();
   const holds=await rental.db().prepare('SELECT id,unit_id,inspection_id,reason,created_ms,created_by,resolved_ms FROM unit_safety_holds WHERE resolved_ms IS NULL ORDER BY created_ms DESC').all();
   result={...data,safety_holds:holds.results||[]};
  }
  else if(req.method==='GET'&&path==='admin/inspections')result=await operations.listInspections(url.searchParams.get('reservation_id')||'');
  else if(req.method==='POST'&&path==='admin/inspections')result=await operations.saveInspection(input,actor);
  else if(req.method==='POST'&&path==='admin/inspection-archive')result=await archiveInspection(input,req.url,actor);
  else if(req.method==='GET'&&path==='admin/operation-records')result=await operations.operationRecords();
  else if(req.method==='POST'&&(path==='admin/operation-record'||path==='admin/operation-records'))result=await operations.saveOperationRecord(input,actor);
  else if(req.method==='POST'&&path==='admin/safety-holds/resolve')result=await operations.resolveSafetyHold(input,actor);
  else if(req.method==='GET'&&path==='admin/audit')result=await operations.auditEvents();
  else if(req.method==='GET'&&path==='admin/notifications')result=await notifications.notificationAdmin();
  else if(req.method==='POST'&&path==='admin/notifications/process')result=await notifications.processOperationalNotifications({limit:Number(input.limit)||20});
  else if(req.method==='POST'&&['admin/notifications/settings','admin/notifications/availability'].includes(path))throw new fleet.HttpError(410,'Campanhas de contas de clientes foram encerradas. Os avisos agora pertencem às reservas.');
  else if(req.method==='POST'&&path==='admin/model')result=await fleet.saveModel(input);
  else if(req.method==='POST'&&path==='admin/unit')result=await fleet.saveUnit(input);
  else if(req.method==='POST'&&path==='admin/settings')result=await fleet.saveSettings(input);
  else if(req.method==='POST'&&path==='admin/block')result=await fleet.addBlock(input);
  else if(req.method==='POST'&&path==='admin/delete-block')result=await fleet.deleteBlock(String(input.id||''));
  else if(req.method==='POST'&&path==='admin/manual-reservation'){
   validateMinimalContact(input.contact);if(input.whatsapp_consent!==true||input.customer_id!==undefined)throw new fleet.HttpError(400,'Use somente contato mínimo e sua autorização.');
   const reserved=await fleet.createManualReservation(input);
   result={...reserved,contact_saved:true,delivery:await prepareMessages(reserved,input.contact)};
  }
  else if(req.method==='POST'&&path==='admin/reservation'){
   const updated=await fleet.updateReservation(input,actor);
   // Operational release succeeds even when the WhatsApp service is unavailable.
   // Its separate result stays visible so an operator can resolve or retry it.
   let sent:DeliveryNotice|undefined;
   if(updated.reservation.status==='ready'){
    try{const notice=await queueReadyWhatsApp(updated.reservation.id);sent={status:notice.queued&&notice.configured?'processing':'not_configured',message:!notice.queued?'Moto liberada. Confira o WhatsApp e a autorização desta reserva.':notice.configured?'Aviso de retirada na fila do WhatsApp.':'Aviso preparado; a conexão WhatsApp ainda precisa ser configurada.'};}
    catch{sent={status:'failed',message:'Operação registrada. Confira a fila de avisos da reserva.'};}
   }
   result={...updated,...(sent?{delivery:sent}:{})};
  }
  else throw new fleet.HttpError(404,'Página não encontrada.');
  const audited=['admin/model','admin/unit','admin/settings','admin/block','admin/delete-block','admin/manual-reservation','admin/reservation','admin/documents','admin/contact','admin/contact/revoke'];
  if(req.method==='POST'&&actor&&audited.includes(path)){
   // Log only operational fields. Full forms, passwords and customer documents
   // must never be copied to the audit payload.
   const safe=Object.fromEntries(['status','payment_status','inspection_id','model_id','unit_id','daily_cents','active'].filter(key=>input[key]!==undefined).map(key=>[key,input[key]]));
   let entityId=typeof input.id==='string'?input.id:typeof input.reservation_id==='string'?input.reservation_id:'';
   if(result&&typeof result==='object'&&'id'in result)entityId=String(result.id);
   if(result&&typeof result==='object'&&'reservation'in result){const reservation=result.reservation as {id?:string};entityId=reservation.id||entityId;}
   try{await operations.recordAudit(actor,path.slice(6).replaceAll('/','_'),entityId,safe);}
   catch{if(result&&typeof result==='object')result={...result,audit_warning:'A alteração foi concluída, mas o registro de auditoria exige conferência.'};}
  }
  return Response.json(result,{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){
  const status=error instanceof fleet.HttpError?error.status:400;
  const message=error instanceof fleet.HttpError||error instanceof DeliveryInputError?error.message:'Não foi possível concluir a operação. Confira os dados e tente novamente.';
  return Response.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
 }
}
export const GET=handle;
export const POST=handle;
