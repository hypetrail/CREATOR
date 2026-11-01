import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),environment={};
globalThis.__PrivateCustomerTestEnv=environment;
const shim={name:'test-env',setup(builder){builder.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));builder.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env=globalThis.__PrivateCustomerTestEnv;'}));}};
async function compile(path){const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false,plugins:[shim]});const compiled={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);return compiled.exports;}
const storage=await compile('lib/private-customer-store.ts'),route=await compile('app/api/customer/[...path]/route.ts'),policy=await compile('lib/document-policy.ts');
let sqlite,objects;
const ownerId=crypto.randomUUID(),otherId=crypto.randomUUID();
const customer={name:'Cliente Demonstração Protegida',cpf:'52998224725',phone:'19999999999',email:'cliente@example.com',birth:'2000-01-01',cep:'13720146',street:'Rua de Demonstração',number:'123',district:'Centro',city:'Cidade Teste',state:'SP'};
const fontBytes=readFileSync('public/fonts/DejaVuSans.ttf');
function adapter(connection){return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return connection.prepare(sql).get(...args)||null;},async all(){return {results:connection.prepare(sql).all(...args)};},async run(){const result=connection.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){connection.exec('BEGIN');try{const results=[];for(const item of statements)results.push(await item.run());connection.exec('COMMIT');return results;}catch(error){connection.exec('ROLLBACK');throw error;}}};}
function fixture({configured=true,bucket=true}={}){
 sqlite?.close();sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(file=>file.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 for(const key of Object.keys(environment))delete environment[key];environment.DB=adapter(sqlite);objects=new Map();
 if(configured)environment.CUSTOMER_DATA_KEY='24'.repeat(32);
 if(bucket)environment.BUCKET={async put(key,value){objects.set(key,new Uint8Array(value));},async get(key){const bytes=objects.get(key);return bytes?{size:bytes.length,async text(){return new TextDecoder().decode(bytes);}}:null;},async delete(key){objects.delete(key);}};
 const now=Date.now();
 sqlite.prepare('INSERT INTO customers (id,phone,password_hash,created_ms,updated_ms) VALUES (?,?,?,?,?)').run(ownerId,'5519999999999','unused-test-hash',now,now);
 sqlite.prepare('INSERT INTO customers (id,phone,password_hash,created_ms,updated_ms) VALUES (?,?,?,?,?)').run(otherId,'5519888888888','unused-test-hash',now,now);
}
function reservation(customerId=ownerId,extra={}){
 const id=crypto.randomUUID(),start=Date.parse('2030-10-15T09:00:00-03:00'),end=start+2*86400000;
 const snapshot=JSON.stringify({document:policy.defaultDocumentPolicy,address:'Endereço de retirada',delay_daily_cents:4500});
 sqlite.prepare(`INSERT INTO reservations (id,code,request_key,unit_id,model_id,model_name,start_ms,end_ms,days,daily_cents,protection_daily_cents,total_cents,name,phone,email,city,payment_method,payment_status,status,created_ms,customer_id,terms_version,terms_snapshot) VALUES (?,?,?,?,?,?,?,?,2,3000,1500,9000,'','','','','pickup','pending','reserved',?,?,'rental-v1',?)`).run(id,'CG-'+id.slice(0,8),crypto.randomUUID(),'unit-'+id,'t1','T1',start,end,Date.now(),customerId,snapshot);
 for(const [column,value] of Object.entries(extra))sqlite.prepare('UPDATE reservations SET '+column+'=? WHERE id=?').run(value,id);
 return {id};
}
async function cookie(customerId,token='ab'.repeat(32)){
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))),byte=>byte.toString(16).padStart(2,'0')).join('');
 sqlite.prepare('INSERT INTO customer_sessions (token_hash,customer_id,expires_ms,created_ms) VALUES (?,?,?,?)').run(hash,customerId,Date.now()+3600000,Date.now());
 return 'calori_customer='+token;
}
const req=(path,session='',body)=>new Request('https://calori.test/api/customer/'+path,{method:body===undefined?'GET':'POST',headers:{...(session?{Cookie:session}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
const status=code=>error=>error.status===code;
function pdfText(bytes){const dir=mkdtempSync(join(tmpdir(),'calori-private-pdf-'));try{const path=join(dir,'document.pdf');writeFileSync(path,bytes);return execFileSync('pdftotext',[path,'-'],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true});}}

test('full identification is authenticated-encrypted, first reservation snapshot is immutable, and editable profile cannot rewrite it',async()=>{
 fixture();const booking=reservation();const saved=await storage.saveReservationCustomer(booking.id,customer);assert.equal(saved.status,'stored');assert.equal(saved.customer.phone,'5519999999999');
 const rows=JSON.stringify({snapshot:sqlite.prepare('SELECT * FROM reservation_customer_data').get(),profile:sqlite.prepare('SELECT * FROM customer_profiles').get()});
 for(const value of [customer.name,customer.cpf,customer.email,customer.street])assert.equal(rows.includes(value),false);
 assert.equal(JSON.parse(sqlite.prepare('SELECT envelope FROM reservation_customer_data').get().envelope).alg,'A256GCM');
 const changed={...customer,name:'Outro Nome de Demonstração',street:'Outra Rua'};
 await storage.saveCustomerProfile(ownerId,changed);
 assert.equal((await storage.readCustomerProfile(ownerId)).name,changed.name);
 const repeated=await storage.saveReservationCustomer(booking.id,changed);assert.equal(repeated.status,'exists');assert.equal(repeated.customer.name,customer.name);
 assert.equal((await storage.readReservationCustomer(booking.id)).street,customer.street);
 assert.throws(()=>sqlite.prepare("UPDATE reservation_customer_data SET envelope='{}'").run(),/IMMUTABLE/);
});
test('missing or malformed encryption keys never fall back to plaintext and profile access remains authenticated',async()=>{
 fixture({configured:false});const booking=reservation();assert.equal(storage.privateStorageConfigured(),false);
 await assert.rejects(()=>storage.saveReservationCustomer(booking.id,customer),status(503));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservation_customer_data').get().n,0);
 for(const key of ['not-a-secret','a'.repeat(63),'AA==','ab'.repeat(33)]){environment.CUSTOMER_DATA_KEY=key;assert.equal(storage.privateStorageConfigured(),false);}
 environment.CUSTOMER_DATA_KEY=Buffer.alloc(32,7).toString('base64');assert.equal(storage.privateStorageConfigured(),true);
 assert.equal((await route.GET(req('profile'))).status,401);
 const session=await cookie(ownerId);delete environment.CUSTOMER_DATA_KEY;
 const response=await route.GET(req('profile',session));assert.equal(response.status,200);const data=await response.json();assert.equal(data.profile,null);assert.equal(data.storage_configured,false);assert.equal(data.account_phone,'5519999999999');
});
test('authenticated encryption rejects cross-record substitution and wrong keys without exposing customer data',async()=>{
 fixture();const a=reservation(),b=reservation();await storage.saveReservationCustomer(a.id,customer);await storage.saveReservationCustomer(b.id,customer);
 sqlite.exec('DROP TRIGGER reservation_customer_data_immutable');
 const encrypted=sqlite.prepare('SELECT envelope FROM reservation_customer_data WHERE reservation_id=?').get(a.id).envelope;
 sqlite.prepare('UPDATE reservation_customer_data SET envelope=? WHERE reservation_id=?').run(encrypted,b.id);
 await assert.rejects(()=>storage.readReservationCustomer(b.id),error=>error.status===503&&!error.message.includes(customer.name));
 environment.CUSTOMER_DATA_KEY='35'.repeat(32);await assert.rejects(()=>storage.readReservationCustomer(a.id),status(503));
});
test('profiles and own-phone binding cannot be changed by customer identifiers in public input',async()=>{
 fixture();const session=await cookie(ownerId),booking=reservation();
 assert.equal((await route.POST(req('profile',session,{profile:customer,customer_id:otherId}))).status,400);
 assert.equal((await route.POST(req('profile',session,{profile:{...customer,phone:'19888888888'}}))).status,400);
 await assert.rejects(()=>storage.saveReservationCustomer(booking.id,{...customer,phone:'19888888888'}),status(400));
 const saved=await route.POST(req('profile',session,{profile:customer}));assert.equal(saved.status,200);
 const fetched=await route.GET(req('profile',session));assert.equal((await fetched.json()).profile.name,customer.name);
 const otherSession=await cookie(otherId,'cd'.repeat(32));assert.equal((await (await route.GET(req('profile',otherSession))).json()).profile,null);
});
test('stored PDFs contain trusted prices and frozen identification while database and R2 never contain plaintext PDF or CPF',async()=>{
 fixture();const booking=reservation();await storage.saveReservationCustomer(booking.id,customer);
 const doc=await storage.savePrivateReservationDocument({reservation:{...booking,total_cents:1,model_name:'Injected Model'},customer:{...customer,name:'Injected Name'},fontBytes});
 const response=await storage.documentResponseForOwner(doc.id),bytes=new Uint8Array(await response.arrayBuffer());assert.equal(response.headers.get('Content-Type'),'application/pdf');assert.match(response.headers.get('Cache-Control'),/no-store/);
 const text=pdfText(bytes);assert.match(text,/Cliente Demonstração Protegida/);assert.match(text,/90,00/);assert.match(text,/T1/);assert.doesNotMatch(text,/Injected/);
 const object=objects.values().next().value;assert.notEqual(new TextDecoder().decode(object.subarray(0,5)),'%PDF-');assert.equal(new TextDecoder().decode(object).includes(customer.cpf),false);
 const stored=JSON.stringify(sqlite.prepare('SELECT * FROM reservation_private_documents').all());assert.equal(stored.includes(customer.cpf),false);assert.equal(stored.includes(customer.name),false);
 const again=await storage.savePrivateReservationDocument({reservation:booking,customer:{...customer,name:'Another Name'},fontBytes});assert.equal(again.id,doc.id);assert.equal(objects.size,1);
});
test('private document routes enforce authenticated reservation ownership before accessing encrypted objects',async()=>{
 fixture();const booking=reservation();await storage.saveReservationCustomer(booking.id,customer);const doc=await storage.savePrivateReservationDocument({reservation:booking,fontBytes});
 const own=await cookie(ownerId),other=await cookie(otherId,'cd'.repeat(32));
 assert.equal((await route.GET(req('documents/'+doc.id))).status,401);
 const listed=await route.GET(req('documents?reservation_id='+booking.id,own));assert.equal(listed.status,200);assert.equal((await listed.json()).documents[0].id,doc.id);
 assert.equal((await route.GET(req('documents?reservation_id='+booking.id,other))).status,404);
 const original=environment.BUCKET.get;let reads=0;environment.BUCKET.get=async(...args)=>{reads++;return original(...args);};
 delete environment.CUSTOMER_DATA_KEY;
 assert.equal((await route.GET(req('documents/'+doc.id,other))).status,404);assert.equal(reads,0);
 assert.equal((await route.GET(req('documents/'+doc.id,own))).status,503);
 environment.CUSTOMER_DATA_KEY='24'.repeat(32);
 assert.equal((await route.GET(req('documents/'+doc.id,own))).status,200);
});
test('pickup documents require actual release and create a separate immutable event from the initial reservation',async()=>{
 fixture();const booking=reservation();await storage.saveReservationCustomer(booking.id,customer);
 await assert.rejects(()=>storage.savePrivateReservationDocument({reservation:booking,kind:'pickup_confirmation',fontBytes}),status(409));
 const initial=await storage.savePrivateReservationDocument({reservation:booking,fontBytes});
 sqlite.prepare("UPDATE reservations SET status='ready',ready_ms=?,pickup_ms=? WHERE id=?").run(Date.now(),Date.parse('2030-10-15T10:00:00-03:00'),booking.id);
 const ready=await storage.savePrivateReservationDocument({reservation:booking,kind:'pickup_confirmation',fontBytes});assert.notEqual(ready.id,initial.id);
 assert.equal((await storage.listPrivateDocumentsForCustomer(booking.id,ownerId)).documents.length,2);
 const text=pdfText(new Uint8Array(await (await storage.documentResponseForOwner(ready.id)).arrayBuffer()));assert.match(text,/CONFIRMAÇÃO DE RETIRADA/);assert.match(text,/15\/10\/2030, 10:00/);
 assert.throws(()=>sqlite.prepare("UPDATE reservation_private_documents SET document_version='changed'").run(),/IMMUTABLE/);
});
test('missing private bucket does not lose the encrypted customer snapshot or expose a document publicly',async()=>{
 fixture({bucket:false});const booking=reservation();await storage.saveReservationCustomer(booking.id,customer);
 await assert.rejects(()=>storage.savePrivateReservationDocument({reservation:booking,fontBytes}),status(503));assert.ok(await storage.readReservationCustomer(booking.id));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservation_private_documents').get().n,0);
});
