import {env} from 'cloudflare:workers';
import {db,HttpError} from './rental-server';
import {readReservationCustomer} from './private-customer-store';
import {saveMinimalReservationContact,readMinimalReservationContact,validateMinimalContact} from './reservation-contact-server';
import {reservationWhatsAppParts,type ReservationWhatsAppKind} from './reservation-whatsapp';
import {sendWhatsAppTemplate,whatsappConfiguration,type WhatsAppEnvironment} from './whatsapp-server';
import type {OperationalReservation} from './reservation-workflow';

type Row=OperationalReservation&{request_key:string;created_ms:number;customer_id:string};
interface Contact {name:string;phone:string;revision:string;whatsapp_consent:boolean;legacy:boolean}
const environment=()=>env as Cloudflare.Env&WhatsAppEnvironment;
const stmt=(sql:string,args:unknown[]=[])=>db().prepare(sql).bind(...args);
const row=(id:string)=>stmt('SELECT * FROM reservations WHERE id=?',[id]).first<Row>();
function mode(r:Row){try{return JSON.parse(r.terms_snapshot||'{}').contact_mode;}catch{return null;}}
const isSimple=(r:Row)=>['whatsapp','whatsapp_minimal'].includes(mode(r));
const prefix=(r:Row,kind:ReservationWhatsAppKind)=>`wa:${kind}:${r.id}:${kind==='ready'?r.ready_ms:kind==='return_reminder'?r.due_ms:0}:`;

function partsFor(r:Row,kind:ReservationWhatsAppKind){
 const parts=reservationWhatsAppParts(r,kind);
 if(kind==='reservation'&&parts.length){
  try{const url=new URL(environment().WHATSAPP_SITE_URL||environment().APP_PUBLIC_URL||'');if(url.protocol==='https:'&&!url.username&&!url.password&&url.toString().length<=250){const guide=new URL('/api/fleet/care-guide',url).toString();const target=parts[parts.length-1];if(target.text.length+guide.length+20<=900)target.text+=' Guia de cuidados: '+guide;}}catch{/* No invented public URL. */}
 }
 return parts;
}
async function contactFor(r:Row):Promise<Contact|null>{
 const minimal=await readMinimalReservationContact(r.id);
 if(minimal)return {name:minimal.name,phone:minimal.phone,revision:minimal.revision,whatsapp_consent:minimal.whatsapp_consent,legacy:false};
 if(mode(r)!=='whatsapp')return null;
 // Historical encrypted records remain where they were. Only their contact is
 // consulted; no CPF, address or document is copied into the new flow.
 try{const old=await readReservationCustomer(r.id);return old?.phone?{name:old.name||'',phone:old.phone,revision:'legacy',whatsapp_consent:true,legacy:true}:null;}catch{return null;}
}
async function permitted(r:Row,contact:Contact){
 if(!contact.whatsapp_consent)return false;
 const consent=await stmt("SELECT status FROM reservation_document_deliveries WHERE reservation_id=? AND kind='whatsapp_consent'",[r.id]).first<{status:string}>();
 if(consent&&consent.status!=='recorded')return false;
 if(contact.legacy&&!consent)return false;
 if(r.customer_id){const active=await stmt('SELECT id FROM customers WHERE id=? AND disabled=0',[r.customer_id]).first();if(!active)return false;}
 return true;
}
async function queue(r:Row,kind:ReservationWhatsAppKind,pending?:{reason:string;key:string}){
 const contact=await contactFor(r);if(!contact||!await permitted(r,contact))return false;
 if(kind==='ready'&&(r.status!=='ready'||!r.ready_ms||!r.pickup_ms))return false;
 if(kind==='preparing'&&r.status!=='preparing')return false;
 if(kind==='return_reminder'&&(r.status!=='rented'||!r.due_ms||r.due_ms<=Date.now()||r.due_ms>Date.now()+7_200_000))return false;
 if(kind==='pending'&&!['reserved','preparing'].includes(r.status))return false;
 if(['returned','cancelled'].includes(r.status))return false;
 const parts=partsFor(r,kind),group=pending?`wa:pending:${r.id}:${pending.key}:`:prefix(r,kind),base=group+contact.revision+':',now=Date.now();
 // A correction may replace unsent jobs, but any accepted/uncertain part locks
 // the whole event against re-creation at another recipient or revision.
 const tracked=await stmt('SELECT status,contact_revision FROM reservation_document_deliveries WHERE reservation_id=? AND kind=? AND event_key LIKE ?',[r.id,'whatsapp_'+kind,group+'%']).all<{status:string;contact_revision:string}>();
 if((tracked.results||[]).some(job=>['submitted','unknown'].includes(job.status)))return false;
 if((tracked.results||[]).some(job=>['pending','failed','not_configured','sending'].includes(job.status)&&(job.contact_revision===contact.revision||(contact.legacy&&!job.contact_revision))))return true;
 await db().batch([
  stmt("INSERT OR IGNORE INTO reservation_document_deliveries (reservation_id,kind,event_key,status,updated_ms) VALUES (?,'whatsapp_consent',?,'recorded',?)",[r.id,'wa-consent:'+r.id,now]),
  ...parts.map((_,index)=>stmt("INSERT OR IGNORE INTO reservation_document_deliveries (reservation_id,kind,event_key,status,updated_ms,contact_revision,pending_reason) VALUES (?,?,?,'pending',?,?,?)",[r.id,'whatsapp_'+kind,base+String(index).padStart(3,'0'),now,contact.revision,pending?.reason||''])),
 ]);
 return true;
}
export async function registerWhatsAppContact(input:Record<string,unknown>){
 if(Object.keys(input).some(key=>!['reservation_id','delivery_token','contact','whatsapp_consent'].includes(key))||input.whatsapp_consent!==true)throw new HttpError(400,'Autorize as mensagens desta reserva pelo WhatsApp.');
 const r=await row(String(input.reservation_id||''));
 if(!r||typeof input.delivery_token!=='string'||r.request_key!==input.delivery_token||r.created_ms<Date.now()-3_600_000)throw new HttpError(403,'O registro do contato expirou. Fale com a loja informando o número da reserva.');
 if(!isSimple(r)||r.status!=='reserved')throw new HttpError(409,'Esta reserva não permite registrar um novo contato neste fluxo.');
 const contact=validateMinimalContact(input.contact),old=await contactFor(r);
 if(old&&old.phone!==contact.phone)throw new HttpError(409,'O contato desta reserva já foi registrado. Fale com a loja para corrigir.');
 await saveMinimalReservationContact(r.id,contact,true);
 await queue(r,'reservation');
 return reservationWhatsAppNotice(r.id);
}
export async function reservationWhatsAppNotice(id:string){
 const r=await row(id);if(!r)throw new HttpError(404,'Reserva não encontrada.');
 const contact=await contactFor(r),eligible=!!contact&&await permitted(r,contact);
 const configured=whatsappConfiguration(environment()).templates.rental==='configured';
 return {status:!eligible?'pending_contact':configured?'queued':'not_configured',contact_saved:!!contact,message:!eligible?'Sua reserva está registrada. Confira o contato e a autorização com a loja.':configured?'Contato registrado. As mensagens da reserva estão na fila do WhatsApp.':'Contato registrado. A conexão do WhatsApp ainda não está ativa; guarde o número da reserva e converse com a loja.',parts:partsFor(r,'reservation')};
}
export async function queueReadyWhatsApp(id:string){const r=await row(id);const queued=!!r&&isSimple(r)?await queue(r,'ready'):false;return {queued,configured:whatsappConfiguration(environment()).templates.rental==='configured'};}
/** Authenticated owner caller, using a contact whose authorization is stored. */
export async function queueOwnerReservationWhatsApp(id:string){const r=await row(id);return !!r&&isSimple(r)?queue(r,'reservation'):false;}
export async function queuePendingWhatsApp(id:string,reason:unknown){
 if(typeof reason!=='string'||reason.trim().length<5||reason.trim().length>500||/[\x00-\x1f\x7f]/.test(reason))throw new HttpError(400,'Descreva a pendência em 5 a 500 caracteres, sem dados pessoais.');
 const r=await row(id);if(!r||!isSimple(r))throw new HttpError(404,'Reserva não encontrada.');
 if(!['reserved','preparing'].includes(r.status))throw new HttpError(409,'Esta reserva não está aguardando conclusão.');
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(reason.trim())));
 const key=Array.from(digest.subarray(0,12),v=>v.toString(16).padStart(2,'0')).join('');
 const queued=await queue(r,'pending',{reason:reason.trim(),key});
 if(!queued)throw new HttpError(409,'Registre um contato autorizado antes de preparar o aviso.');
 return {queued:true,message:'Aviso de pendência preparado. O motivo fica no painel; o WhatsApp orienta o cliente a concluir o atendimento com a loja.'};
}
export async function simpleWhatsAppAdmin(){
 const rows=await stmt("SELECT d.event_key id,d.reservation_id,r.code reservation_code,d.kind,d.status,d.attempts,d.updated_ms,d.pending_reason FROM reservation_document_deliveries d JOIN reservations r ON r.id=d.reservation_id WHERE d.kind IN ('whatsapp_reservation','whatsapp_ready','whatsapp_preparing','whatsapp_return_reminder','whatsapp_pending') ORDER BY d.updated_ms DESC,d.event_key LIMIT 100").all();
 return rows.results||[];
}
/** No public route sends arbitrary messages or selects a recipient. */
export async function processReservationWhatsApp(limit=20,request:typeof fetch=fetch){
 const now=Date.now(),kinds="'whatsapp_reservation','whatsapp_ready','whatsapp_preparing','whatsapp_return_reminder','whatsapp_pending'";
 await stmt(`UPDATE reservation_document_deliveries SET status='unknown',updated_ms=? WHERE kind IN (${kinds}) AND status='sending' AND lease_ms<?`,[now,now]).run();
 const states=await stmt("SELECT * FROM reservations WHERE status IN ('reserved','preparing','ready','rented') AND json_valid(terms_snapshot) AND json_extract(terms_snapshot,'$.contact_mode') IN ('whatsapp','whatsapp_minimal') ORDER BY start_ms LIMIT 100").all<Row>();
 for(const r of states.results||[])await queue(r,r.status==='reserved'?'reservation':r.status==='ready'?'ready':r.status==='preparing'?'preparing':'return_reminder');
 const rows=await stmt(`SELECT * FROM reservation_document_deliveries WHERE kind IN (${kinds}) AND status IN ('pending','failed','not_configured') AND attempts<5 ORDER BY CASE WHEN kind IN ('whatsapp_ready','whatsapp_return_reminder','whatsapp_pending') THEN 0 WHEN kind='whatsapp_preparing' THEN 1 ELSE 2 END,updated_ms,event_key LIMIT ?`,[Math.max(1,Math.min(50,limit))]).all<{event_key:string;reservation_id:string;kind:string;attempts:number;contact_revision:string}>();
 const totals={submitted:0,not_configured:0,failed:0,unknown:0,cancelled:0};
 for(const job of rows.results||[]){
  const claim=await stmt("UPDATE reservation_document_deliveries SET status='sending',lease_ms=?,updated_ms=? WHERE event_key=? AND status IN ('pending','failed','not_configured') RETURNING event_key",[Date.now()+90_000,Date.now(),job.event_key]).first();if(!claim)continue;
  const record=(status:string,id='')=>stmt('UPDATE reservation_document_deliveries SET status=?,provider_id=?,lease_ms=0,updated_ms=? WHERE event_key=?',[status,id,Date.now(),job.event_key]).run();
  let mayHaveSent=false;
  try{
   const r=await row(job.reservation_id),kind=job.kind.replace(/^whatsapp_/,'') as ReservationWhatsAppKind;
   if(!r||!isSimple(r)||['cancelled','returned'].includes(r.status)||(kind==='reservation'&&r.status==='rented')||(kind==='ready'&&(r.status!=='ready'||!r.pickup_ms||r.pickup_ms<Date.now()-900000||!job.event_key.startsWith(prefix(r,kind))))){await record('cancelled');totals.cancelled++;continue;}
   if((kind==='preparing'&&r.status!=='preparing')||(kind==='pending'&&!['reserved','preparing'].includes(r.status))||(kind==='return_reminder'&&(r.status!=='rented'||!r.due_ms||r.due_ms<=Date.now()||!job.event_key.startsWith(prefix(r,kind))))){await record('cancelled');totals.cancelled++;continue;}
   const contact=await contactFor(r);
   if(!contact||!await permitted(r,contact)||(job.contact_revision?job.contact_revision!==contact.revision:!contact.legacy)){await record('cancelled');totals.cancelled++;continue;}
   if(kind==='ready'){
    const safe=await stmt("SELECT u.id FROM reservations r JOIN units u ON u.id=r.unit_id WHERE r.id=? AND u.status='available' AND NOT EXISTS (SELECT 1 FROM unit_safety_holds h WHERE h.unit_id=u.id AND h.resolved_ms IS NULL)",[r.id]).first();
    if(!safe){await record('cancelled');totals.cancelled++;continue;}
   }
   if(whatsappConfiguration(environment()).templates.rental!=='configured'){await record('not_configured');totals.not_configured++;continue;}
   const parts=partsFor(r,kind),part=parts[Number(job.event_key.split(':').at(-1))];
   if(!part){await record('cancelled');totals.cancelled++;continue;}
   const current=await contactFor(r);
   if(!current||current.revision!==contact.revision||!await permitted(r,current)){await record('cancelled');totals.cancelled++;continue;}
   await stmt('UPDATE reservation_document_deliveries SET attempts=attempts+1 WHERE event_key=?',[job.event_key]).run();mayHaveSent=true;
   const result=await sendWhatsAppTemplate({environment:environment(),to:current.phone,kind:'rental',parameters:[r.code,`${Number(job.event_key.split(':').at(-1))+1}/${parts.length} · ${part.title}`,part.text]},request);
   const status=result.status==='uncertain'?'unknown':result.status;
   await record(status,result.status==='submitted'?result.provider_id:'');totals[status]++;
  }catch{await record(mayHaveSent?'unknown':'failed');totals[mayHaveSent?'unknown':'failed']++;}
 }
 return totals;
}
