import {registerWhatsAppContact,queueReadyWhatsApp,queueOwnerReservationWhatsApp} from '../../../../lib/reservation-whatsapp-server';
import * as fleet from '../../../../lib/fleet-server';
import * as rental from '../../../../lib/rental-server';
import * as documents from '../../../../lib/document-server';
import * as delivery from '../../../../lib/document-delivery-server';
import * as operations from '../../../../lib/operation-records-server';
import * as notifications from '../../../../lib/notification-server';
import * as privateData from '../../../../lib/private-customer-store';
import {inspectionReportResponse,archiveInspection} from '../../../../lib/inspection-archive-server';
import {customerIdentity} from '../../../../lib/customer-auth';
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
   const customer=await customerIdentity(req);
   result=await fleet.reserve(input,false,'',customer?.id||'');
  }
  else if(req.method==='POST'&&path==='contact')result=await registerWhatsAppContact(input);
  else if(req.method==='POST'&&path==='documents/send')result=await delivery.sendCustomerDocument(input,req.url);
  else if(req.method==='POST'&&path==='admin/documents/send')result=await delivery.sendAdminDocument(input,req.url);
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
  else if(req.method==='POST'&&path==='admin/customer-data'){
   if(Object.keys(input).some(key=>!['reservation_id','customer','generate_pdf','whatsapp_consent'].includes(key)))throw new fleet.HttpError(400,'Informe somente a reserva, identificação e opções de documento.');
   if((input.generate_pdf!==undefined&&typeof input.generate_pdf!=='boolean')||(input.whatsapp_consent!==undefined&&typeof input.whatsapp_consent!=='boolean'))throw new fleet.HttpError(400,'Confira as opções de documento e WhatsApp.');
   const id=String(input.reservation_id||'');
   const saved=await privateData.saveReservationCustomer(id,input.customer);
   const document=input.generate_pdf===true?await privateData.savePrivateReservationDocument({reservation:{id},kind:'reservation',fontBytes:await loadPdfFont(req.url)}):null;
   if(input.whatsapp_consent===true)await queueOwnerReservationWhatsApp(id);
   await operations.recordAudit(actor,'private_customer_recorded',id,{});
   result={ok:true,customer_stored:true,document_saved:!!document,customer:saved.customer,...(document?{document_id:document.id}:{})};
  }
  else if(req.method==='GET'&&path==='admin/documents')result=await documents.documentAdmin();
  else if(req.method==='POST'&&path==='admin/documents')result=await documents.saveDocumentVersion(input);
  else if(req.method==='POST'&&path==='admin/customer-reference')result=await documents.linkExternalCustomer(input);
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
  else if(req.method==='POST'&&path==='admin/notifications/process')result=await notifications.processNotifications({limit:Number(input.limit)||20});
  else if(req.method==='POST'&&path==='admin/notifications/settings'){
   if(Object.keys(input).some(key=>key!=='auto_availability')||typeof input.auto_availability!=='boolean')throw new fleet.HttpError(400,'Informe se o aviso automático de disponibilidade está ativado.');
   result=await notifications.saveNotificationSettings({auto_availability:input.auto_availability});
   await operations.recordAudit(actor,'notification_preferences_changed','company',{auto_availability:input.auto_availability===true});
  }
  else if(req.method==='POST'&&path==='admin/notifications/availability')result=await notifications.enqueueAvailabilityCampaign({modelIds:Array.isArray(input.model_ids)?input.model_ids.filter((id):id is string=>typeof id==='string'):[]});
  else if(req.method==='POST'&&path==='admin/model')result=await fleet.saveModel(input);
  else if(req.method==='POST'&&path==='admin/unit')result=await fleet.saveUnit(input);
  else if(req.method==='POST'&&path==='admin/settings')result=await fleet.saveSettings(input);
  else if(req.method==='POST'&&path==='admin/block')result=await fleet.addBlock(input);
  else if(req.method==='POST'&&path==='admin/delete-block')result=await fleet.deleteBlock(String(input.id||''));
  else if(req.method==='POST'&&path==='admin/manual-reservation')result=await fleet.createManualReservation(input);
  else if(req.method==='POST'&&path==='admin/reservation'){
   const updated=await fleet.updateReservation(input,actor);
   // Operational release succeeds even when the email service is unavailable.
   // Its separate result stays visible so an operator can resolve or retry it.
   let sent:delivery.DeliveryNotice|undefined;
   let notificationWarning='';
   try{
    if(updated.reservation.status==='preparing')await notifications.enqueuePreparationNotification(updated.reservation.id);
    if(updated.reservation.status==='ready')await notifications.enqueueReadyNotification(updated.reservation.id);
    if(updated.reservation.status==='rented'){
     await notifications.enqueueReturnReminder(updated.reservation.id);
     await notifications.enqueueCareReminder(updated.reservation.id);
    }
   }catch{notificationWarning='A operação foi registrada, mas os avisos de WhatsApp exigem conferência no painel.';}
   if(updated.reservation.status==='ready'){
    try{
     const minimal=JSON.parse(updated.reservation.terms_snapshot||'{}').contact_mode==='whatsapp';
     const emailRequested=await rental.db().prepare("SELECT event_key FROM reservation_document_deliveries WHERE reservation_id=? AND kind='reservation' AND status='submitted'").bind(updated.reservation.id).first();
     if(minimal&&!emailRequested){const notice=await queueReadyWhatsApp(updated.reservation.id);sent={status:notice.queued&&notice.configured?'processing':'not_configured',message:!notice.queued?'Moto liberada. Falta registrar a identificação e a autorização de WhatsApp desta reserva; confira o cadastro antes de avisar.':notice.configured?'Moto liberada. O aviso está na fila do WhatsApp cadastrado. Nenhum e-mail é necessário.':'Moto liberada. O aviso está preparado, mas a API do WhatsApp ainda precisa ser conectada.'};}
     else sent=await delivery.sendAdminDocument({reservation_id:updated.reservation.id,kind:'pickup_confirmation'},req.url);
    }
    catch{sent={status:'failed',message:'Moto liberada, mas o documento não pôde ser enviado. Confira o envio no painel.'};}
   }
   result={...updated,...(sent?{delivery:sent}:{}),...(notificationWarning?{notification_warning:notificationWarning}:{})};
  }
  else throw new fleet.HttpError(404,'Página não encontrada.');
  const audited=['admin/model','admin/unit','admin/settings','admin/block','admin/delete-block','admin/manual-reservation','admin/reservation','admin/documents','admin/customer-reference'];
  if(req.method==='POST'&&actor&&audited.includes(path)){
   // Log only operational fields. Full forms, passwords and customer documents
   // must never be copied to the audit payload.
   const safe=Object.fromEntries(['status','payment_status','inspection_id','model_id','unit_id','daily_cents','active'].filter(key=>input[key]!==undefined).map(key=>[key,input[key]]));
   let entityId=typeof input.id==='string'?input.id:'';
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
