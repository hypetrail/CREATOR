import {env} from 'cloudflare:workers';
import {db,HttpError} from './rental-server';
import {validateDeliveryCustomer,type DeliveryCustomer} from './customer-delivery';
import {createReservationPdf,type PdfReservation,type ReservationDocumentKind} from './reservation-pdf';

type PrivateEnvironment=Cloudflare.Env&{CUSTOMER_DATA_KEY?:string};
interface Envelope {v:1;alg:'A256GCM';kid:string;iv:string;ct:string}
interface Booking extends PdfReservation {id:string;customer_id:string}
interface StoredCustomer {reservation_id:string;customer_id:string;envelope:string;created_ms:number}
interface StoredDocument {id:string;reservation_id:string;kind:ReservationDocumentKind;event_key:string;storage_key:string;sha256:string;created_ms:number;document_version:string;code?:string}
const encoder=new TextEncoder(),decoder=new TextDecoder();
const DOC_LIMIT=20*1024*1024;
const customerFields=new Set(['name','cpf','phone','email','birth','cep','street','number','district','city','state','complement','guardian','guardianCPF','guardianPhone','accompanied']);
const environment=()=>env as PrivateEnvironment;
const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const statement=(sql:string,args:unknown[]=[])=>db().prepare(sql).bind(...args);
const first=<T>(sql:string,args:unknown[]=[])=>statement(sql,args).first<T>();
function base64(bytes:Uint8Array){let text='';for(let offset=0;offset<bytes.length;offset+=16384)text+=String.fromCharCode(...bytes.subarray(offset,offset+16384));return btoa(text);}
function unbase64(value:string,maximum:number){
 const padding=value.endsWith('==')?2:value.endsWith('=')?1:0,body=padding?value.slice(0,-padding):value;
 if(value.length>Math.ceil(maximum/3)*4||value.length%4!==0||body.includes('=')||/[^A-Za-z0-9+/]/.test(body))throw new Error('invalid_encoding');
 const binary=atob(value),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
 if(bytes.length>maximum||base64(bytes)!==value)throw new Error('invalid_size');return bytes;
}
function configuredKey(){
 const raw=environment().CUSTOMER_DATA_KEY?.trim();if(!raw)return null;
 try{
  if(/^[a-f0-9]{64}$/i.test(raw))return Uint8Array.from(raw.match(/.{2}/g)!,value=>parseInt(value,16));
  const bytes=unbase64(raw,32);return bytes.length===32?bytes:null;
 }catch{return null;}
}
export function privateStorageConfigured(){return !!configuredKey();}
export function privateStorageConfiguration(){return {customer_data:privateStorageConfigured()?'configured':'not_configured',documents:privateStorageConfigured()&&!!environment().BUCKET?'configured':'not_configured'};}
async function keyMaterial(){
 const bytes=configuredKey();if(!bytes)throw new HttpError(503,'O armazenamento protegido do cadastro ainda não foi configurado.');
 const fingerprint=new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)));
 const kid=Array.from(fingerprint.subarray(0,8),value=>value.toString(16).padStart(2,'0')).join('');
 return {key:await crypto.subtle.importKey('raw',new Uint8Array(bytes),{name:'AES-GCM'},false,['encrypt','decrypt']),kid};
}
const additionalData=(scope:string,id:string)=>encoder.encode(`calori-private:v1:${scope}:${id}`);
async function seal(bytes:Uint8Array,scope:string,id:string){
 const {key,kid}=await keyMaterial(),iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:additionalData(scope,id),tagLength:128},key,new Uint8Array(bytes)));
 return JSON.stringify({v:1,alg:'A256GCM',kid,iv:base64(iv),ct:base64(ciphertext)} satisfies Envelope);
}
async function open(value:string,scope:string,id:string,maximum:number){
 // No raw cryptographic, customer, object-storage or provider error is returned.
 const material=await keyMaterial();
 try{
  if(value.length>Math.ceil((maximum+16)/3)*4+300)throw new Error('invalid_size');
  const envelope=JSON.parse(value) as Envelope;
  if(envelope.v!==1||envelope.alg!=='A256GCM'||envelope.kid!==material.kid||typeof envelope.iv!=='string'||typeof envelope.ct!=='string')throw new Error('invalid_envelope');
  const iv=unbase64(envelope.iv,12);if(iv.length!==12)throw new Error('invalid_iv');
  const ciphertext=unbase64(envelope.ct,maximum+16);
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:additionalData(scope,id),tagLength:128},material.key,ciphertext));
 }catch{throw new HttpError(503,'Não foi possível abrir o registro protegido. Contate a administração.');}
}
const booking=(id:string)=>first<Booking>('SELECT * FROM reservations WHERE id=?',[id]);
function normalizedCustomer(raw:unknown){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'Preencha a identificação do cliente.');
 if(Object.keys(raw).some(key=>!customerFields.has(key)))throw new HttpError(400,'Informe somente os campos de identificação do cliente.');
 return validateDeliveryCustomer(raw,Date.now(),{requireEmail:false});
}
async function loadCustomer(value:string,scope:string,id:string){
 try{
  const raw:unknown=JSON.parse(decoder.decode(await open(value,scope,id,32768)));
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.entries(raw).some(([field,content])=>!customerFields.has(field)||typeof content!=='string')||typeof (raw as Record<string,unknown>).name!=='string')throw new Error('invalid_customer');
  // An immutable reservation retains the responsible adult recorded then,
  // even after the customer reaches adulthood. Never normalize historical
  // identification against today's age while reading a saved contract.
  return raw as DeliveryCustomer;
 }
 catch(error){if(error instanceof HttpError)throw error;throw new HttpError(503,'Não foi possível abrir o cadastro protegido. Contate a administração.');}
}
async function customerAccount(id:string){
 const row=await first<{id:string;phone:string}>('SELECT id,phone FROM customers WHERE id=? AND disabled=0',[id]);
 if(!row)throw new HttpError(404,'Cadastro não encontrado.');return row;
}
function sameAccountPhone(customer:DeliveryCustomer,phone:string){
 if(customer.phone!==phone)throw new HttpError(400,'Use na identificação o WhatsApp da conta vinculada à reserva.');
}

/** Called only after authorization by the originating reservation capability. */
export async function saveReservationCustomer(reservationId:string,rawCustomer:unknown){
 if(!uuid(reservationId))throw new HttpError(404,'Reserva não encontrada.');
 const reservation=await booking(reservationId);if(!reservation)throw new HttpError(404,'Reserva não encontrada.');
 const existing=await first<StoredCustomer>('SELECT * FROM reservation_customer_data WHERE reservation_id=?',[reservationId]);
 if(existing)return {status:'exists' as const,customer:await loadCustomer(existing.envelope,'reservation-customer',reservationId),customer_id:existing.customer_id};
 const customer=normalizedCustomer(rawCustomer);
 if(reservation.customer_id)sameAccountPhone(customer,(await customerAccount(reservation.customer_id)).phone);
 const envelope=await seal(encoder.encode(JSON.stringify(customer)),'reservation-customer',reservationId),created=Date.now();
 await statement(`INSERT OR IGNORE INTO reservation_customer_data (reservation_id,customer_id,envelope,created_ms)
 SELECT id,customer_id,?,? FROM reservations WHERE id=? AND customer_id=?`,[envelope,created,reservationId,reservation.customer_id||'']).run();
 const saved=await first<StoredCustomer>('SELECT * FROM reservation_customer_data WHERE reservation_id=?',[reservationId]);
 if(!saved)throw new HttpError(409,'A reserva mudou durante o cadastro. Atualize a página.');
 const frozen=await loadCustomer(saved.envelope,'reservation-customer',reservationId);
 // Seed a new profile without overwriting edits made for another reservation.
 if(saved.customer_id){
  const profileEnvelope=await seal(encoder.encode(JSON.stringify(frozen)),'customer-profile',saved.customer_id);
  await statement('INSERT OR IGNORE INTO customer_profiles (customer_id,envelope,updated_ms) VALUES (?,?,?)',[saved.customer_id,profileEnvelope,created]).run();
 }
 return {status:'stored' as const,customer:frozen,customer_id:saved.customer_id};
}
export async function readReservationCustomer(reservationId:string):Promise<DeliveryCustomer|null>{
 const row=await first<StoredCustomer>('SELECT * FROM reservation_customer_data WHERE reservation_id=?',[reservationId]);
 return row?loadCustomer(row.envelope,'reservation-customer',reservationId):null;
}

export async function saveCustomerProfile(customerId:string,raw:unknown){
 const account=await customerAccount(customerId),profile=normalizedCustomer(raw);sameAccountPhone(profile,account.phone);
 const envelope=await seal(encoder.encode(JSON.stringify(profile)),'customer-profile',customerId),updated=Date.now();
 await statement('INSERT INTO customer_profiles (customer_id,envelope,updated_ms) VALUES (?,?,?) ON CONFLICT(customer_id) DO UPDATE SET envelope=excluded.envelope,updated_ms=excluded.updated_ms',[customerId,envelope,updated]).run();
 return {profile,updated_ms:updated};
}
export async function readCustomerProfile(customerId:string):Promise<DeliveryCustomer|null>{
 await customerAccount(customerId);
 const row=await first<{envelope:string}>('SELECT envelope FROM customer_profiles WHERE customer_id=?',[customerId]);
 return row?loadCustomer(row.envelope,'customer-profile',customerId):null;
}
const documentEvent=(reservation:Booking,kind:ReservationDocumentKind)=>`${kind}:${reservation.id}${kind==='pickup_confirmation'?':'+reservation.ready_ms:''}`;
function publicDocument(row:StoredDocument){return {id:row.id,reservation_id:row.reservation_id,kind:row.kind,created_ms:row.created_ms,document_version:row.document_version,url:'/api/customer/documents/'+row.id};}
async function digest(bytes:Uint8Array){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes))),value=>value.toString(16).padStart(2,'0')).join('');}

/** Reservation prices, time and clauses are always reloaded from trusted DB. */
export async function savePrivateReservationDocument({reservation,customer,kind='reservation',fontBytes}:{reservation:{id:string};customer?:unknown;kind?:ReservationDocumentKind;fontBytes:Uint8Array}){
 if(!['reservation','pickup_confirmation'].includes(kind)||!uuid(reservation.id))throw new HttpError(400,'Documento inválido.');
 const trusted=await booking(reservation.id);if(!trusted)throw new HttpError(404,'Reserva não encontrada.');
 if(kind==='pickup_confirmation'&&(trusted.status!=='ready'||!trusted.ready_ms||!trusted.pickup_ms))throw new HttpError(409,'Libere a moto antes de emitir a confirmação de retirada.');
 const event=documentEvent(trusted,kind),existing=await first<StoredDocument>('SELECT * FROM reservation_private_documents WHERE event_key=?',[event]);
 if(existing)return publicDocument(existing);
 const bucket=environment().BUCKET;if(!bucket)throw new HttpError(503,'O armazenamento privado de documentos ainda não está disponível.');
 let identification=await readReservationCustomer(trusted.id);
 if(!identification&&customer)identification=(await saveReservationCustomer(trusted.id,customer)).customer;
 if(!identification)throw new HttpError(409,'Complete a identificação do cliente antes de guardar o documento.');
 const bytes=await createReservationPdf({reservation:trusted,customer:identification,fontBytes,kind});
 if(bytes.length>DOC_LIMIT)throw new HttpError(413,'O documento ultrapassa o limite de armazenamento.');
 const id=crypto.randomUUID(),key='private-reservation-documents/'+id;
 const encrypted=await seal(bytes,'reservation-document',id);
 let version='historical';try{version=String(JSON.parse(trusted.terms_snapshot||'{}').document?.version||version);}catch{/* Preserve historical identification. */}
 const sha=await digest(bytes),created=Date.now();
 try{await bucket.put(key,encoder.encode(encrypted),{httpMetadata:{contentType:'application/octet-stream'}});}
 catch{throw new HttpError(503,'Não foi possível guardar o documento protegido. Tente novamente.');}
 try{
  await statement('INSERT OR IGNORE INTO reservation_private_documents (id,reservation_id,kind,event_key,storage_key,sha256,created_ms,document_version) VALUES (?,?,?,?,?,?,?,?)',[id,trusted.id,kind,event,key,sha,created,version]).run();
 }catch{await bucket.delete(key);throw new HttpError(503,'Não foi possível guardar o documento protegido. Tente novamente.');}
 const saved=await first<StoredDocument>('SELECT * FROM reservation_private_documents WHERE event_key=?',[event]);
 if(!saved){await bucket.delete(key);throw new HttpError(503,'Não foi possível concluir o registro do documento.');}
 if(saved.id!==id)await bucket.delete(key);
 return publicDocument(saved);
}
async function ownedReservation(reservationId:string,customerId:string){
 const row=await first<{id:string}>('SELECT id FROM reservations WHERE id=? AND customer_id=?',[reservationId,customerId]);
 if(!row)throw new HttpError(404,'Reserva não encontrada.');
}
export async function listPrivateDocumentsForCustomer(reservationId:string,customerId:string){
 await ownedReservation(reservationId,customerId);
 return listPrivateDocumentsForOwner(reservationId);
}
/** Caller must already have verified the single administrator identity. */
export async function listPrivateDocumentsForOwner(reservationId:string){
 if(!uuid(reservationId))throw new HttpError(404,'Reserva não encontrada.');
 const rows=await statement('SELECT * FROM reservation_private_documents WHERE reservation_id=? ORDER BY created_ms DESC',[reservationId]).all<StoredDocument>();
 return {documents:(rows.results||[]).map(publicDocument)};
}
async function documentResponse(id:string,customerId?:string){
 if(!uuid(id))throw new HttpError(404,'Documento não encontrado.');
 // Ownership is checked in the lookup, before touching keys or object storage.
 const row=await first<StoredDocument>(`SELECT d.*,r.code FROM reservation_private_documents d JOIN reservations r ON r.id=d.reservation_id WHERE d.id=?${customerId===undefined?'':' AND r.customer_id=?'}`,customerId===undefined?[id]:[id,customerId]);
 if(!row)throw new HttpError(404,'Documento não encontrado.');
 let object:R2ObjectBody|null|undefined;
 try{object=await environment().BUCKET?.get(row.storage_key);}
 catch{throw new HttpError(503,'O documento protegido está temporariamente indisponível.');}
 if(!object)throw new HttpError(404,'Documento indisponível.');
 if(object.size>Math.ceil((DOC_LIMIT+16)/3)*4+300)throw new HttpError(503,'Documento protegido inválido.');
 let encoded:string;
 try{encoded=await object.text();}catch{throw new HttpError(503,'O documento protegido está temporariamente indisponível.');}
 const bytes=await open(encoded,'reservation-document',row.id,DOC_LIMIT);
 if(decoder.decode(bytes.subarray(0,5))!=='%PDF-'||await digest(bytes)!==row.sha256)throw new HttpError(503,'Não foi possível validar o documento protegido.');
 const code=String(row.code||row.reservation_id).replace(/[^A-Za-z0-9_-]/g,'-');
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${row.kind==='pickup_confirmation'?'Retirada':'Reserva'}-${code}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
}
export function documentResponseForCustomer(id:string,customerId:string){return documentResponse(id,customerId);}
export function documentResponseForOwner(id:string){return documentResponse(id);}
