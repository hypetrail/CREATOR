import {env} from 'cloudflare:workers';
import {phone} from './rental';
import {db,HttpError} from './rental-server';
import {saveReservationCustomer,readReservationCustomer} from './private-customer-store';
import {reservationWhatsAppParts,type ReservationWhatsAppKind} from './reservation-whatsapp';
import {sendWhatsAppTemplate,whatsappConfiguration,type WhatsAppEnvironment} from './whatsapp-server';
import type {OperationalReservation} from './reservation-workflow';

type Row=OperationalReservation&{request_key:string;created_ms:number;customer_id:string};
const environment=()=>env as Cloudflare.Env&WhatsAppEnvironment;
const stmt=(sql:string,args:unknown[]=[])=>db().prepare(sql).bind(...args);
const row=(id:string)=>stmt('SELECT * FROM reservations WHERE id=?',[id]).first<Row>();
const isSimple=(r:Row)=>{try{return JSON.parse(r.terms_snapshot||'{}').contact_mode==='whatsapp';}catch{return false;}};
const prefix=(r:Row,kind:ReservationWhatsAppKind)=>`wa:${kind}:${r.id}:${kind==='ready'?r.ready_ms:kind==='return_reminder'?r.due_ms:0}:`;
async function queue(r:Row,kind:ReservationWhatsAppKind){
 const consent=await stmt("SELECT event_key FROM reservation_document_deliveries WHERE reservation_id=? AND kind='whatsapp_consent' AND status='recorded'",[r.id]).first();
 if(!consent||!await readReservationCustomer(r.id))return false;
 if(kind==='ready'&&(r.status!=='ready'||!r.ready_ms||!r.pickup_ms))return false;
 if(kind==='preparing'&&r.status!=='preparing')return false;
 if(kind==='return_reminder'&&(r.status!=='rented'||!r.due_ms||r.due_ms<=Date.now()||r.due_ms>Date.now()+7_200_000))return false;
 if(['returned','cancelled'].includes(r.status))return false;
 const parts=reservationWhatsAppParts(r,kind,await readReservationCustomer(r.id)||{}),base=prefix(r,kind);
 const now=Date.now();
 await db().batch(parts.map((_,index)=>stmt("INSERT OR IGNORE INTO reservation_document_deliveries (reservation_id,kind,event_key,status,updated_ms) VALUES (?,?,?,'pending',?)",[r.id,'whatsapp_'+kind,base+String(index).padStart(3,'0'),now])));
 return true;
}
export async function registerWhatsAppContact(input:Record<string,unknown>){
 if(Object.keys(input).some(key=>!['reservation_id','delivery_token','customer','whatsapp_consent'].includes(key))||input.whatsapp_consent!==true)throw new HttpError(400,'Autorize as mensagens desta reserva pelo WhatsApp.');
 const r=await row(String(input.reservation_id||''));
 if(!r||typeof input.delivery_token!=='string'||r.request_key!==input.delivery_token||r.created_ms<Date.now()-3_600_000)throw new HttpError(403,'O cadastro do contato expirou. Fale com a loja informando o número da reserva.');
 if(!isSimple(r)||r.status!=='reserved')throw new HttpError(409,'Esta reserva não permite cadastrar um novo contato neste fluxo.');
 const current=await readReservationCustomer(r.id);
 if(current&&current.phone!==phone((input.customer as Record<string,unknown>)?.phone))throw new HttpError(409,'A identificação desta reserva já foi registrada. Fale com a loja para corrigir.');
 await saveReservationCustomer(r.id,input.customer);
 await stmt("INSERT OR IGNORE INTO reservation_document_deliveries (reservation_id,kind,event_key,status,updated_ms) VALUES (?,'whatsapp_consent',?,'recorded',?)",[r.id,'wa-consent:'+r.id,Date.now()]).run();
 await queue(r,'reservation');
 const configured=whatsappConfiguration(environment()).templates.rental==='configured';
 return {status:configured?'queued':'not_configured',customer_stored:true,contact_saved:true,message:configured?'Cadastro registrado. As mensagens da reserva estão na fila do WhatsApp.':'Cadastro registrado. A conexão do WhatsApp ainda não está ativa; guarde o número da reserva e converse com a loja.',parts:reservationWhatsAppParts(r,'reservation',await readReservationCustomer(r.id)||{})};
}
export async function queueReadyWhatsApp(id:string){const r=await row(id);const queued=!!r&&isSimple(r)?await queue(r,'ready'):false;return {queued,configured:whatsappConfiguration(environment()).templates.rental==='configured'};}
/** Caller must be an authenticated owner and have recorded the identification. */
export async function queueOwnerReservationWhatsApp(id:string){
 const r=await row(id);if(!r||!isSimple(r))return false;
 await stmt("INSERT OR IGNORE INTO reservation_document_deliveries (reservation_id,kind,event_key,status,updated_ms) VALUES (?,'whatsapp_consent',?,'recorded',?)",[id,'wa-consent:'+id,Date.now()]).run();
 return queue(r,'reservation');
}
export async function simpleWhatsAppAdmin(){
 const rows=await stmt("SELECT d.event_key id,d.reservation_id,r.code reservation_code,d.kind,d.status,d.attempts,d.updated_ms FROM reservation_document_deliveries d JOIN reservations r ON r.id=d.reservation_id WHERE d.kind IN ('whatsapp_reservation','whatsapp_ready','whatsapp_preparing','whatsapp_return_reminder') ORDER BY d.updated_ms DESC,d.event_key LIMIT 100").all();
 return rows.results||[];
}
/** No public route sends arbitrary messages or selects a recipient. */
export async function processReservationWhatsApp(limit=20,request:typeof fetch=fetch){
 const now=Date.now();
 await stmt("UPDATE reservation_document_deliveries SET status='unknown',updated_ms=? WHERE kind IN ('whatsapp_reservation','whatsapp_ready','whatsapp_preparing','whatsapp_return_reminder') AND status='sending' AND lease_ms<?",[now,now]).run();
 const ready=await stmt("SELECT * FROM reservations WHERE status IN ('preparing','ready','rented') AND json_valid(terms_snapshot) AND json_extract(terms_snapshot,'$.contact_mode')='whatsapp' ORDER BY start_ms LIMIT 100").all<Row>();
 for(const r of ready.results||[])await queue(r,r.status==='ready'?'ready':r.status==='preparing'?'preparing':'return_reminder');
 const rows=await stmt("SELECT * FROM reservation_document_deliveries WHERE kind IN ('whatsapp_reservation','whatsapp_ready','whatsapp_preparing','whatsapp_return_reminder') AND status IN ('pending','failed','not_configured') AND attempts<5 ORDER BY CASE WHEN kind IN ('whatsapp_ready','whatsapp_return_reminder') THEN 0 WHEN kind='whatsapp_preparing' THEN 1 ELSE 2 END,updated_ms,event_key LIMIT ?",[Math.max(1,Math.min(50,limit))]).all<{event_key:string;reservation_id:string;kind:string;attempts:number}>();
 const totals={submitted:0,not_configured:0,failed:0,unknown:0,cancelled:0};
 for(const job of rows.results||[]){
  const claim=await stmt("UPDATE reservation_document_deliveries SET status='sending',lease_ms=?,updated_ms=? WHERE event_key=? AND status IN ('pending','failed','not_configured') RETURNING event_key",[Date.now()+90_000,Date.now(),job.event_key]).first();if(!claim)continue;
  const record=(status:string,id='')=>stmt('UPDATE reservation_document_deliveries SET status=?,provider_id=?,lease_ms=0,updated_ms=? WHERE event_key=?',[status,id,Date.now(),job.event_key]).run();
  let mayHaveSent=false;
  try{
   const r=await row(job.reservation_id),kind=job.kind.replace(/^whatsapp_/,'') as ReservationWhatsAppKind;
   if(!r||!isSimple(r)||['cancelled','returned'].includes(r.status)||(kind==='reservation'&&r.status==='rented')||(kind==='ready'&&(r.status!=='ready'||!r.pickup_ms||r.pickup_ms<Date.now()-900000||!job.event_key.startsWith(prefix(r,kind))))){await record('cancelled');totals.cancelled++;continue;}
   if((kind==='preparing'&&r.status!=='preparing')||(kind==='return_reminder'&&(r.status!=='rented'||!r.due_ms||r.due_ms<=Date.now()||!job.event_key.startsWith(prefix(r,kind))))){await record('cancelled');totals.cancelled++;continue;}
   if(r.customer_id){const active=await stmt('SELECT id FROM customers WHERE id=? AND disabled=0',[r.customer_id]).first();if(!active){await record('cancelled');totals.cancelled++;continue;}}
   const consent=await stmt("SELECT event_key FROM reservation_document_deliveries WHERE reservation_id=? AND kind='whatsapp_consent' AND status='recorded'",[r.id]).first();
   if(!consent){await record('cancelled');totals.cancelled++;continue;}
   if(kind==='ready'){
    const safe=await stmt("SELECT u.id FROM reservations r JOIN units u ON u.id=r.unit_id WHERE r.id=? AND u.status='available' AND NOT EXISTS (SELECT 1 FROM unit_safety_holds h WHERE h.unit_id=u.id AND h.resolved_ms IS NULL)",[r.id]).first();
    if(!safe){await record('cancelled');totals.cancelled++;continue;}
   }
   if(whatsappConfiguration(environment()).templates.rental!=='configured'){await record('not_configured');totals.not_configured++;continue;}
   const contact=await readReservationCustomer(r.id),part=reservationWhatsAppParts(r,kind,contact||{})[Number(job.event_key.split(':').at(-1))];
   if(!contact||!part){await record('cancelled');totals.cancelled++;continue;}
   await stmt('UPDATE reservation_document_deliveries SET attempts=attempts+1 WHERE event_key=?',[job.event_key]).run();mayHaveSent=true;
   const result=await sendWhatsAppTemplate({environment:environment(),to:contact.phone,kind:'rental',parameters:[r.code,`${Number(job.event_key.split(':').at(-1))+1}/${reservationWhatsAppParts(r,kind,contact).length} · ${part.title}`,part.text]},request);
   const status=result.status==='uncertain'?'unknown':result.status;
   await record(status,result.status==='submitted'?result.provider_id:'');totals[status]++;
  }catch{await record(mayHaveSent?'unknown':'failed');totals[mayHaveSent?'unknown':'failed']++;}
 }
 return totals;
}
