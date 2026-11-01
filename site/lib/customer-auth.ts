import {env} from 'cloudflare:workers';
import {db,HttpError} from './rental-server';
import {phone as normalizePhone} from './rental';
import {whatsappAuthConfigured,sendWhatsAppAuthCode,type WhatsAppEnvironment} from './whatsapp-server';

const COOKIE='calori_customer',SESSION_MS=7*86400_000,PASSWORD_ITERATIONS=600_000;
const encoder=new TextEncoder();
const CONSENT_VERSION='customer-whatsapp-v1';
type Input=Record<string,unknown>;
export interface CustomerIdentity {
 id:string;phone:string;phone_verified:boolean;created_ms:number;
 operational_whatsapp:boolean;marketing_whatsapp:boolean;
}
interface CustomerRow {
 id:string;phone:string;phone_verified:number;service_consent:number;marketing_consent:number;
 created_ms:number;disabled:number;
}
interface AuthRow extends CustomerRow {password_hash:string}
interface Challenge {customer_id:string;nonce:string;code_hash:string;requested_ms:number;expires_ms:number;attempts:number;status:string}
type CustomerEnvironment=Cloudflare.Env&WhatsAppEnvironment&{CUSTOMER_OTP_SECRET?:string};
const environment=()=>env as CustomerEnvironment;
const jsonHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export const customerResponseHeaders=jsonHeaders;

function strict(input:Input,keys:string[]){
 if(Object.keys(input).some(key=>!keys.includes(key)))throw new HttpError(400,'A solicitação contém campos não permitidos.');
}
function phone(value:unknown){
 if(typeof value!=='string'||value.length>30||!/^[+\d\s().-]+$/.test(value))throw new HttpError(400,'Informe um WhatsApp brasileiro válido com DDD.');
 try{return normalizePhone(value);}catch{throw new HttpError(400,'Informe um WhatsApp brasileiro válido com DDD.');}
}
function hex(bytes:Uint8Array){return Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('');}
function fromHex(value:string){return Uint8Array.from(value.match(/.{2}/g)||[],byte=>parseInt(byte,16));}
async function digest(value:string){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));}
function equals(a:string,b:string){
 let mismatch=a.length^b.length;
 for(let i=0;i<Math.max(a.length,b.length);i++)mismatch|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
 return mismatch===0;
}
function password(value:unknown,register=false){
 if(typeof value!=='string'||Array.from(value).length>128||encoder.encode(value).length>512)throw new HttpError(400,'Use uma senha com 12 a 128 caracteres.');
 if(register){
  const simple=value.toLocaleLowerCase('pt-BR');
  if(Array.from(value).length<12||/^(.)\1+$/u.test(value)||['123456789012','1234567890123456','password1234','password12345','senha12345678','calorimob1234','calorigo12345','qwertyuiop12'].includes(simple))throw new HttpError(400,'Use uma senha de pelo menos 12 caracteres, evitando sequências e senhas comuns.');
 }
 return value;
}
async function derive(value:string,salt:Uint8Array){
 const key=await crypto.subtle.importKey('raw',encoder.encode(value),{name:'PBKDF2'},false,['deriveBits']);
 return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(salt),iterations:PASSWORD_ITERATIONS},key,256)));
}
export async function hashCustomerPassword(value:string){
 password(value,true);
 const salt=crypto.getRandomValues(new Uint8Array(32));
 return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${hex(salt)}$${await derive(value,salt)}`;
}
async function verifyPassword(value:string,encoded:string){
 const parts=encoded.split('$');
 if(parts.length!==4||parts[0]!=='pbkdf2-sha256'||parts[1]!==String(PASSWORD_ITERATIONS)||!/^([a-f0-9]{64})$/.test(parts[2])||!/^([a-f0-9]{64})$/.test(parts[3]))return false;
 return equals(await derive(value,fromHex(parts[2])),parts[3]);
}
const dummyHash=`pbkdf2-sha256$${PASSWORD_ITERATIONS}$${'0'.repeat(64)}$${'0'.repeat(64)}`;
function toIdentity(row:CustomerRow):CustomerIdentity{
 return {id:row.id,phone:row.phone,phone_verified:row.phone_verified===1,created_ms:row.created_ms,operational_whatsapp:row.service_consent===1,marketing_whatsapp:row.marketing_consent===1};
}
export function publicCustomer(customer:CustomerIdentity){
 return {id:customer.id,phone_masked:`+55 (${customer.phone.slice(2,4)}) *****-${customer.phone.slice(-4)}`,phone_verified:customer.phone_verified,created_ms:customer.created_ms,operational_whatsapp:customer.operational_whatsapp,marketing_whatsapp:customer.marketing_whatsapp};
}
const customerById=(id:string)=>db().prepare('SELECT id,phone,phone_verified,service_consent,marketing_consent,created_ms,disabled FROM customers WHERE id=? AND disabled=0').bind(id).first<CustomerRow>();
function requireHttps(req:Request){
 const url=new URL(req.url);
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new HttpError(503,'O acesso à conta exige uma conexão HTTPS.');
}
export function requireCustomerOrigin(req:Request){
 requireHttps(req);
 if(req.method!=='GET'&&req.method!=='HEAD'){
  const origin=req.headers.get('origin');
  if((origin&&origin!==new URL(req.url).origin)||req.headers.get('sec-fetch-site')==='cross-site')throw new HttpError(403,'Origem da solicitação inválida.');
 }
}
function tokenFrom(req:Request){
 const cookies=req.headers.get('cookie')||'';
 if(cookies.length>8192)return '';
 const value=cookies.split(';').map(item=>item.trim()).find(item=>item.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
 return /^[a-f0-9]{64}$/.test(value)?value:'';
}
export async function customerIdentity(req:Request):Promise<CustomerIdentity|null>{
 requireHttps(req);
 const token=tokenFrom(req);if(!token)return null;
 const row=await db().prepare(`SELECT c.id,c.phone,c.phone_verified,c.service_consent,c.marketing_consent,c.created_ms,c.disabled FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.token_hash=? AND s.expires_ms>? AND c.disabled=0`).bind(await digest(token),Date.now()).first<CustomerRow>();
 return row?toIdentity(row):null;
}
export async function requireCustomer(req:Request){const customer=await customerIdentity(req);if(!customer)throw new HttpError(401,'Entre na sua conta para continuar.');return customer;}
function cookie(req:Request,token:string,maxAge:number){
 return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
}
async function createSession(req:Request,customerId:string,expectedPasswordHash:string){
 const token=hex(crypto.getRandomValues(new Uint8Array(32))),now=Date.now();
 // Password verification can overlap a password reset. Bind session creation
 // to the exact credential that was verified so an old login cannot recreate
 // a session after recovery revoked the previous credentials and sessions.
 const inserted=await db().prepare(`INSERT INTO customer_sessions (token_hash,customer_id,expires_ms,created_ms)
 SELECT ?,?,?,? FROM customers WHERE id=? AND password_hash=? AND disabled=0 RETURNING token_hash`).bind(await digest(token),customerId,now+SESSION_MS,now,customerId,expectedPasswordHash).first();
 if(!inserted)throw new HttpError(401,'Telefone ou senha inválidos.');
 await db().prepare('DELETE FROM customer_sessions WHERE expires_ms<=?').bind(now).run();
 return cookie(req,token,SESSION_MS/1000);
}
/** The hosting proxy must overwrite CF-Connecting-IP. Unknown IPs share a
 * conservative bucket; phone-specific buckets still protect against spoofing. */
async function rateLimit(req:Request,label:string,phoneValue:string,limit:number,windowMs:number){
 const now=Date.now(),ip=req.headers.get('cf-connecting-ip')||'unknown';
 const keys=[await digest(`${label}:phone:${phoneValue}`),await digest(`${label}:ip:${ip}`)];
 for(let i=0;i<keys.length;i++){
  const row=await db().prepare(`INSERT INTO customer_auth_limits (key_hash,window_ms,count) VALUES (?,?,1) ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN window_ms<=? THEN 1 ELSE count+1 END,window_ms=CASE WHEN window_ms<=? THEN excluded.window_ms ELSE window_ms END RETURNING count`).bind(keys[i],now,now-windowMs,now-windowMs).first<{count:number}>();
  if(row&&row.count>(i===0?limit:limit*4))throw new HttpError(429,'Muitas tentativas. Aguarde antes de tentar novamente.');
 }
 await db().prepare('DELETE FROM customer_auth_limits WHERE window_ms<?').bind(now-2*86400_000).run();
}
function consents(input:Input){
 for(const key of ['operational_whatsapp','marketing_whatsapp'])if(input[key]!==undefined&&typeof input[key]!=='boolean')throw new HttpError(400,'Confira suas preferências de mensagens.');
 return {service:input.operational_whatsapp===true,marketing:input.marketing_whatsapp===true};
}
export async function registerCustomer(req:Request,input:Input){
 requireCustomerOrigin(req);strict(input,['phone','password','operational_whatsapp','marketing_whatsapp']);
 const number=phone(input.phone);await rateLimit(req,'register',number,3,3_600_000);
 const value=password(input.password,true),preferences=consents(input);
 if(value.replace(/\D/g,'')===number||value.replace(/\D/g,'')===number.slice(2))throw new HttpError(400,'Escolha uma senha diferente do seu telefone.');
 const hash=await hashCustomerPassword(value),id=crypto.randomUUID(),now=Date.now();
 const inserted=await db().prepare(`INSERT INTO customers (id,phone,password_hash,phone_verified,service_consent,marketing_consent,service_consent_ms,marketing_consent_ms,consent_version,created_ms,updated_ms,disabled) VALUES (?,?,?,0,?,?,?,?,?,?,?,0) ON CONFLICT(phone) DO NOTHING RETURNING id`).bind(id,number,hash,preferences.service?1:0,preferences.marketing?1:0,preferences.service?now:null,preferences.marketing?now:null,CONSENT_VERSION,now,now).first();
 if(!inserted)throw new HttpError(400,'Não foi possível concluir o cadastro. Confira os dados ou entre na sua conta.');
 const row=await customerById(id);if(!row)throw new HttpError(503,'Não foi possível concluir o cadastro.');
 return {customer:publicCustomer(toIdentity(row)),setCookie:await createSession(req,id,hash)};
}
export async function loginCustomer(req:Request,input:Input){
 requireCustomerOrigin(req);strict(input,['phone','password']);
 let number:string;try{number=phone(input.phone);}catch{throw new HttpError(401,'Telefone ou senha inválidos.');}
 await rateLimit(req,'login',number,8,15*60_000);
 let value:string;try{value=password(input.password);}catch{throw new HttpError(401,'Telefone ou senha inválidos.');}
 const row=await db().prepare('SELECT * FROM customers WHERE phone=?').bind(number).first<AuthRow>();
 const valid=await verifyPassword(value,row?.password_hash||dummyHash);
 if(!row||row.disabled!==0||!valid)throw new HttpError(401,'Telefone ou senha inválidos.');
 return {customer:publicCustomer(toIdentity(row)),setCookie:await createSession(req,row.id,row.password_hash)};
}
export async function logoutCustomer(req:Request){
 requireCustomerOrigin(req);const token=tokenFrom(req);
 if(token)await db().prepare('DELETE FROM customer_sessions WHERE token_hash=?').bind(await digest(token)).run();
 return {ok:true,setCookie:cookie(req,'',0)};
}
export async function customerPreferences(req:Request,input:Input){
 requireCustomerOrigin(req);strict(input,['operational_whatsapp','marketing_whatsapp']);
 const identity=await requireCustomer(req),next=consents(input),now=Date.now();
 const service=input.operational_whatsapp===undefined?identity.operational_whatsapp:next.service;
 const marketing=input.marketing_whatsapp===undefined?identity.marketing_whatsapp:next.marketing;
 await db().prepare('UPDATE customers SET service_consent=?,marketing_consent=?,service_consent_ms=?,marketing_consent_ms=?,consent_version=?,updated_ms=? WHERE id=?').bind(service?1:0,marketing?1:0,service?now:null,marketing?now:null,CONSENT_VERSION,now,identity.id).run();
 if(!service)await db().prepare("UPDATE reservation_document_deliveries SET status='revoked',updated_ms=? WHERE kind='whatsapp_consent' AND reservation_id IN (SELECT id FROM reservations WHERE customer_id=?)").bind(now,identity.id).run();
 return {customer:publicCustomer({...identity,operational_whatsapp:service,marketing_whatsapp:marketing})};
}
export async function customerReservations(req:Request){
 const customer=await requireCustomer(req);
 const rows=(await db().prepare('SELECT * FROM reservations WHERE customer_id=? ORDER BY created_ms DESC LIMIT 200').bind(customer.id).all<Record<string,unknown>>()).results||[];
 const allowed=['id','code','model_id','model_name','color','color_name','unit_label','start_ms','end_ms','days','daily_cents','protection_daily_cents','total_cents','insurance','payment_method','payment_status','status','created_ms','terms_version','terms_snapshot','ready_ms','pickup_ms','actual_start_ms','actual_end_ms','due_ms','late_fee_cents','late_fee_status'];
 return {reservations:rows.map(row=>Object.fromEntries(allowed.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]))),server_now_ms:Date.now()};
}
function otpSecret(){const secret=environment().CUSTOMER_OTP_SECRET;return typeof secret==='string'&&secret.length>=32?secret:null;}
async function otpHash(code:string,nonce:string,customerId:string){
 const secret=otpSecret();if(!secret)throw new HttpError(503,'A verificação de WhatsApp ainda não foi conectada.');
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(`${customerId}:${nonce}:${code}`))));
}
export function customerVerificationConfigured(){return !!otpSecret()&&whatsappAuthConfigured(environment());}
export async function requestCustomerVerification(req:Request,input:Input){
 requireCustomerOrigin(req);strict(input,[]);const identity=await requireCustomer(req);
 if(identity.phone_verified)return {status:'already_verified',message:'Seu WhatsApp já foi confirmado.'};
 if(!customerVerificationConfigured())return {status:'not_configured',message:'A confirmação de WhatsApp ainda não foi conectada. Seu cadastro continua disponível; os avisos automáticos aguardam essa confirmação.'};
 await rateLimit(req,'verification',identity.phone,5,3_600_000);
 const now=Date.now(),nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
 // Rejection sampling avoids modulo bias when choosing the six-digit code.
 const random=new Uint32Array(1);let value:number;do{crypto.getRandomValues(random);value=random[0];}while(value>=4_294_000_000);
 const code=String(value%1_000_000).padStart(6,'0'),hash=await otpHash(code,nonce,identity.id);
 const row=await db().prepare(`INSERT INTO customer_phone_challenges (customer_id,nonce,code_hash,requested_ms,expires_ms,attempts,status) VALUES (?,?,?,?,?,0,'sending') ON CONFLICT(customer_id) DO UPDATE SET nonce=excluded.nonce,code_hash=excluded.code_hash,requested_ms=excluded.requested_ms,expires_ms=excluded.expires_ms,attempts=0,status='sending' WHERE requested_ms<=? RETURNING customer_id`).bind(identity.id,nonce,hash,now,now+5*60_000,now-60_000).first();
 if(!row)throw new HttpError(429,'Aguarde um minuto antes de pedir outro código.');
 const result=await sendWhatsAppAuthCode({environment:environment(),to:identity.phone,code});
 const active=result.status==='submitted'||result.status==='uncertain';
 await db().prepare('UPDATE customer_phone_challenges SET status=? WHERE customer_id=? AND nonce=?').bind(active?'active':'failed',identity.id,nonce).run();
 if(result.status==='submitted')return {status:'submitted',message:'Código solicitado ao WhatsApp. Digite os seis números recebidos; ele expira em cinco minutos.'};
 if(result.status==='uncertain')return {status:'uncertain',message:'O serviço não confirmou o envio. Se receber o código, você pode digitá-lo; aguarde antes de solicitar outro.'};
 return {status:result.status,message:result.status==='not_configured'?'A confirmação de WhatsApp ainda não foi conectada.':'Não foi possível enviar o código. Aguarde antes de tentar novamente.'};
}
export async function confirmCustomerVerification(req:Request,input:Input){
 requireCustomerOrigin(req);strict(input,['code']);const identity=await requireCustomer(req);
 if(identity.phone_verified)return {customer:publicCustomer(identity)};
 if(typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw new HttpError(400,'Digite o código de seis números recebido no WhatsApp.');
 const now=Date.now();
 const challenge=await db().prepare("UPDATE customer_phone_challenges SET attempts=attempts+1 WHERE customer_id=? AND status='active' AND expires_ms>? AND attempts<5 RETURNING *").bind(identity.id,now).first<Challenge>();
 if(!challenge||!equals(await otpHash(input.code,challenge.nonce,identity.id),challenge.code_hash))throw new HttpError(400,'Código inválido ou expirado. Confira o WhatsApp ou solicite outro código.');
 await db().batch([
  db().prepare("UPDATE customers SET phone_verified=1,updated_ms=? WHERE id=? AND phone=? AND EXISTS (SELECT 1 FROM customer_phone_challenges WHERE customer_id=? AND nonce=? AND status='active' AND expires_ms>?)").bind(now,identity.id,identity.phone,identity.id,challenge.nonce,now),
  db().prepare('DELETE FROM customer_phone_challenges WHERE customer_id=? AND nonce=?').bind(identity.id,challenge.nonce),
 ]);
 const row=await customerById(identity.id);if(!row?.phone_verified)throw new HttpError(409,'O código foi substituído. Solicite a verificação novamente.');
 return {customer:publicCustomer(toIdentity(row))};
}

/** Recovery proves control of the phone and never relies on knowing a booking
 * code, CPF, an existing cookie, or the password of an unverified signup. */
export async function requestCustomerPasswordReset(req:Request,input:Input){
 requireCustomerOrigin(req);strict(input,['phone']);const number=phone(input.phone);
 if(!customerVerificationConfigured())return {status:'not_configured',message:'A recuperação por WhatsApp ainda não foi conectada. Entre em contato com a loja; nenhum código foi enviado.'};
 await rateLimit(req,'password-reset',number,3,3_600_000);
 const generic={status:'requested',message:'Se houver uma conta com esse número, um código será solicitado ao WhatsApp. Ele expira em cinco minutos.'};
 const customer=await db().prepare('SELECT id,phone FROM customers WHERE phone=? AND disabled=0').bind(number).first<{id:string;phone:string}>();
 if(!customer)return generic;
 const now=Date.now(),nonce=hex(crypto.getRandomValues(new Uint8Array(16)));
 const random=new Uint32Array(1);let value:number;do{crypto.getRandomValues(random);value=random[0];}while(value>=4_294_000_000);
 const code=String(value%1_000_000).padStart(6,'0'),hash=await otpHash(code,nonce,'password-reset:'+customer.id);
 const changed=await db().prepare(`INSERT INTO customer_password_resets (customer_id,nonce,code_hash,requested_ms,expires_ms,attempts,status) VALUES (?,?,?,?,?,0,'sending') ON CONFLICT(customer_id) DO UPDATE SET nonce=excluded.nonce,code_hash=excluded.code_hash,requested_ms=excluded.requested_ms,expires_ms=excluded.expires_ms,attempts=0,status='sending' WHERE requested_ms<=? RETURNING customer_id`).bind(customer.id,nonce,hash,now,now+5*60_000,now-60_000).first();
 if(!changed)return generic;
 const result=await sendWhatsAppAuthCode({environment:environment(),to:number,code});
 await db().prepare('UPDATE customer_password_resets SET status=? WHERE customer_id=? AND nonce=?').bind(['submitted','uncertain'].includes(result.status)?'active':'failed',customer.id,nonce).run();
 return generic;
}
export async function resetCustomerPassword(req:Request,input:Input){
 requireCustomerOrigin(req);strict(input,['phone','code','password']);const number=phone(input.phone),newPassword=password(input.password,true);
 if(typeof input.code!=='string'||!/^\d{6}$/.test(input.code))throw new HttpError(400,'Código inválido ou expirado. Solicite outro código.');
 const customer=await db().prepare('SELECT id,phone_verified FROM customers WHERE phone=? AND disabled=0').bind(number).first<{id:string;phone_verified:number}>();
 if(!customer)throw new HttpError(400,'Código inválido ou expirado. Solicite outro código.');
 const now=Date.now(),challenge=await db().prepare("UPDATE customer_password_resets SET attempts=attempts+1 WHERE customer_id=? AND status='active' AND expires_ms>? AND attempts<5 RETURNING *").bind(customer.id,now).first<Challenge>();
 if(!challenge||!equals(await otpHash(input.code,challenge.nonce,'password-reset:'+customer.id),challenge.code_hash))throw new HttpError(400,'Código inválido ou expirado. Solicite outro código.');
 const hash=await hashCustomerPassword(newPassword),completed=Date.now();
 let restoredId=customer.id,historyReviewRequired=false;
 if(customer.phone_verified===0){
  // A phone number may have been registered by somebody else before its
  // ownership was ever proved. Recovery proves the number, not the identity of
  // the original signup. Keep that signup's PII/documents on its retired ID;
  // never expose them automatically to the newly proved phone owner.
  restoredId=crypto.randomUUID();historyReviewRequired=true;
  const retiredPhone='reclaimed:'+restoredId;
  await db().batch([
   db().prepare(`UPDATE customers SET phone=?,disabled=1,service_consent=0,marketing_consent=0,service_consent_ms=NULL,marketing_consent_ms=NULL,updated_ms=?
    WHERE id=? AND phone=? AND phone_verified=0 AND disabled=0
    AND EXISTS (SELECT 1 FROM customer_password_resets WHERE customer_id=? AND nonce=? AND status='active' AND expires_ms>?)`).bind(retiredPhone,completed,customer.id,number,customer.id,challenge.nonce,completed),
   db().prepare(`INSERT INTO customers (id,phone,password_hash,phone_verified,service_consent,marketing_consent,service_consent_ms,marketing_consent_ms,consent_version,created_ms,updated_ms,disabled)
    SELECT ?,?,?,1,0,0,NULL,NULL,?,?,?,0 FROM customers old
    WHERE old.id=? AND old.phone=? AND old.disabled=1
    AND EXISTS (SELECT 1 FROM customer_password_resets WHERE customer_id=? AND nonce=? AND status='active' AND expires_ms>?)`).bind(restoredId,number,hash,CONSENT_VERSION,completed,completed,customer.id,retiredPhone,customer.id,challenge.nonce,completed),
   db().prepare('DELETE FROM customer_sessions WHERE customer_id=? AND EXISTS (SELECT 1 FROM customers WHERE id=? AND phone=? AND disabled=0)').bind(customer.id,restoredId,number),
   db().prepare('DELETE FROM customer_phone_challenges WHERE customer_id=? AND EXISTS (SELECT 1 FROM customers WHERE id=? AND phone=? AND disabled=0)').bind(customer.id,restoredId,number),
   db().prepare('DELETE FROM customer_password_resets WHERE customer_id=? AND nonce=? AND EXISTS (SELECT 1 FROM customers WHERE id=? AND phone=? AND disabled=0)').bind(customer.id,challenge.nonce,restoredId,number),
  ]);
 }else{
  await db().batch([
   db().prepare(`UPDATE customers SET password_hash=?,updated_ms=? WHERE id=? AND phone=? AND phone_verified=1 AND disabled=0
    AND EXISTS (SELECT 1 FROM customer_password_resets WHERE customer_id=? AND nonce=? AND status='active' AND expires_ms>?)`).bind(hash,completed,customer.id,number,customer.id,challenge.nonce,completed),
   db().prepare("DELETE FROM customer_sessions WHERE customer_id=? AND EXISTS (SELECT 1 FROM customer_password_resets WHERE customer_id=? AND nonce=? AND status='active' AND expires_ms>?)").bind(customer.id,customer.id,challenge.nonce,completed),
   db().prepare('DELETE FROM customer_password_resets WHERE customer_id=? AND nonce=?').bind(customer.id,challenge.nonce),
  ]);
 }
 const row=await db().prepare('SELECT * FROM customers WHERE id=? AND disabled=0').bind(restoredId).first<AuthRow>();
 if(!row||!equals(row.password_hash,hash))throw new HttpError(409,'O código foi substituído ou expirou. Solicite a recuperação novamente.');
 return {customer:publicCustomer(toIdentity(row)),setCookie:await createSession(req,row.id,hash),history_review_required:historyReviewRequired,message:historyReviewRequired?'Telefone confirmado e novo acesso criado. Por segurança, cadastros e reservas anteriores de um telefone que não havia sido verificado precisam ser conferidos pela loja.':'Senha alterada. As sessões anteriores foram encerradas.'};
}
