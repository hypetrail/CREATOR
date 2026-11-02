import {db,HttpError} from './rental-server';
import {phone as normalizePhone} from './rental';

export interface MinimalContactInput {phone:string;name?:string}
export interface MinimalReservationContact {
 reservation_id:string;name:string;phone:string;revision:string;consent_version:string;
 consent_ms:number;revoked_ms:number|null;created_ms:number;updated_ms:number;whatsapp_consent:boolean;
}
const CONSENT_VERSION='reservation-whatsapp-minimal-v1';
const statement=(sql:string,args:unknown[]=[])=>db().prepare(sql).bind(...args);
export function validateMinimalContact(raw:unknown):Required<MinimalContactInput>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['phone','name'].includes(key)))throw new HttpError(400,'Informe somente o WhatsApp e, se desejar, seu nome.');
 const value=raw as Record<string,unknown>;
 if(typeof value.phone!=='string'||value.phone.length>30||!/^[+\d\s().-]+$/.test(value.phone))throw new HttpError(400,'Informe um WhatsApp brasileiro válido com DDD.');
 if(value.name!==undefined&&typeof value.name!=='string')throw new HttpError(400,'Confira o nome informado.');
 const name=String(value.name||'').trim();
 if(name.length>100||/[\x00-\x1f\x7f]/.test(name))throw new HttpError(400,'Use até 100 caracteres no nome.');
 let phone:string;try{phone=normalizePhone(value.phone);}catch{throw new HttpError(400,'Informe um WhatsApp brasileiro válido com DDD.');}
 return {name,phone};
}
/** May be combined with the stock allocation in one D1 batch transaction. */
export function createMinimalContactStatement(reservationId:string,raw:MinimalContactInput,consent=true):D1PreparedStatement{
 if(consent!==true)throw new HttpError(400,'Autorize os avisos operacionais desta reserva.');
 const contact=validateMinimalContact(raw),now=Date.now(),revision=crypto.randomUUID();
 return statement(`INSERT OR IGNORE INTO reservation_contacts
 (reservation_id,name,phone,revision,consent_version,consent_ms,revoked_ms,created_ms,updated_ms)
 SELECT id,?,?,?,?,?,NULL,?,? FROM reservations WHERE id=?`,[contact.name,contact.phone,revision,CONSENT_VERSION,now,now,now,reservationId]);
}
export async function readMinimalReservationContact(reservationId:string):Promise<MinimalReservationContact|null>{
 const row=await statement('SELECT * FROM reservation_contacts WHERE reservation_id=?',[reservationId]).first<Omit<MinimalReservationContact,'whatsapp_consent'>>();
 return row?{...row,whatsapp_consent:row.revoked_ms===null&&row.consent_ms>0}:null;
}
export async function saveMinimalReservationContact(reservationId:string,raw:unknown,consent=true){
 const contact=validateMinimalContact(raw);
 if(consent!==true)throw new HttpError(400,'Autorize os avisos operacionais desta reserva.');
 if(!await statement('SELECT id FROM reservations WHERE id=?',[reservationId]).first())throw new HttpError(404,'Reserva não encontrada.');
 const old=await readMinimalReservationContact(reservationId);
 if(old){if(old.phone!==contact.phone)throw new HttpError(409,'O contato desta reserva já foi registrado. Fale com a loja para corrigir.');if(!old.whatsapp_consent)throw new HttpError(409,'Os avisos desta reserva foram desativados. Fale com a loja.');return old;}
 await createMinimalContactStatement(reservationId,contact,true).run();
 const saved=await readMinimalReservationContact(reservationId);
 if(!saved||saved.phone!==contact.phone)throw new HttpError(409,'O contato mudou durante o atendimento. Fale com a loja.');
 return saved;
}
/** Owner-only caller. Old accepted/uncertain deliveries are never replayed. */
export async function replaceMinimalReservationContact(reservationId:string,raw:unknown,consent:boolean){
 const contact=validateMinimalContact(raw);if(typeof consent!=='boolean')throw new HttpError(400,'Confira a autorização dos avisos.');
 const old=await readMinimalReservationContact(reservationId);
 if(!old){
  const revision=crypto.randomUUID(),now=Date.now();
  await statement(`INSERT OR IGNORE INTO reservation_contacts (reservation_id,name,phone,revision,consent_version,consent_ms,revoked_ms,created_ms,updated_ms)
   SELECT id,?,?,?,?,?,?,?,? FROM reservations WHERE id=? AND NOT EXISTS (SELECT 1 FROM reservation_document_deliveries WHERE reservation_id=? AND status='sending')`,[contact.name,contact.phone,revision,CONSENT_VERSION,consent?now:0,consent?null:now,now,now,reservationId,reservationId]).run();
  const saved=await readMinimalReservationContact(reservationId);
  if(!saved||saved.revision!==revision)throw new HttpError(409,'A reserva está em envio ou o contato mudou. Atualize antes de corrigir.');
  return saved;
 }
 if(old.phone===contact.phone&&old.whatsapp_consent&&consent){await statement('UPDATE reservation_contacts SET name=?,updated_ms=? WHERE reservation_id=? AND revision=?',[contact.name,Date.now(),reservationId,old.revision]).run();return readMinimalReservationContact(reservationId);}
 const revision=crypto.randomUUID(),now=Date.now();
 await db().batch([
  statement(`UPDATE reservation_contacts SET name=?,phone=?,revision=?,consent_version=?,consent_ms=?,revoked_ms=?,updated_ms=?
   WHERE reservation_id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM reservation_document_deliveries WHERE reservation_id=? AND status='sending')`,[contact.name,contact.phone,revision,CONSENT_VERSION,consent?now:old.consent_ms,consent?null:now,now,reservationId,old.revision,reservationId]),
  statement(`UPDATE reservation_document_deliveries SET status='cancelled',updated_ms=? WHERE reservation_id=? AND kind LIKE 'whatsapp_%' AND kind!='whatsapp_consent' AND status IN ('pending','failed','not_configured') AND EXISTS (SELECT 1 FROM reservation_contacts WHERE reservation_id=? AND revision=?)`,[now,reservationId,reservationId,revision]),
  statement(`UPDATE reservation_document_deliveries SET status=?,updated_ms=? WHERE reservation_id=? AND kind='whatsapp_consent' AND EXISTS (SELECT 1 FROM reservation_contacts WHERE reservation_id=? AND revision=?)`,[consent?'recorded':'revoked',now,reservationId,reservationId,revision]),
 ]);
 const saved=await readMinimalReservationContact(reservationId);
 if(saved?.revision!==revision)throw new HttpError(409,'Há envio em processamento ou outra alteração no contato. Aguarde e atualize antes de corrigir.');
 return saved;
}
export async function revokeMinimalReservationConsent(reservationId:string){
 const now=Date.now();
 await db().batch([
  statement('UPDATE reservation_contacts SET revoked_ms=?,updated_ms=? WHERE reservation_id=?',[now,now,reservationId]),
  statement("UPDATE reservation_document_deliveries SET status='revoked',updated_ms=? WHERE reservation_id=? AND kind='whatsapp_consent'",[now,reservationId]),
  statement("UPDATE reservation_document_deliveries SET status='cancelled',updated_ms=? WHERE reservation_id=? AND kind LIKE 'whatsapp_%' AND kind!='whatsapp_consent' AND status IN ('pending','failed','not_configured')",[now,reservationId]),
 ]);
 return {ok:true,message:'Avisos operacionais desta reserva desativados. Envios já aceitos ou incertos não podem ser desfeitos.'};
}
