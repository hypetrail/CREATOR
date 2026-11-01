import {env} from 'cloudflare:workers';
import {db,HttpError} from './rental-server';
import {externalCustomerConfigured,readExternalCustomer,saveExternalCustomer,validateDeliveryCustomer,type DeliveryCustomer,type DeliveryEnvironment} from './customer-delivery';
import {reservationEmailConfigured,sendReservationEmail,type DocumentDeliveryKind} from './reservation-delivery';
import type {PdfReservation} from './reservation-pdf';
import {privateStorageConfigured,privateStorageConfiguration,saveReservationCustomer,readReservationCustomer,savePrivateReservationDocument} from './private-customer-store';
import {loadPdfFont} from './font-server';

type Reservation=PdfReservation&{id:string;request_key:string;created_ms:number;external_customer_system:string;external_customer_ref:string};
type Delivery={status:string;attempts:number;first_attempt_ms:number;lease_ms:number};
export interface DeliveryNotice {status:'submitted'|'already_sent'|'not_configured'|'failed'|'processing'|'uncertain';message:string;customer_linked?:boolean;customer_stored?:boolean;document_saved?:boolean}
const environment=()=>env as Cloudflare.Env&DeliveryEnvironment&{ASSETS?:{fetch(request:Request):Promise<Response>}};
export function deliveryConfiguration(){
 const config=environment();
 return {email:reservationEmailConfigured(config)?'configured':'not_configured',customer_system:externalCustomerConfigured(config)?'configured':'not_configured',...privateStorageConfiguration()};
}
const getReservation=(id:unknown)=>db().prepare('SELECT * FROM reservations WHERE id=?').bind(String(id||'')).first<Reservation>();
const notice=(status:DeliveryNotice['status'],message:string):DeliveryNotice=>({status,message});
const notConfigured=()=>notice('not_configured','O envio de e-mail ainda não foi conectado. Sua reserva continua registrada; baixe o PDF e entre em contato com a loja.');
const uncertain=()=>notice('uncertain','O serviço não confirmou o resultado do envio. A equipe deve conferir a pasta Enviados antes de tentar novamente; a repetição automática foi bloqueada.');

function kindOf(value:unknown):DocumentDeliveryKind{
 if(value!=='reservation'&&value!=='pickup_confirmation')throw new HttpError(400,'Tipo de documento inválido.');
 return value;
}
function validState(row:Reservation,kind:DocumentDeliveryKind){
 if(['cancelled','returned'].includes(row.status))throw new HttpError(409,'Esta reserva foi encerrada.');
 if(kind==='pickup_confirmation'&&(row.status!=='ready'||!row.ready_ms||!row.pickup_ms))throw new HttpError(409,'Libere a moto antes de enviar a confirmação de retirada.');
}
const eventKey=(row:Reservation,kind:DocumentDeliveryKind)=>`${kind}:${row.id}${kind==='pickup_confirmation'?':'+row.ready_ms:''}`;

async function send(row:Reservation,kind:DocumentDeliveryKind,requestUrl:string,suppliedCustomer?:DeliveryCustomer):Promise<DeliveryNotice>{
 validState(row,kind);
 const config=environment(),key=eventKey(row,kind),now=Date.now();
 const previous=await db().prepare('SELECT status,attempts,first_attempt_ms,lease_ms FROM reservation_document_deliveries WHERE event_key=?').bind(key).first<Delivery>();
 if(previous?.status==='submitted')return notice('already_sent','Este documento já foi aceito pelo serviço de e-mail. Confira a caixa de entrada e spam.');
 if(previous?.status==='unknown')return uncertain();
 if(previous?.status==='sending'&&previous.lease_ms<now){
  await db().prepare("UPDATE reservation_document_deliveries SET status='unknown',updated_ms=? WHERE event_key=? AND status='sending' AND lease_ms<?").bind(now,key,now).run();
  return uncertain();
 }
 if(!reservationEmailConfigured(config))return notConfigured();
 if(!suppliedCustomer&&(!externalCustomerConfigured(config)||!row.external_customer_ref))return notice('not_configured','O contato do cliente ainda não está disponível no sistema externo. Conecte o cadastro para enviar o documento com a identificação completa.');
 if(previous&&(previous.attempts>=5||(previous.first_attempt_ms>0&&previous.first_attempt_ms<now-23*3_600_000)))return notice('failed','O limite de tentativas foi atingido. A equipe deve conferir o envio no serviço de e-mail.');
 await db().prepare("INSERT OR IGNORE INTO reservation_document_deliveries (reservation_id,kind,event_key,status,updated_ms) VALUES (?,?,?,'pending',?)").bind(row.id,kind,key,now).run();
 // Never reclaim a send in progress: a crashed request may already have sent it.
 const claimed=await db().prepare("UPDATE reservation_document_deliveries SET status='sending',attempts=attempts+1,lease_ms=?,first_attempt_ms=CASE WHEN first_attempt_ms=0 THEN ? ELSE first_attempt_ms END,updated_ms=? WHERE event_key=? AND attempts<5 AND status IN ('pending','failed','not_configured') RETURNING event_key").bind(now+90_000,now,now,key).first();
 if(!claimed)return notice('processing','O envio deste documento já está em processamento. Aguarde antes de repetir.');
 const record=async(status:string,providerId='')=>{await db().prepare('UPDATE reservation_document_deliveries SET status=?,provider_id=?,lease_ms=0,updated_ms=? WHERE event_key=?').bind(status,providerId,Date.now(),key).run();};
 let providerMayHaveSent=false;
 try{
  let customer=suppliedCustomer;
  if(!customer){
   const external=await readExternalCustomer({environment:config,reference:row.external_customer_ref,system:row.external_customer_system});
   if(external.status!=='loaded'){await record('failed');return notice('failed','Não foi possível consultar o cadastro externo. A reserva permanece registrada; a equipe pode tentar o envio novamente.');}
   customer=external.customer;
  }
  // Fetch only a static font; customer data never appears in this request.
  const font=await loadPdfFont(requestUrl);
  const current=await getReservation(row.id);
  if(!current){await record('failed');return notice('failed','A reserva não está mais disponível para este envio.');}
  validState(current,kind);
  if(eventKey(current,kind)!==key){await record('failed');return notice('failed','A liberação da moto mudou. Atualize a reserva antes de enviar.');}
  providerMayHaveSent=true;
  const result=await sendReservationEmail({environment:config,reservation:current,customer,fontBytes:font,kind,idempotencyKey:key});
  if(result.status==='submitted'){
   await record('submitted',result.provider_id);
   return notice('submitted','Documento aceito pelo serviço de e-mail. Confira a caixa de entrada e spam; a entrega ainda depende do serviço.');
  }
  if(result.reason==='email_delivery_uncertain'){await record('unknown');return uncertain();}
  await record(result.status==='not_configured'?'not_configured':'failed');
  return result.status==='not_configured'?notConfigured():notice('failed','O serviço não aceitou o envio. A reserva continua registrada e a equipe pode tentar novamente.');
 }catch{
  // An exception after contacting a provider could hide a successful send.
  // Preserve an uncertain result instead of automatically sending twice.
  await record(providerMayHaveSent?'unknown':'failed');
  return providerMayHaveSent?uncertain():notice('failed','Não foi possível preparar o documento. A reserva continua registrada e o envio pode ser tentado novamente.');
 }
}

/** Save an immutable protected copy before contacting a communication provider. */
async function deliver(row:Reservation,kind:DocumentDeliveryKind,requestUrl:string,supplied?:DeliveryCustomer):Promise<DeliveryNotice>{
 let customer=supplied,customerStored=false,documentSaved=false;
 if(privateStorageConfigured()){
  try{
   const frozen=await readReservationCustomer(row.id);
   if(frozen)customer=frozen;
   else if(customer)customer=(await saveReservationCustomer(row.id,customer)).customer;
   if(customer){
    customerStored=true;
    await savePrivateReservationDocument({reservation:{id:row.id},kind,fontBytes:await loadPdfFont(requestUrl)});
    documentSaved=true;
   }
  }catch{
   return {status:'failed',customer_stored:customerStored,document_saved:documentSaved,message:customerStored?'O cadastro foi guardado, mas não foi possível guardar o PDF protegido. Sua reserva continua registrada; tente novamente ou fale com a loja.':'Não foi possível guardar a identificação em área protegida. Sua reserva continua registrada; confira os dados e tente novamente.'};
  }
 }
 const result=await send(row,kind,requestUrl,customer);
 return {...result,customer_stored:customerStored,document_saved:documentSaved};
}

/** Public capability is returned only to the originating reservation request. */
export async function sendCustomerDocument(input:Record<string,unknown>,requestUrl:string):Promise<DeliveryNotice>{
 if(Object.keys(input).some(key=>!['reservation_id','delivery_token','customer'].includes(key)))throw new HttpError(400,'Envie somente a identificação para o documento.');
 const row=await getReservation(input.reservation_id);
 if(!row||typeof input.delivery_token!=='string'||input.delivery_token!==row.request_key||row.created_ms<Date.now()-3_600_000)throw new HttpError(403,'Este envio expirou. Entre em contato com a loja informando o número da reserva.');
 const customer=validateDeliveryCustomer(input.customer);
 validState(row,'reservation');
 if(privateStorageConfigured())return deliver(row,'reservation',requestUrl,customer);
 const initial=await db().prepare("SELECT status FROM reservation_document_deliveries WHERE event_key=?").bind(eventKey(row,'reservation')).first<{status:string}>();
 // The originating public request cannot replace the contact after submission.
 if(initial?.status==='submitted'||initial?.status==='unknown')return deliver(row,'reservation',requestUrl,customer);
 let linked=!!row.external_customer_ref;
 if(!linked&&externalCustomerConfigured(environment())){
  const linkKey='customer_registration:'+row.id,now=Date.now();
  await db().prepare("INSERT OR IGNORE INTO reservation_document_deliveries (reservation_id,kind,event_key,status,updated_ms) VALUES (?,'customer_registration',?,'pending',?)").bind(row.id,linkKey,now).run();
  const claim=await db().prepare("UPDATE reservation_document_deliveries SET status='linking',attempts=attempts+1,lease_ms=?,updated_ms=? WHERE event_key=? AND attempts<5 AND (status IN ('pending','failed') OR (status='linking' AND lease_ms<?)) RETURNING event_key").bind(now+30_000,now,linkKey,now).first();
  if(!claim){
   const current=await getReservation(row.id);
   if(current?.external_customer_ref)return {...await deliver(current,'reservation',requestUrl),customer_linked:true};
   return notice('processing','A ficha já está sendo encaminhada ao cadastro externo. Aguarde e confira o envio novamente.');
  }
  const saved=await saveExternalCustomer({environment:environment(),reservationId:row.id,customer});
  if(saved.status==='linked'){
   await db().prepare('UPDATE reservations SET external_customer_system=?,external_customer_ref=? WHERE id=?').bind(saved.system,saved.reference,row.id).run();
   row.external_customer_system=saved.system;row.external_customer_ref=saved.reference;linked=true;
  }
  await db().prepare('UPDATE reservation_document_deliveries SET status=?,lease_ms=0,updated_ms=? WHERE event_key=?').bind(linked?'linked':'failed',Date.now(),linkKey).run();
 }
 const result=await deliver(row,'reservation',requestUrl,linked?undefined:customer);
 return {...result,customer_linked:linked,message:result.message+(!linked?' O cadastro externo ainda não foi vinculado; o aviso posterior de retirada precisa desse contato.':'')};
}
/** Owner-only route; load the recipient from the configured external system. */
export async function sendAdminDocument(input:Record<string,unknown>,requestUrl:string):Promise<DeliveryNotice>{
 if(Object.keys(input).some(key=>!['reservation_id','kind'].includes(key)))throw new HttpError(400,'Informe somente a reserva e o tipo de documento.');
 const row=await getReservation(input.reservation_id);
 if(!row)throw new HttpError(404,'Reserva não encontrada.');
 return deliver(row,kindOf(input.kind),requestUrl);
}
