import {processReservationWhatsApp,simpleWhatsAppAdmin} from './reservation-whatsapp-server';
import {env} from 'cloudflare:workers';
import {db,HttpError} from './rental-server';
import {sendWhatsAppTemplate,whatsappConfiguration,type WhatsAppEnvironment,type WhatsAppKind} from './whatsapp-server';

const HOUR=3_600_000,DAY=24*HOUR,WEEK=7*DAY;
const environment=()=>env as Cloudflare.Env&WhatsAppEnvironment;
interface Customer {id:string;phone:string;phone_verified:number;service_consent:number;marketing_consent:number;disabled:number}
interface Booking {id:string;code:string;customer_id:string;model_name:string;color_name:string;status:string;start_ms:number;end_ms:number;actual_start_ms:number|null;due_ms:number|null;pickup_ms:number|null;ready_ms:number|null;terms_snapshot:string}
interface Notification {id:string;customer_id:string;reservation_id:string;kind:WhatsAppKind;event_key:string;scheduled_ms:number;payload:string;status:string;attempts:number;lease_ms:number;created_ms:number}
interface EnqueueEvent {customerId:string;reservationId?:string;kind:WhatsAppKind;dedupeKey:string;scheduledMs:number;payload?:Record<string,unknown>}
type EnqueueResult={status:'queued'|'exists'|'skipped';id?:string};
const kinds:WhatsAppKind[]=['preparing','ready','return_reminder','availability','care'];
const operational=(kind:WhatsAppKind)=>kind!=='availability';
const stmt=(sql:string,args:unknown[]=[])=>db().prepare(sql).bind(...args);
const first=<T>(sql:string,args:unknown[]=[])=>stmt(sql,args).first<T>();
const all=async<T>(sql:string,args:unknown[]=[])=>((await stmt(sql,args).all<T>()).results||[]);
const customer=(id:string)=>first<Customer>('SELECT id,phone,phone_verified,service_consent,marketing_consent,disabled FROM customers WHERE id=?',[id]);
const booking=(id:string)=>first<Booking>('SELECT id,code,customer_id,model_name,color_name,status,start_ms,end_ms,actual_start_ms,due_ms,pickup_ms,ready_ms,terms_snapshot FROM reservations WHERE id=?',[id]);
const entitled=(row:Customer|null,kind:WhatsAppKind)=>!!row&&row.disabled===0&&row.phone_verified===1&&(operational(kind)?row.service_consent===1:row.marketing_consent===1);
const formatDate=(value:number)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(value);
async function notificationSettings(){
 const rows=await all<{key:string;value:string}>("SELECT key,value FROM settings WHERE key IN ('rentals_enabled','notify_auto_availability')");
 const values=Object.fromEntries(rows.map(row=>[row.key,row.value]));
 return {rentals_enabled:values.rentals_enabled==='true',auto_availability:values.notify_auto_availability!=='false'};
}
export async function saveNotificationSettings(input:{auto_availability:boolean}){
 if(!input||Object.keys(input).some(key=>key!=='auto_availability')||typeof input.auto_availability!=='boolean')throw new HttpError(400,'Informe se os avisos automáticos de disponibilidade estão ativos.');
 await stmt("INSERT INTO settings (key,value) VALUES ('notify_auto_availability',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[String(input.auto_availability)]).run();
 return {ok:true,auto_availability:input.auto_availability,message:input.auto_availability?'Avisos automáticos ativos para contatos verificados que aceitaram ofertas.':'Novos avisos automáticos de disponibilidade desativados.'};
}
function reminderMinutes(){const value=Number(environment().RETURN_REMINDER_MINUTES||120);return Number.isInteger(value)&&value>=15&&value<=1440?value:120;}
function payloadFor(kind:WhatsAppKind,raw:Record<string,unknown>={}){
 if(kind!=='availability')return '{}';
 const values=Array.isArray(raw.model_ids)?raw.model_ids:[];
 const model_ids=values.filter((id):id is string=>typeof id==='string'&&/^[a-z][a-z0-9-]{1,60}$/.test(id)).slice(0,30);
 return JSON.stringify({model_ids:[...new Set(model_ids)]});
}

/** Internal/owner callers only. Do not pass public recipients or arbitrary text. */
export async function enqueueNotification(event:EnqueueEvent):Promise<EnqueueResult>{
 if(!kinds.includes(event.kind)||!/^[a-zA-Z0-9_.:-]{1,220}$/.test(event.dedupeKey)||!event.customerId||!Number.isSafeInteger(event.scheduledMs))throw new HttpError(400,'Evento de comunicação inválido.');
 if(event.reservationId&&['ready','preparing','care','return_reminder'].includes(event.kind)){const r=await booking(event.reservationId);try{if(r&&JSON.parse(r.terms_snapshot||'{}').contact_mode==='whatsapp')return {status:'skipped'};}catch{}}
 const recipient=await customer(event.customerId);
 if(!entitled(recipient,event.kind))return {status:'skipped'};
 if(event.kind!=='availability'){
  const reservation=event.reservationId?await booking(event.reservationId):null;
  if(!reservation||reservation.customer_id!==event.customerId)return {status:'skipped'};
 }
 const now=Date.now(),id=crypto.randomUUID(),payload=payloadFor(event.kind,event.payload);
 // The rolling window is checked in the same statement that creates a campaign
 // event; two concurrent campaigns cannot both occupy the customer's window.
 const inserted=await first<{id:string}>(`INSERT OR IGNORE INTO customer_notifications (id,customer_id,reservation_id,kind,event_key,scheduled_ms,payload,status,created_ms,updated_ms)
 SELECT ?,?,?,?,?,?,?,'pending',?,? WHERE ?!='availability' OR NOT EXISTS (SELECT 1 FROM customer_notifications WHERE customer_id=? AND kind='availability' AND (status IN ('pending','sending','not_configured','failed') OR (status='submitted' AND COALESCE(submitted_ms,updated_ms)>=?) OR (status='unknown' AND updated_ms>=?))) RETURNING id`,[id,event.customerId,event.reservationId||'',event.kind,event.dedupeKey,event.scheduledMs,payload,now,now,event.kind,event.customerId,now-WEEK,now-WEEK]);
 if(inserted)return {status:'queued',id:inserted.id};
 const existing=await first<{id:string}>('SELECT id FROM customer_notifications WHERE event_key=?',[event.dedupeKey]);
 return existing?{status:'exists',id:existing.id}:{status:'skipped'};
}
export async function enqueueReadyNotification(reservationId:string){
 const row=await booking(reservationId);
 if(!row||row.status!=='ready'||!row.customer_id||!row.ready_ms||!row.pickup_ms)return {status:'skipped'} as EnqueueResult;
 return enqueueNotification({customerId:row.customer_id,reservationId:row.id,kind:'ready',dedupeKey:`ready:${row.id}:${row.ready_ms}`,scheduledMs:Date.now()});
}
export async function enqueuePreparationNotification(reservationId:string){
 const row=await booking(reservationId);
 if(!row||row.status!=='preparing'||!row.customer_id)return {status:'skipped'} as EnqueueResult;
 return enqueueNotification({customerId:row.customer_id,reservationId:row.id,kind:'preparing',dedupeKey:`preparing:${row.id}`,scheduledMs:Date.now()});
}
export async function enqueueReturnReminder(reservationId:string){
 const row=await booking(reservationId);
 if(!row||row.status!=='rented'||!row.customer_id||!row.actual_start_ms||!row.due_ms)return {status:'skipped'} as EnqueueResult;
 return enqueueNotification({customerId:row.customer_id,reservationId:row.id,kind:'return_reminder',dedupeKey:`return:${row.id}:${row.due_ms}`,scheduledMs:Math.max(row.actual_start_ms,row.due_ms-reminderMinutes()*60_000)});
}
export async function enqueueCareReminder(reservationId:string){
 const row=await booking(reservationId);
 if(!row||row.status!=='rented'||!row.customer_id||!row.actual_start_ms)return {status:'skipped'} as EnqueueResult;
 return enqueueNotification({customerId:row.customer_id,reservationId:row.id,kind:'care',dedupeKey:`care:${row.id}:${row.actual_start_ms}`,scheduledMs:row.actual_start_ms+5*60_000});
}

/** Invoked by the opted-in scheduler or owner; a catalogue GET never sends. */
export async function enqueueAvailabilityCampaign(input:{modelIds?:string[]}={}){
 if(input.modelIds!==undefined&&(!Array.isArray(input.modelIds)||input.modelIds.length>30||input.modelIds.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{1,60}$/.test(id))))throw new HttpError(400,'Selecione os modelos da campanha.');
 if(!(await notificationSettings()).rentals_enabled)return {queued:0,skipped:0,message:'As reservas públicas estão fechadas; nenhum aviso de disponibilidade foi preparado.'};
 const models=await currentlyAvailableModels(input.modelIds||[]);
 if(!models.length)return {queued:0,skipped:0,message:'Não há unidades disponíveis para o período de referência da campanha.'};
 const people=await all<{id:string}>('SELECT id FROM customers WHERE disabled=0 AND phone_verified=1 AND marketing_consent=1 LIMIT 1000');
 let queued=0,skipped=0;const campaignId=crypto.randomUUID();
 for(const person of people){
  const result=await enqueueNotification({customerId:person.id,kind:'availability',dedupeKey:`availability:${person.id}:${campaignId}`,scheduledMs:Date.now(),payload:{model_ids:models.map(model=>model.id)}});
  if(result.status==='queued')queued++;else skipped++;
 }
 return {queued,skipped,message:'Campanha registrada somente para contatos verificados com autorização de ofertas. Limite de um aviso de disponibilidade por sete dias.'};
}

// A current-time, conservative stock check for a two-day booking. The actual
// booking always requotes the chosen dates. This is not an allocation promise.
async function currentlyAvailableModels(modelIds:string[]=[]){
 const now=Date.now(),end=now+2*DAY;
 const rows=await all<{id:string;name:string}>(`SELECT DISTINCT m.id,m.name FROM rental_models m JOIN units u ON u.model_id=m.id
 WHERE m.active=1 AND m.daily_cents>0 AND u.status='available'
 AND NOT EXISTS (SELECT 1 FROM unit_safety_holds h WHERE h.unit_id=u.id AND h.resolved_ms IS NULL)
 AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.unit_id=u.id AND b.start_ms<? AND b.end_ms>?)
 AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=u.id AND (
 r.status='rented' OR
 (r.status IN ('reserved','preparing','ready') AND r.start_ms<? AND COALESCE(r.due_ms,r.end_ms)+10800000>?) OR
 (r.status='returned' AND COALESCE(r.actual_end_ms,r.end_ms)+10800000>?))) ORDER BY m.name`,[end,now,end+3*HOUR,now,now]);
 return modelIds.length?rows.filter(row=>modelIds.includes(row.id)):rows;
}
function companyAddress(row:Booking){try{const value=JSON.parse(row.terms_snapshot||'{}').address;return typeof value==='string'&&value.length<=500?value:'Consulte o endereço no documento da reserva';}catch{return 'Consulte o endereço no documento da reserva';}}
function siteUrl(){try{const url=new URL(environment().WHATSAPP_SITE_URL||environment().APP_PUBLIC_URL||'');return url.protocol==='https:'&&!url.username&&!url.password?url.toString():null;}catch{return null;}}
async function parameters(row:Notification,now:number):Promise<{parameters:string[]}|{cancel:string}|{configuration:string}>{
 if(row.kind==='availability'){
  if(!(await notificationSettings()).rentals_enabled)return {cancel:'rentals_closed'};
  let payload:{model_ids?:string[]}={};try{payload=JSON.parse(row.payload);}catch{return {cancel:'invalid_payload'};}
  const models=await currentlyAvailableModels(payload.model_ids||[]),url=siteUrl();
  if(!models.length)return {cancel:'stock_unavailable'};
  if(!url)return {configuration:'site_url_not_configured'};
  const another=await first("SELECT id FROM customer_notifications WHERE customer_id=? AND kind='availability' AND id!=? AND (status='sending' OR (status='submitted' AND COALESCE(submitted_ms,updated_ms)>=?) OR (status='unknown' AND updated_ms>=?))",[row.customer_id,row.id,now-WEEK,now-WEEK]);
  if(another)return {cancel:'marketing_frequency_limit'};
  return {parameters:[models.map(model=>model.name).join(', ').slice(0,400),url]};
 }
 const reservation=await booking(row.reservation_id);
 if(!reservation||reservation.customer_id!==row.customer_id)return {cancel:'reservation_unavailable'};
 if(row.kind==='preparing'){
  if(reservation.status!=='preparing')return {cancel:'preparation_status_changed'};
  return {parameters:[reservation.code,reservation.model_name,reservation.color_name||'Conforme unidade']};
 }
 if(row.kind==='ready'){
  if(reservation.status!=='ready'||!reservation.ready_ms||!reservation.pickup_ms||row.event_key!==`ready:${reservation.id}:${reservation.ready_ms}`||reservation.pickup_ms<now-15*60_000)return {cancel:'pickup_release_changed'};
  const safe=await first(`SELECT u.id FROM reservations r JOIN units u ON u.id=r.unit_id WHERE r.id=? AND u.status='available' AND NOT EXISTS (SELECT 1 FROM unit_safety_holds h WHERE h.unit_id=u.id AND h.resolved_ms IS NULL)`,[reservation.id]);
  if(!safe)return {cancel:'pickup_unit_not_safe'};
  return {parameters:[reservation.code,reservation.model_name,reservation.color_name||'Conforme unidade',formatDate(reservation.pickup_ms),companyAddress(reservation)]};
 }
 if(reservation.status!=='rented'||!reservation.actual_start_ms||!reservation.due_ms)return {cancel:'rental_not_active'};
 if(row.kind==='return_reminder'){
  if(row.event_key!==`return:${reservation.id}:${reservation.due_ms}`||reservation.due_ms<=now)return {cancel:'return_time_changed_or_passed'};
  return {parameters:[reservation.code,reservation.model_name,formatDate(reservation.due_ms),'Devolva a moto, chave e carregador no horário combinado. Qualquer prorrogação precisa de autorização prévia.']};
 }
 if(row.event_key!==`care:${reservation.id}:${reservation.actual_start_ms}`)return {cancel:'rental_start_changed'};
 if(reservation.due_ms<=now)return {cancel:'rental_period_ended'};
 const url=siteUrl();if(!url)return {configuration:'site_url_not_configured'};
 return {parameters:[reservation.code,'Evite água e alagamentos, use somente o carregador autorizado e avise a loja sobre queda, dano ou falha. Respeite os limites informados no documento.',new URL('/api/fleet/care-guide',url).toString()]};
}
async function reconcileEvents(){
 const rows=await all<{id:string;status:string}>("SELECT id,status FROM reservations WHERE customer_id<>'' AND status IN ('preparing','ready','rented') ORDER BY start_ms LIMIT 500");
 for(const row of rows){if(row.status==='preparing')await enqueuePreparationNotification(row.id);else if(row.status==='ready')await enqueueReadyNotification(row.id);else{await enqueueReturnReminder(row.id);await enqueueCareReminder(row.id);}}
 const settings=await notificationSettings();
 if(settings.rentals_enabled&&settings.auto_availability)await enqueueAvailabilityCampaign();
}

/** Called only by an authenticated owner or a secret-protected scheduler. */
export async function processNotifications({limit=20}:{limit?:number}={}){
 const maximum=Math.min(50,Math.max(1,Number.isInteger(limit)?limit:20));
 const reservations_whatsapp=await processReservationWhatsApp(maximum);
 await reconcileEvents();
 const now=Date.now();
 // Meta Cloud API has no message-send idempotency guarantee. A crashed request
 // may have sent successfully; stale claims require human review, never replay.
 await stmt("UPDATE customer_notifications SET status='unknown',last_reason='worker_interrupted',updated_ms=? WHERE status='sending' AND lease_ms<?",[now,now]).run();
 // New events must not sit behind an older template that remains unavailable.
 // Retried events rotate by their last attempt time so an unconfigured batch
 // cannot monopolize every worker invocation.
 const templates=whatsappConfiguration(environment()).templates;
 const configuredKinds=kinds.filter(kind=>templates[kind]==='configured');
 const configurationPriority=configuredKinds.length?`CASE WHEN kind IN (${configuredKinds.map(()=>'?').join(',')}) THEN 0 ELSE 1 END`:'CASE WHEN 1=1 THEN 0 ELSE 1 END';
 const rows=await all<Notification>(`SELECT * FROM customer_notifications
 WHERE status IN ('pending','failed','not_configured') AND scheduled_ms<=? AND attempts<5
 ORDER BY ${configurationPriority},CASE WHEN kind='availability' THEN 1 ELSE 0 END,
 CASE WHEN status='pending' THEN 0 ELSE 1 END,
 CASE WHEN status='pending' THEN scheduled_ms ELSE updated_ms END,created_ms LIMIT ?`,[now,...configuredKinds,maximum]);
 const totals={submitted:0,failed:0,not_configured:0,unknown:0,cancelled:0,processing:0};
 for(const row of rows){
  const claimed=await first<{id:string}>("UPDATE customer_notifications SET status='sending',lease_ms=?,updated_ms=? WHERE id=? AND status IN ('pending','failed','not_configured') AND attempts<5 RETURNING id",[Date.now()+90_000,Date.now(),row.id]);
  if(!claimed){totals.processing++;continue;}
  const record=async(status:string,reason='',providerId='')=>stmt('UPDATE customer_notifications SET status=?,last_reason=?,provider_id=?,lease_ms=0,updated_ms=?,submitted_ms=CASE WHEN ?=\'submitted\' THEN ? ELSE submitted_ms END WHERE id=?',[status,reason,providerId,Date.now(),status,Date.now(),row.id]).run();
  let mayHaveSent=false;
  try{
   const recipient=await customer(row.customer_id);
   if(!entitled(recipient,row.kind)){await record('cancelled','consent_or_phone_unverified');totals.cancelled++;continue;}
   const prepared=await parameters(row,Date.now());
   if('cancel'in prepared){await record('cancelled',prepared.cancel);totals.cancelled++;continue;}
   if('configuration'in prepared){await record('not_configured',prepared.configuration);totals.not_configured++;continue;}
   const configuration=whatsappConfiguration(environment());
   if(configuration.templates[row.kind]!=='configured'){await record('not_configured','whatsapp_not_configured');totals.not_configured++;continue;}
   // Recheck revocation immediately before calling the provider.
   const currentRecipient=await customer(row.customer_id);
   if(!entitled(currentRecipient,row.kind)){await record('cancelled','consent_revoked');totals.cancelled++;continue;}
   await stmt('UPDATE customer_notifications SET attempts=attempts+1 WHERE id=?',[row.id]).run();
   mayHaveSent=true;
   const result=await sendWhatsAppTemplate({environment:environment(),to:currentRecipient!.phone,kind:row.kind,parameters:prepared.parameters});
   if(result.status==='submitted'){await record('submitted','',result.provider_id);totals.submitted++;}
   else if(result.status==='uncertain'){await record('unknown',result.reason);totals.unknown++;}
   else if(result.status==='not_configured'){await record('not_configured',result.reason);totals.not_configured++;}
   else{await record('failed',result.reason);totals.failed++;}
  }catch{
   await record(mayHaveSent?'unknown':'failed',mayHaveSent?'whatsapp_delivery_uncertain':'notification_preparation_failed');
   if(mayHaveSent)totals.unknown++;else totals.failed++;
  }
 }
 return {...totals,reservations_whatsapp,message:'Mensagens aceitas pelo provedor não constituem confirmação de entrega. Resultados incertos ficam bloqueados para revisão.'};
}
export async function notificationAdmin(){
 const rows=await all<{id:string;reservation_id:string;reservation_code:string|null;kind:string;status:string;attempts:number;scheduled_ms:number;updated_ms:number;last_reason:string;provider_id:string}>('SELECT n.id,n.reservation_id,r.code reservation_code,n.kind,n.status,n.attempts,n.scheduled_ms,n.updated_ms,n.last_reason,n.provider_id FROM customer_notifications n LEFT JOIN reservations r ON r.id=n.reservation_id ORDER BY n.created_ms DESC LIMIT 100');
 return {reservation_messages:await simpleWhatsAppAdmin(),configuration:whatsappConfiguration(environment()),reminder_minutes:reminderMinutes(),marketing_interval_days:7,auto_availability:(await notificationSettings()).auto_availability,notifications:rows};
}
