import {env} from 'cloudflare:workers';
import {siteOwnerId} from './site-owner';
import {coverageSummary,officialWhatsApp,pickupAddress} from './packages';
import {rentalFleet} from './fleet';
import {period,rentalCharges,returnCleaning,phone,customer,allocationSQL,allocationArgs} from './rental';
export class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
export function db(){if(!env.DB)throw new HttpError(503,'O serviço de reservas ainda não está disponível.');return env.DB;}
const statement=(sql:string,args:any[]=[])=>db().prepare(sql).bind(...args);
const first=(sql:string,args:any[]=[])=>statement(sql,args).first<any>();
const all=async(sql:string,args:any[]=[])=>((await statement(sql,args).all<any>()).results||[]);
export async function identity(req:Request){const id=req.headers.get('oai-authenticated-user-id');if(!id)throw new HttpError(401,'Entre na sua conta para acessar o catálogo privado.');return id;}
export async function initialize(userId:string){
 if(userId!==siteOwnerId&&!(await first("SELECT value FROM settings WHERE key='owner_id'")))return;
 await statement('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)',['owner_id',userId]).run();
 const owner=await first('SELECT value FROM settings WHERE key=?',['owner_id']);
 if(owner?.value===userId&&!(await first("SELECT value FROM settings WHERE key='fleet_oct2026'"))&&!(await first("SELECT value FROM settings WHERE key='t1_catalog_v1'"))){
 const pending=[];
 for(const m of rentalFleet){
 pending.push(db().prepare("INSERT INTO rental_models (id,name,brand,daily_cents,spec,photos,active) VALUES (?,?,?,?,?,'[]',1) ON CONFLICT(id) DO UPDATE SET name=excluded.name,brand=excluded.brand,daily_cents=excluded.daily_cents,spec=excluded.spec,active=1 WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key='fleet_oct2026')").bind(m.id,m.name,m.brand,m.daily_cents,JSON.stringify(m.spec)));
 pending.push(db().prepare("INSERT OR IGNORE INTO units (id,model_id,ordinal,label,status) VALUES (?,?,1,?,'available')").bind(m.id+'-1',m.id,m.name+' · 01'));
 }
 pending.push(db().prepare("UPDATE rental_models SET active=0 WHERE id NOT IN ('je7','rio','cx18') AND NOT EXISTS (SELECT 1 FROM settings WHERE key='fleet_oct2026')"));
 pending.push(db().prepare("INSERT OR IGNORE INTO settings (key,value) VALUES ('fleet_oct2026','done')"));
 await db().batch(pending);
 }
}
export async function admin(userId:string){const owner=await first('SELECT value FROM settings WHERE key=?',['owner_id']);if(owner?.value!==userId)throw new HttpError(403,'Área exclusiva da administração da CaloriMob.');}
export async function config(){const rows=await all('SELECT key,value FROM settings');const obj=Object.fromEntries(rows.map(x=>[x.key,x.value]));return {address:obj.address||pickupAddress,whatsapp:obj.whatsapp||officialWhatsApp,protection_enabled:obj.protection_enabled==='true',protection_daily_cents:Number(obj.protection_daily_cents??1500),coverage:obj.coverage||coverageSummary,rentals_enabled:obj.rentals_enabled==='true',min_days:2};}
async function catalog(){return (await all('SELECT m.*, (SELECT COUNT(*) FROM units u WHERE u.model_id=m.id) quantity FROM rental_models m ORDER BY rowid')).map(m=>({...m,spec:JSON.parse(m.spec),photos:JSON.parse(m.photos).length?JSON.parse(m.photos):(rentalFleet.find(f=>f.id===m.id)?.photos||[])}));}
export async function bootstrap(user:string){await initialize(user);return {models:await catalog(),settings:await config(),admin:(await first('SELECT value FROM settings WHERE key=?',['owner_id']))?.value===user};}
export async function availability(start:string,end:string){const p=period(start,end);const rows=await catalog();const counts=await all(`SELECT m.id,COUNT(u.id) available FROM rental_models m LEFT JOIN units u ON u.model_id=m.id AND u.status='available' AND NOT EXISTS (SELECT 1 FROM reservations b WHERE b.unit_id=u.id AND ((b.status='rented' AND b.end_ms<=?) OR (b.status IN ('reserved','preparing','ready','rented') AND b.start_ms<? AND b.end_ms>?))) AND NOT EXISTS (SELECT 1 FROM blocks k WHERE k.unit_id=u.id AND k.start_ms<? AND k.end_ms>?) GROUP BY m.id`,[Date.now(),p.end,p.start,p.end,p.start]);const countMap=Object.fromEntries(counts.map(x=>[x.id,x.available]));return {days:p.days,models:rows.map(m=>({...m,available:m.active&&m.daily_cents?countMap[m.id]||0:0})),settings:await config()};}
export async function quote(input:any){const p=period(input.start,input.end);const m=await first('SELECT * FROM rental_models WHERE id=?',[input.model_id]);if(!m||!m.active||!m.daily_cents)throw new HttpError(409,'Este modelo ainda não tem uma tarifa de locação cadastrada.');const settings=await config();const insurance=input.insurance??(input.protection?'basic':'none');if(insurance!=='none'&&(!settings.protection_enabled||!settings.coverage))throw new HttpError(409,'A proteção ainda não está habilitada para contratação.');return {...rentalCharges(p.days,m.daily_cents,insurance),start_ms:p.start,end_ms:p.end,model_id:m.id,model_name:m.name,settings};}
export async function reserve(input:any){
 if(input.payment_method!=='pickup')throw new HttpError(501,'Pagamento online ainda não está integrado. Escolha pagar na retirada.');
 if(!/^[0-9a-f-]{36}$/i.test(String(input.request_key)))throw new HttpError(400,'Identificador de solicitação inválido.');
 const user=customer(input.customer),existing=await first('SELECT * FROM reservations WHERE request_key=?',[input.request_key]);
 if(existing){if(existing.phone!==user.phone||existing.model_id!==input.model_id)throw new HttpError(409,'Solicitação já utilizada.');return {...existing,settings:await config()};}
 const q=await quote(input),settings=q.settings;
 if(!settings.rentals_enabled||!settings.address||!settings.whatsapp)throw new HttpError(409,'A locação está em preparação. Aguarde a liberação da CaloriMob.');
 if(q.total_cents!==input.expected_total_cents||q.daily_cents!==input.expected_daily_cents)throw new HttpError(409,'A tarifa foi atualizada. Revise o resumo antes de confirmar.');
 const id=crypto.randomUUID(),code='CM-'+crypto.randomUUID().replaceAll('-','').slice(0,16).toUpperCase(),p={start:q.start_ms,end:q.end_ms,days:q.days};
 const booking=await statement(allocationSQL,allocationArgs(id,code,input.request_key,input.model_id,p,q,user,Date.now())).first<any>();
 if(!booking)throw new HttpError(409,'Essa moto acabou de ficar indisponível para o período. Escolha outra opção.');
 return {...booking,settings};
}
export async function lookup(input:any){const booking=await first('SELECT * FROM reservations WHERE code=? AND phone=?',[String(input.code??'').trim().toUpperCase(),phone(input.phone)]);if(!booking)throw new HttpError(404,'Reserva não encontrada. Confira o código e o WhatsApp informado.');return {...booking,settings:await config()};}
export async function adminData(){return {models:await catalog(),units:await all('SELECT u.*,m.name model_name FROM units u JOIN rental_models m ON m.id=u.model_id ORDER BY m.name,u.ordinal'),reservations:await all('SELECT * FROM reservations ORDER BY start_ms DESC LIMIT 500'),blocks:await all('SELECT * FROM blocks ORDER BY start_ms DESC'),settings:await config()};}
export async function saveSettings(input:any){
 const address=String(input.address??'').trim().slice(0,500),whatsapp=input.whatsapp?phone(input.whatsapp):'',coverage=String(input.coverage??'').trim().slice(0,2000),fee=Number(input.protection_daily_cents);
 if(!Number.isInteger(fee)||fee<0||fee>100000)throw new HttpError(400,'Valor da proteção inválido.');
 if(input.protection_enabled&&!coverage)throw new HttpError(400,'Defina as condições de cobertura antes de oferecer proteção.');
 if(input.rentals_enabled&&(!address||!whatsapp))throw new HttpError(400,'Cadastre endereço e WhatsApp oficial antes de liberar reservas.');
 const pairs={address,whatsapp,coverage,protection_daily_cents:String(fee),protection_enabled:String(!!input.protection_enabled),rentals_enabled:String(!!input.rentals_enabled)};
 await db().batch(Object.entries(pairs).map(([key,value])=>db().prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value)));return await config();
}
export async function saveModel(input:any){
 if(!/^[a-z][a-z0-9-]{1,40}$/.test(String(input.id)))throw new HttpError(400,'Identificador do modelo inválido.');
 const old=(await first('SELECT * FROM rental_models WHERE id=?',[input.id]))||{name:'',brand:'',spec:JSON.stringify({power:null,range:null,speed:null,capacity:null,passengers:null,features:[],notes:[],source:'Cadastro da CaloriMob.',partial:false}),photos:'[]'};
 const quantity=Number(input.quantity),daily=input.daily_cents===null?null:Number(input.daily_cents);
 if(!Number.isInteger(quantity)||quantity<0||quantity>100)throw new HttpError(400,'Informe de 0 a 100 unidades.');if(daily!==null&&(!Number.isInteger(daily)||daily<=0||daily>1000000))throw new HttpError(400,'Informe uma diária válida.');
 const name=String(input.name||old.name).trim().slice(0,80),brand=String(input.brand||old.brand).trim().slice(0,80),current=await all('SELECT * FROM units WHERE model_id=? ORDER BY ordinal',[input.id]),removed=current.filter(u=>u.ordinal>quantity);
 for(const u of removed){const count=await first(`SELECT COUNT(*) n FROM reservations WHERE unit_id=? AND (status='rented' OR (status='reserved' AND end_ms>?))`,[u.id,Date.now()]);if(count.n)throw new HttpError(409,'Uma unidade removida tem reserva ativa. Cancele ou finalize a reserva antes de reduzir a frota.');}
 const spec={...JSON.parse(old.spec),...input.spec};
 for(const field of ['power','range','rangeMin','speed','capacity','passengers']){const v=spec[field]??null;if(v!==null&&(!Number.isFinite(Number(v))||Number(v)<0||Number(v)>10000))throw new HttpError(400,'Dado técnico inválido.');spec[field]=v===null?null:Number(v);}
 const photos=Array.isArray(input.photos)?input.photos.filter((x:any)=>typeof x==='string'&&(x.startsWith('/api/rental/photos/')||x.startsWith('/catalogo/assets/')||x.startsWith('/fleet/'))).slice(0,10):JSON.parse(old.photos);
 if(!name||!brand)throw new HttpError(400,'Informe nome e marca do modelo.');
 const statements=[db().prepare('INSERT INTO rental_models (id,name,brand,daily_cents,active,spec,photos) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,brand=excluded.brand,daily_cents=excluded.daily_cents,active=excluded.active,spec=excluded.spec,photos=excluded.photos').bind(input.id,name,brand,daily,input.active?1:0,JSON.stringify(spec),JSON.stringify(photos))];
 for(let n=1;n<=quantity;n++)statements.push(db().prepare('INSERT OR IGNORE INTO units (id,model_id,ordinal,label,status) VALUES (?,?,?,?,?)').bind(`${input.id}-${n}`,input.id,n,`${name} · ${String(n).padStart(2,'0')}`,'available'));
 for(const u of removed){statements.push(db().prepare("UPDATE units SET status='retired' WHERE id=?").bind(u.id));}
 try{await db().batch(statements);}catch(error){if(error instanceof Error&&error.message.includes('UNIT_ACTIVE_RESERVATION'))throw new HttpError(409,'Esta unidade recebeu uma reserva. Revise as reservas antes de reduzir a frota.');throw error;}return {ok:true};
}
export async function updateUnit(input:any){if(!['available','maintenance','blocked'].includes(input.status))throw new HttpError(400,'Status inválido.');const changed=await statement(`UPDATE units SET status=? WHERE id=? AND (?='available' OR NOT EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=units.id AND (r.status='rented' OR (r.status IN ('reserved','preparing','ready') AND r.end_ms>?)))) RETURNING id`,[input.status,input.id,input.status,Date.now()]).first();if(!changed)throw new HttpError(409,'Esta unidade tem reservas ativas ou não foi encontrada. Resolva as reservas antes de bloquear a unidade.');return {ok:true};}
export async function addBlock(input:any){const a=Date.parse(input.start),b=Date.parse(input.end);if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a)throw new HttpError(400,'Informe um período válido para o bloqueio.');if(!['maintenance','blocked'].includes(input.kind))throw new HttpError(400,'Tipo de bloqueio inválido.');const id=crypto.randomUUID(),r=await statement(`INSERT INTO blocks (id,unit_id,start_ms,end_ms,reason,kind) SELECT ?,u.id,?,?,?,? FROM units u WHERE u.id=? AND NOT EXISTS (SELECT 1 FROM reservations b WHERE b.unit_id=u.id AND ((b.status='rented' AND b.end_ms<=?) OR (b.status IN ('reserved','preparing','ready','rented') AND b.start_ms<? AND b.end_ms>?))) AND NOT EXISTS (SELECT 1 FROM blocks k WHERE k.unit_id=u.id AND k.start_ms<? AND k.end_ms>?) RETURNING id`,[id,a,b,String(input.reason||'Bloqueio da operação').slice(0,200),input.kind,input.unit_id,Date.now(),b,a,b,a]).first();if(!r)throw new HttpError(409,'A unidade já possui reserva ou bloqueio nesse período.');return {ok:true};}
export async function deleteBlock(id:string){await statement('DELETE FROM blocks WHERE id=?',[id]).run();return {ok:true};}
export async function updateReservation(input:any){if(!['reserved','rented','returned','cancelled'].includes(input.status)||!['pending','paid'].includes(input.payment_status))throw new HttpError(400,'Status inválido.');const old=await first('SELECT * FROM reservations WHERE id=?',[input.id]);if(!old)throw new HttpError(404,'Reserva não encontrada.');if(['cancelled','returned'].includes(old.status)&&input.status!==old.status)throw new HttpError(409,'Uma reserva encerrada não pode ser reativada. Crie uma nova reserva.');const changed=await statement("UPDATE reservations SET status=?,payment_status=? WHERE id=? AND (status NOT IN ('cancelled','returned') OR status=?) RETURNING id",[input.status,input.payment_status,input.id,input.status]).first();if(!changed)throw new HttpError(409,'A reserva foi encerrada por outra operação. Atualize a lista.');return {ok:true};}
export async function uploadPhoto(req:Request){if(!env.BUCKET)throw new HttpError(503,'Envio de fotos ainda não está disponível.');const form=await req.formData(),file=form.get('file');if(!(file instanceof File)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024)throw new HttpError(400,'Envie uma foto JPG, PNG ou WebP de até 8 MB.');const id=crypto.randomUUID();await env.BUCKET.put('photos/'+id,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});return {url:'/api/rental/photos/'+id};}
export async function photoResponse(id:string){const obj=await env.BUCKET?.get('photos/'+id);if(!obj)throw new HttpError(404,'Foto não encontrada.');const headers=new Headers({'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'});obj.writeHttpMetadata(headers);return new Response(obj.body,{headers});}
