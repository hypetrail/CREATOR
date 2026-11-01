import {env} from 'cloudflare:workers';
import {siteOwnerId} from './site-owner';
import {coverageSummary,officialWhatsApp,pickupAddress} from './packages';
import {t1Model,t1Units} from './t1';
import {type Insurance} from './rental';
import {fleetPeriod,fleetCharges,pricingPolicy,validatePricing} from './fleet-pricing';
import * as legacy from './rental-server';
import {currentDocumentPolicy} from './document-server';
import {defaultDocumentPolicy} from './document-policy';
import {assessLateFee,defaultLateFeePolicy} from './late-fees';
import {defaultCareGuide} from './care-guide';

export const TERMS_VERSION='rental-v1';
export const PREPARATION_BUFFER_MS=3*60*60*1000;
export const HttpError=legacy.HttpError;
type Color={id:string;name:string;hex:string;photos:string[]};
type ModelRow={id:string;name:string;brand:string;daily_cents:number|null;active:number;spec:string;photos:string;colors:string;quantity?:number};
type UnitRow={id:string;model_id:string;ordinal:number;label:string;color:string;identifier:string;status:string};
type BookingRow={id:string;code:string;request_key:string;unit_id:string;model_id:string;model_name:string;color:string;color_name:string;unit_label:string;start_ms:number;end_ms:number;days:number;daily_cents:number;protection_daily_cents:number;total_cents:number;insurance:Insurance;payment_method:string;payment_status:string;status:string;created_ms:number;terms_version:string;terms_snapshot:string;request_fingerprint:string;ready_ms:number|null;pickup_ms:number|null;source:string;customer_id:string;actual_start_ms:number|null;actual_end_ms:number|null;due_ms:number|null;late_fee_cents:number;late_fee_status:string};
type Input=Record<string,unknown>;
const db=legacy.db;
const stmt=(sql:string,args:unknown[]=[])=>db().prepare(sql).bind(...args);
const first=<T>(sql:string,args:unknown[]=[])=>stmt(sql,args).first<T>();
const all=async<T>(sql:string,args:unknown[]=[])=>((await stmt(sql,args).all<T>()).results||[]);
const text=(value:unknown,max:number)=>String(value??'').trim().slice(0,max);
const validId=(value:unknown)=>/^[a-z][a-z0-9-]{1,60}$/.test(String(value));
const settingKeys="'address','whatsapp','coverage','protection_enabled','rentals_enabled','protection_daily_cents'";
async function configuration(){
 const rows=await all<{key:string;value:string}>(`SELECT key,value FROM settings WHERE key IN (${settingKeys}) ORDER BY key`);
 const values=Object.fromEntries(rows.map(row=>[row.key,row.value]));
 return {settings:{address:values.address||pickupAddress,whatsapp:values.whatsapp||officialWhatsApp,protection_enabled:values.protection_enabled==='true',protection_daily_cents:Number(values.protection_daily_cents??1500),coverage:values.coverage||coverageSummary,rentals_enabled:values.rentals_enabled==='true',min_days:2},revision:JSON.stringify(rows.map(row=>[row.key,row.value]))};
}
async function termsToken(snapshot:string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(snapshot));
 return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
const activeReservation=`(r.status='rented' OR (r.status IN ('reserved','preparing','ready') AND COALESCE(r.due_ms,r.end_ms)>?))`;
function reservationBuffer(alias:string){return `COALESCE(CASE WHEN json_valid(${alias}.terms_snapshot) THEN json_extract(${alias}.terms_snapshot,'$.preparation_buffer_ms') END,${PREPARATION_BUFFER_MS})`;}
// Allocation, calendar queries and operational writes share the same interval
// rule. A returned unit remains unavailable during its preparation window.
function occupancyConflict(alias:string,start:string,end:string,buffer:string,now:string){
 const until=`COALESCE(${alias}.due_ms,${alias}.end_ms)`,from=`COALESCE(${alias}.actual_start_ms,${alias}.start_ms)`,padding=reservationBuffer(alias);
 return `((${alias}.status='rented' AND ${until}<=${now}) OR (${alias}.status IN ('reserved','preparing','ready','rented') AND ${from}<(${end}+${buffer}) AND (${until}+${padding})>${start}) OR (${alias}.status='returned' AND ${alias}.actual_end_ms IS NOT NULL AND ${alias}.actual_end_ms<(${end}+${buffer}) AND (${alias}.actual_end_ms+${padding})>${start}))`;
}


function photos(value:unknown):string[]{
 if(!Array.isArray(value))return [];
 return value.filter((url):url is string=>typeof url==='string'&&url.length<=300&&!url.includes('..')&&/^\/(fleet\/|brand\/|catalogo\/assets\/|api\/(rental|fleet)\/photos\/)/.test(url)).map(url=>url.replace(/^\/api\/rental\/photos\//,'/api/fleet/photos/')).slice(0,10);
}
function colors(value:unknown):Color[]{
 if(!Array.isArray(value)||value.length>30)throw new HttpError(400,'Informe até 30 cores para o modelo.');
 const result=value.map((entry:unknown)=>{
  if(!entry||typeof entry!=='object')throw new HttpError(400,'Cor inválida.');
  const c=entry as Input;
  if(!validId(c.id)||!text(c.name,50)||!/^#[0-9a-f]{6}$/i.test(String(c.hex)))throw new HttpError(400,'Informe identificador, nome e cor hexadecimal válidos.');
  return {id:String(c.id),name:text(c.name,50),hex:String(c.hex),photos:photos(c.photos)};
 });
 if(new Set(result.map(c=>c.id)).size!==result.length)throw new HttpError(400,'Há identificadores de cor repetidos.');
 return result;
}
function model(row:ModelRow){
 return {...row,spec:JSON.parse(row.spec),photos:JSON.parse(row.photos),colors:JSON.parse(row.colors) as Color[],quantity:Number(row.quantity||0)};
}
function booking(row:BookingRow){
 let insuranceIncluded=false;
 try{insuranceIncluded=JSON.parse(row.terms_snapshot||'{}').pricing?.insurance_included===true;}catch{/* Historical records have no policy snapshot. */}
 const {id,code,model_id,model_name,color,color_name,unit_label,start_ms,end_ms,days,daily_cents,protection_daily_cents,total_cents,insurance,payment_method,payment_status,status,terms_version,terms_snapshot}=row;
 return {id,code,model_id,model_name,color,color_name,unit_label,insurance_included:insuranceIncluded,start_ms,end_ms,days,daily_cents,protection_daily_cents,protection_cents:days*protection_daily_cents,rental_cents:days*daily_cents,total_cents,insurance,payment_method,payment_status,status,terms_version,terms_snapshot,ready_ms:row.ready_ms,pickup_ms:row.pickup_ms,source:row.source,actual_start_ms:row.actual_start_ms,actual_end_ms:row.actual_end_ms,due_ms:row.due_ms,late_fee_cents:row.late_fee_cents,late_fee_status:row.late_fee_status,preparation_buffer_ms:PREPARATION_BUFFER_MS,account_linked:!!row.customer_id};
}

// Only a trusted hosting identity can initialize ownership. Public reads never
// claim a database. The local owner override is an explicit worker variable.
export async function initialize(user:string){
 const owner=await first<{value:string}>("SELECT value FROM settings WHERE key='owner_id'");
 const expected=(env as Cloudflare.Env&{FLEET_OWNER_ID?:string}).FLEET_OWNER_ID||siteOwnerId;
 if(!owner&&user!==expected)return;
 await stmt("INSERT OR IGNORE INTO settings (key,value) VALUES ('owner_id',?)",[user]).run();
 await legacy.admin(user);
 if(await first("SELECT value FROM settings WHERE key='t1_catalog_v1'"))return;
 const pending:D1PreparedStatement[]=[];
 // Existing installations keep every model and unit. T1 is an additive seed.
 pending.push(stmt('INSERT OR IGNORE INTO rental_models (id,name,brand,daily_cents,active,spec,photos,colors) VALUES (?,?,?,?,?,?,?,?)',[t1Model.id,t1Model.name,t1Model.brand,t1Model.daily_cents,t1Model.active,JSON.stringify(t1Model.spec),JSON.stringify(t1Model.photos),JSON.stringify(t1Model.colors)]));
 for(const u of t1Units)pending.push(stmt('INSERT OR IGNORE INTO units (id,model_id,ordinal,label,status,color,identifier) VALUES (?,?,?,?,?,?,?)',[u.id,u.model_id,u.ordinal,u.label,u.status,u.color,u.identifier]));
 pending.push(stmt("INSERT OR IGNORE INTO settings (key,value) VALUES ('t1_catalog_v1','done')"));
 await db().batch(pending);
}
async function catalogRows(includeInactive=false){
 const rows=await all<ModelRow>(`SELECT m.*,(SELECT COUNT(*) FROM units u WHERE u.model_id=m.id AND u.status!='retired') quantity FROM rental_models m ${includeInactive?'':'WHERE m.active=1'} ORDER BY m.rowid`);
 return rows.map(model);
}
export async function catalog(){
 const models=await catalogRows();
 return {models,settings:await legacy.config()};
}
// Product photos are public assets. Uploads remain owner-only on the existing
// endpoint; no customer documents are accepted or exposed by this route.
export async function photoResponse(id:string){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new HttpError(404,'Foto não encontrada.');
 return legacy.photoResponse(id);
}
export async function availability(start:string,end:string){
 const models=await catalogRows();
 const minimum=models.length?Math.min(...models.map(m=>{const policy=pricingPolicy(m);return policy.single_day_enabled?1:policy.minimum_days;})):2;
 const p=fleetPeriod({daily_cents:null,spec:{pricing:{minimum_days:minimum}}},start,end);
 const eligible=new Set(models.filter(m=>{try{fleetPeriod(m,start,end);return true;}catch{return false;}}).map(m=>m.id));
 const rows=await all<{model_id:string;color:string;available:number}>(`SELECT u.model_id,u.color,COUNT(*) available FROM units u JOIN rental_models m ON m.id=u.model_id WHERE u.status='available' AND m.active=1 AND m.daily_cents>0
 AND NOT EXISTS (SELECT 1 FROM unit_safety_holds h WHERE h.unit_id=u.id AND h.resolved_ms IS NULL)
 AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=u.id AND ${occupancyConflict('r','?','?',String(PREPARATION_BUFFER_MS),'?')})
 AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.unit_id=u.id AND b.start_ms<(?+${PREPARATION_BUFFER_MS}) AND b.end_ms>?) GROUP BY u.model_id,u.color`,[Date.now(),p.end,p.start,p.end,p.start,p.end,p.start]);
 return {days:p.days,models:models.map(m=>({...m,available:eligible.has(m.id)?rows.filter(r=>r.model_id===m.id).reduce((n,r)=>n+r.available,0):0,colors:m.colors.map(c=>({...c,available:eligible.has(m.id)?rows.find(r=>r.model_id===m.id&&r.color===c.id)?.available||0:0}))})),settings:await legacy.config()};
}
async function pricedQuote(input:Input){
 const row=await first<ModelRow>('SELECT * FROM rental_models WHERE id=? AND active=1',[input.model_id]);
 if(!row||!row.daily_cents)throw new HttpError(409,'Este modelo ainda não tem uma diária liberada para locação.');
 const palette=JSON.parse(row.colors) as Color[];
 const variant=JSON.parse(row.spec).color_selection===false?palette[0]:palette.find(c=>c.id===input.color);
 if(!variant)throw new HttpError(400,'Escolha uma cor cadastrada para este modelo.');
 const priced={daily_cents:row.daily_cents,spec:JSON.parse(row.spec)},policy=validatePricing(priced);
 const p=fleetPeriod(priced,String(input.start||''),String(input.end||''));
 const current=await configuration(),settings=current.settings,insurance=(input.insurance??'none') as Insurance;
 if(!policy.insurance_included&&insurance!=='none'&&!settings.protection_enabled)throw new HttpError(409,'Os seguros ainda não foram liberados pela loja.');
 const charges=fleetCharges(priced,p.days,insurance);
 const storedDocument=await currentDocumentPolicy();
 const document=!/(metade da diária|1 diária adicional)/i.test(storedDocument.clauses.delay)?storedDocument:{...storedDocument,version:storedDocument.version+'-atraso-v3',approved:false,clauses:{...storedDocument.clauses,delay:defaultDocumentPolicy.clauses.delay}};
 // Included insurance follows the saved document conditions, not unrelated
 // optional-package descriptions from the legacy catalogue.
 if(policy.insurance_included)settings.coverage=document.clauses.insurance;
 const snapshot=JSON.stringify({contact_mode:'whatsapp',vehicle_spec:{power:priced.spec.power,range:priced.spec.range,capacity:priced.spec.capacity,capacity_exclusive:priced.spec.capacity_exclusive,battery:priced.spec.battery,charge:priced.spec.charge},document,...(row.id==='t1'?{care_guide:defaultCareGuide}:{}),preparation_buffer_ms:PREPARATION_BUFFER_MS,contract_duration_ms:p.end-p.start,late_fee_policy:defaultLateFeePolicy,delay_daily_cents:charges.daily_cents+charges.protection_daily_cents,version:TERMS_VERSION,payment:'Pagamento exclusivamente na retirada; pendente.',minimum_hours:(policy.single_day_enabled?1:policy.minimum_days)*24,standard_minimum_hours:policy.minimum_days*24,single_day_hours:policy.single_day_enabled?24:null,period:`Diárias de 24 horas; frações adicionais contam nova diária. Mínimo de ${policy.minimum_days} diárias${policy.single_day_enabled?'; diária única disponível na tarifa própria':''}.`,pricing:{base_daily_cents:row.daily_cents,...policy},coverage:charges.insurance==='none'?'Sem seguro adicional.':settings.coverage,address:settings.address,whatsapp:settings.whatsapp});
 return {...charges,start_ms:p.start,end_ms:p.end,model_id:row.id,model_name:row.name,color:variant.id,color_name:JSON.parse(row.spec).color_selection===false?'':variant.name,settings,terms_version:TERMS_VERSION,pricing_policy:policy,document_policy:document,terms_token:await termsToken(snapshot),_terms_snapshot:snapshot,_settings_revision:current.revision,_document_version:storedDocument.version,_model_spec:row.spec};
}
export async function quote(input:Input){
 const value=await pricedQuote(input);
 const {_model_spec,_terms_snapshot,_settings_revision,_document_version,...publicQuote}=value;
 void _model_spec;void _terms_snapshot;void _settings_revision;void _document_version;
 return publicQuote;
}

export async function reserve(input:Input,manual=false,unitId='',customerId=''){
 const allowed=new Set(['model_id','color','start','end','insurance','request_key','expected_daily_cents','expected_total_cents','terms_version','terms_accepted','expected_terms_token']);
 if(Object.keys(input).some(key=>!allowed.has(key)))throw new HttpError(400,'Envie somente os dados operacionais da reserva. Dados pessoais permanecem no navegador.');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(input.request_key)))throw new HttpError(400,'Identificador da solicitação inválido.');
 if(input.terms_version!==TERMS_VERSION||input.terms_accepted!==true)throw new HttpError(400,'Leia e aceite as condições da reserva.');
 if(typeof input.expected_terms_token!=='string'||!/^[0-9a-f]{64}$/.test(input.expected_terms_token))throw new HttpError(400,'Atualize o resumo e aceite as condições atuais.');
 const parsed=fleetPeriod({daily_cents:null,spec:{pricing:{minimum_days:1}}},String(input.start||''),String(input.end||''));
 const fingerprint=JSON.stringify([input.model_id,input.color,parsed.start,parsed.end,input.insurance??'none',input.expected_daily_cents,input.expected_total_cents,input.terms_version,input.expected_terms_token,...(customerId?['customer',customerId]:[]),...(manual?['manual',unitId]:[])]);
 const replay=async()=>{
  const row=await first<BookingRow>('SELECT * FROM reservations WHERE request_key=?',[input.request_key]);
  if(!row)return null;
  if(row.request_fingerprint!==fingerprint)throw new HttpError(409,'Esta solicitação já foi usada com outros dados. Atualize a página para uma nova reserva.');
  return {...booking(row),...(!manual?{delivery_token:row.request_key}:{})};
 };
 const existing=await replay();if(existing)return {...existing,settings:await legacy.config()};
 const q=await pricedQuote(input);
 if(!manual&&!q.settings.rentals_enabled)throw new HttpError(409,'As reservas estão em preparação. Consulte a loja.');
 if(q.terms_token!==input.expected_terms_token)throw new HttpError(409,'As condições da reserva mudaram. Revise o resumo antes de confirmar.');
 if(q.daily_cents!==input.expected_daily_cents||q.total_cents!==input.expected_total_cents)throw new HttpError(409,'A diária mudou. Revise os novos valores antes de confirmar.');
 const snapshot=q._terms_snapshot;
 const id=crypto.randomUUID(),code='CG-'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
 let row:BookingRow|null;
 try{
 row=await first<BookingRow>(`INSERT INTO reservations (id,code,request_key,unit_id,model_id,model_name,start_ms,end_ms,days,daily_cents,protection_daily_cents,total_cents,name,phone,email,city,payment_method,payment_status,status,created_ms,insurance,cleaning_prepaid_cents,color,color_name,unit_label,terms_version,terms_snapshot,request_fingerprint,source,customer_id)
 SELECT ?,?,?,u.id,m.id,m.name,?,?,?,?,?,?,'','','','','pickup','pending','reserved',?,?,0,u.color,?,u.label,?,?,?,?,?
 FROM units u JOIN rental_models m ON m.id=u.model_id
 WHERE m.id=? AND m.active=1 AND m.daily_cents=? AND m.spec=? AND u.color=? AND u.status='available' AND (?='' OR u.id=?)
 AND (?=1 OR (SELECT value FROM settings WHERE key='rentals_enabled')='true')
 AND (SELECT json_group_array(json_array(key,value)) FROM (SELECT key,value FROM settings WHERE key IN (${settingKeys}) ORDER BY key))=?
 AND COALESCE((SELECT id FROM document_versions WHERE approved=1 ORDER BY created_ms DESC,rowid DESC LIMIT 1),'${defaultDocumentPolicy.version}')=?
 AND EXISTS (SELECT 1 FROM json_each(m.colors) c WHERE json_extract(c.value,'$.id')=u.color)
 AND (?=0 OR ?=1 OR (SELECT value FROM settings WHERE key='protection_enabled')='true')
 AND NOT EXISTS (SELECT 1 FROM unit_safety_holds h WHERE h.unit_id=u.id AND h.resolved_ms IS NULL)
 AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=u.id AND ${occupancyConflict('r','?','?',String(PREPARATION_BUFFER_MS),'?')})
 AND NOT EXISTS (SELECT 1 FROM blocks b WHERE b.unit_id=u.id AND b.start_ms<(?+${PREPARATION_BUFFER_MS}) AND b.end_ms>?) ORDER BY u.ordinal LIMIT 1 RETURNING *`,[id,code,input.request_key,q.start_ms,q.end_ms,q.days,q.daily_cents,q.protection_daily_cents,q.total_cents,Date.now(),q.insurance,q.color_name,TERMS_VERSION,snapshot,fingerprint,manual?'manual':'website',customerId,q.model_id,q.base_daily_cents,q._model_spec,q.color,unitId,unitId,manual?1:0,q._settings_revision,q._document_version,q.protection_daily_cents,q.insurance_included?1:0,Date.now(),q.end_ms,q.start_ms,q.end_ms,q.start_ms,q.end_ms,q.start_ms]);
 }catch(error){
  // Two identical retries may reach the unique constraint together.
  const result=await replay();if(result)return {...result,settings:q.settings};
  if(error instanceof Error&&/FLEET_ALLOCATION_CONFLICT|UNIT_SAFETY_HOLD/.test(error.message))throw new HttpError(409,'A unidade ficou indisponível. Confira o período e o intervalo de preparação.');
  throw error;
 }
 if(!row)throw new HttpError(409,'A última unidade acabou de ficar indisponível. Consulte outro período.');
 return {...booking(row),...(!manual?{delivery_token:row.request_key}:{}),settings:q.settings};
}

export async function adminData(){
 const raw=await all<BookingRow>('SELECT * FROM reservations ORDER BY start_ms DESC');
 const deliveries=await all<{reservation_id:string;kind:string;status:string;updated_ms:number}>(`SELECT reservation_id,kind,status,updated_ms FROM reservation_document_deliveries WHERE kind IN ('reservation','pickup_confirmation') ORDER BY updated_ms DESC`);
 return {server_now_ms:Date.now(),models:await catalogRows(true),units:await all<UnitRow&{model_name:string}>('SELECT u.*,m.name model_name FROM units u JOIN rental_models m ON m.id=u.model_id ORDER BY m.name,u.ordinal'),reservations:raw.map(row=>({...booking(row),unit_id:row.unit_id,external_customer_system:(row as unknown as Record<string,unknown>).external_customer_system,external_customer_ref:(row as unknown as Record<string,unknown>).external_customer_ref,documents_delivery:deliveries.filter(item=>item.reservation_id===row.id).map(({kind,status,updated_ms})=>({kind,status,updated_ms}))})),blocks:await all('SELECT * FROM blocks ORDER BY start_ms DESC'),settings:await legacy.config()};
}
export async function saveModel(input:Input){
 if(!validId(input.id))throw new HttpError(400,'Identificador do modelo inválido.');
 const old=await first<ModelRow>('SELECT * FROM rental_models WHERE id=?',[input.id]);
 const name=text(input.name,80),brand=text(input.brand,80),daily=input.daily_cents===null?null:Number(input.daily_cents);
 if(!name||!brand)throw new HttpError(400,'Informe nome e marca do modelo.');
 if(daily!==null&&(!Number.isInteger(daily)||daily<=0||daily>1_000_000))throw new HttpError(400,'Informe uma diária válida ou deixe o preço pendente.');
 const palette=colors(input.colors??(old?JSON.parse(old.colors):[]));
 const spec={...(old?JSON.parse(old.spec):{features:[],notes:[],partial:false}),...(input.spec&&typeof input.spec==='object'?input.spec:{})} as Input;
 for(const field of ['power','range','rangeMin','speed','capacity','passengers']){
  const value=spec[field]??null;
  if(value!==null&&(!Number.isFinite(Number(value))||Number(value)<0||Number(value)>10000))throw new HttpError(400,'Dado técnico inválido.');
  spec[field]=value===null?null:Number(value);
 }
 for(const field of ['features','notes']){
  if(!Array.isArray(spec[field]))spec[field]=[];
  spec[field]=(spec[field] as unknown[]).filter((x):x is string=>typeof x==='string').map(x=>x.slice(0,600)).slice(0,30);
 }
 try{validatePricing({daily_cents:daily,spec});}catch(error){throw new HttpError(400,error instanceof Error?error.message:'Política de preços inválida.');}
 const row=await first<{id:string}>(`INSERT INTO rental_models (id,name,brand,daily_cents,active,spec,photos,colors)
 SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.model_id=? AND u.color!='nao-informada' AND NOT EXISTS (SELECT 1 FROM json_each(?) c WHERE json_extract(c.value,'$.id')=u.color))
 ON CONFLICT(id) DO UPDATE SET name=excluded.name,brand=excluded.brand,daily_cents=excluded.daily_cents,active=excluded.active,spec=excluded.spec,photos=excluded.photos,colors=excluded.colors RETURNING id`,[input.id,name,brand,daily,input.active?1:0,JSON.stringify(spec),JSON.stringify(photos(input.photos??(old?JSON.parse(old.photos):[]))),JSON.stringify(palette),input.id,JSON.stringify(palette)]);
 if(!row)throw new HttpError(409,'Uma cor removida ainda é usada por uma unidade. Preserve a cor para manter o histórico.');
 return {ok:true,id:row.id};
}
export async function saveUnit(input:Input){
 const statuses=['available','maintenance','blocked','retired'];
 if(!statuses.includes(String(input.status)))throw new HttpError(400,'Status da unidade inválido.');
 const label=text(input.label,100),color=text(input.color,60),identifier=text(input.identifier,100);
 if(!label||!color||!validId(input.model_id))throw new HttpError(400,'Informe modelo, cor e identificação da unidade.');
 const old=input.id?await first<UnitRow>('SELECT * FROM units WHERE id=?',[input.id]):null;
 if(input.id&&!old)throw new HttpError(404,'Unidade não encontrada.');
 if(old&&old.model_id!==input.model_id)throw new HttpError(400,'O modelo de uma unidade cadastrada não pode ser alterado.');
 const id=old?.id||crypto.randomUUID();
 let result:{id:string}|null;
 try{
 if(old){
  result=await first<{id:string}>(`UPDATE units SET label=?,color=?,identifier=?,status=? WHERE id=? AND EXISTS (SELECT 1 FROM rental_models m,json_each(m.colors) c WHERE m.id=units.model_id AND json_extract(c.value,'$.id')=?) AND ((?='available' AND color=?) OR NOT EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=units.id AND ${activeReservation})) RETURNING id`,[label,color,identifier,input.status,id,color,input.status,color,Date.now()]);
 }else{
  result=await first<{id:string}>(`INSERT INTO units (id,model_id,ordinal,label,color,identifier,status) SELECT ?,m.id,COALESCE((SELECT MAX(u.ordinal) FROM units u WHERE u.model_id=m.id),0)+1,?,?,?,? FROM rental_models m WHERE m.id=? AND EXISTS (SELECT 1 FROM json_each(m.colors) c WHERE json_extract(c.value,'$.id')=?) RETURNING id`,[id,label,color,identifier,input.status,input.model_id,color]);
 }
 }catch(error){
  if(error instanceof Error&&/units\.identifier|unit_identifier_unique/.test(error.message))throw new HttpError(409,'Esta identificação já está cadastrada em outra moto.');
  throw error;
 }
 if(!result)throw new HttpError(409,'Confira a cor cadastrada e as reservas ativas antes de alterar esta unidade.');
 return {ok:true,id:result.id};
}

export const saveSettings=legacy.saveSettings;
export async function addBlock(input:Input){
 const a=Date.parse(String(input.start||'')),b=Date.parse(String(input.end||''));
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)throw new HttpError(400,'Informe um período válido para o bloqueio.');
 if(!['maintenance','blocked'].includes(String(input.kind)))throw new HttpError(400,'Tipo de bloqueio inválido.');
 const id=crypto.randomUUID();
 try{
  const row=await first(`INSERT INTO blocks (id,unit_id,start_ms,end_ms,reason,kind) SELECT ?,u.id,?,?,?,? FROM units u WHERE u.id=?
   AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=u.id AND ${occupancyConflict('r','?','?','0','?')})
   AND NOT EXISTS (SELECT 1 FROM blocks k WHERE k.unit_id=u.id AND k.start_ms<? AND k.end_ms>?) RETURNING id`,[id,a,b,text(input.reason||'Bloqueio da operação',200),input.kind,input.unit_id,Date.now(),b,a,b,a,b,a]);
  if(!row)throw new HttpError(409,'A unidade já possui reserva, preparação ou bloqueio nesse período.');
  return {ok:true,id};
 }catch(error){if(error instanceof Error&&/FLEET_BLOCK_CONFLICT/.test(error.message))throw new HttpError(409,'A unidade recebeu uma reserva. Confira o período de preparação antes de bloquear.');throw error;}
}

export const deleteBlock=legacy.deleteBlock;
export async function createManualReservation(input:Input){
 const allowed=new Set(['model_id','unit_id','color','start','end','insurance','request_key','expected_daily_cents','expected_total_cents','terms_version','terms_accepted','expected_terms_token','customer_id']);
 if(Object.keys(input).some(key=>!allowed.has(key)))throw new HttpError(400,'Registre somente dados operacionais.');
 const unit=await first<UnitRow>('SELECT * FROM units WHERE id=?',[input.unit_id]);
 if(!unit||unit.model_id!==input.model_id||unit.color!==input.color)throw new HttpError(400,'Escolha a unidade correta da frota.');
 const {unit_id,customer_id,...commercial}=input;void unit_id;
 const customerId=String(customer_id||'');
 if(customerId&&!await first('SELECT id FROM customers WHERE id=?',[customerId]))throw new HttpError(400,'Cadastro do cliente não encontrado.');
 return reserve(commercial,true,unit.id,customerId);
}
export async function updateReservation(input:Input,actor=''){
 void actor; // The authenticated route records the responsible administrator.
 const transitions:Record<string,string[]>={reserved:['preparing','cancelled'],preparing:['ready','cancelled'],ready:['rented','preparing','cancelled'],rented:['returned'],returned:[],cancelled:[]};
 if(!Object.hasOwn(transitions,String(input.status))||!['pending','paid'].includes(String(input.payment_status)))throw new HttpError(400,'Situação inválida.');
 const old=await first<BookingRow>('SELECT * FROM reservations WHERE id=?',[input.id]);
 if(!old)throw new HttpError(404,'Reserva não encontrada.');
 const changedStatus=old.status!==input.status;
 if(changedStatus&&!transitions[old.status]?.includes(String(input.status)))throw new HttpError(409,'Transição não permitida. Prepare e libere a moto antes da retirada.');
 let pickup=old.pickup_ms;
 if(input.status==='ready'&&changedStatus){
  if(input.vehicle_checked!==true||input.documents_checked!==true||input.battery_checked!==true)throw new HttpError(400,'Confirme revisão, documentação e carga da bateria para liberar a retirada.');
  pickup=Date.parse(String(input.pickup_time||''));
  if(!Number.isFinite(pickup)||pickup<old.start_ms||pickup>=old.end_ms||pickup<Date.now())throw new HttpError(400,'Confirme um horário futuro dentro do período reservado.');
 }
 const now=Date.now(),starting=changedStatus&&input.status==='rented',returning=changedStatus&&input.status==='returned',releasing=changedStatus&&input.status==='ready';
 const inspectionKind=starting?'departure':'return',inspectionId=text(input.inspection_id,120);
 if(starting||returning){
  const inspection=await first(`SELECT id FROM rental_inspections WHERE id=? AND reservation_id=? AND kind=? AND json_extract(payload,'$.completed')=1`,[inspectionId,old.id,inspectionKind]);
  if(!inspection)throw new HttpError(400,starting?'Conclua a vistoria de saída com fotos antes de registrar a retirada.':'Conclua a vistoria de retorno com fotos antes de registrar a devolução.');
 }
 const actualStart=starting?now:old.actual_start_ms,actualEnd=returning?now:old.actual_end_ms;
 const due=starting?now+(old.end_ms-old.start_ms):old.due_ms;
 if(starting&&(!Number.isSafeInteger(due)||!due||due<=now))throw new HttpError(409,'O período contratado é inválido. Confira a reserva antes da retirada.');
 const assessment=returning?assessLateFee(old,now):null;
 const fee=assessment?.cents??old.late_fee_cents??0,feeStatus=assessment?.status??old.late_fee_status??'pending_review';
 const extra:string[]=[],args:unknown[]=[];
 if(starting||releasing){
  const operationalStart=starting?now:pickup!;
  const operationalDue=starting?due!:operationalStart+(old.end_ms-old.start_ms);
  extra.push(`EXISTS (SELECT 1 FROM units u WHERE u.id=reservations.unit_id AND u.status='available' AND NOT EXISTS (SELECT 1 FROM unit_safety_holds h WHERE h.unit_id=u.id AND h.resolved_ms IS NULL))`);
  extra.push(`NOT EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=reservations.unit_id AND r.id<>reservations.id AND ${occupancyConflict('r','?','?',String(PREPARATION_BUFFER_MS),'?')})`);
  args.push(now,operationalDue,operationalStart,operationalDue,operationalStart);
  extra.push(`NOT EXISTS (SELECT 1 FROM blocks b WHERE b.unit_id=reservations.unit_id AND b.start_ms<(?+${PREPARATION_BUFFER_MS}) AND b.end_ms>?)`);
  args.push(operationalDue,operationalStart);
 }
 if(starting||returning){extra.push(`EXISTS (SELECT 1 FROM rental_inspections i WHERE i.id=? AND i.reservation_id=reservations.id AND i.kind=? AND json_extract(i.payload,'$.completed')=1)`);args.push(inspectionId,inspectionKind);}
 let changed:BookingRow|null;
 try{
  changed=await first<BookingRow>(`UPDATE reservations SET status=?,payment_status=?,ready_ms=?,pickup_ms=?,actual_start_ms=?,actual_end_ms=?,due_ms=?,late_fee_cents=?,late_fee_status=? WHERE id=? AND status=? AND payment_status=? ${extra.length?'AND '+extra.join(' AND '):''} RETURNING *`,[input.status,input.payment_status,input.status==='ready'?(old.ready_ms||now):['preparing','cancelled'].includes(String(input.status))?null:old.ready_ms,input.status==='ready'?pickup:['preparing','cancelled'].includes(String(input.status))?null:old.pickup_ms,actualStart??null,actualEnd??null,due??null,fee,feeStatus,old.id,old.status,old.payment_status,...args]);
 }catch(error){
  if(error instanceof Error&&/FLEET_PICKUP_CONFLICT|UNIT_SAFETY_HOLD/.test(error.message))throw new HttpError(409,'Esta retirada conflita com outra reserva, preparação, manutenção ou bloqueio. Resolva o calendário antes de entregar a moto.');
  throw error;
 }
 if(!changed)throw new HttpError(409,starting||releasing?'Este horário de retirada conflita com outra reserva, preparação, manutenção ou bloqueio, ou a reserva mudou. Confira o calendário antes de liberar a moto.':'A reserva mudou em outra operação. Atualize a lista.');
 return {ok:true,reservation:booking(changed),...(assessment?{late_fee:assessment}:{})};
}
