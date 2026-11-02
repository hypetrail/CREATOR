import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
const require=createRequire(import.meta.url),environment={FLEET_OWNER_ID:'owner'};
globalThis.__OperationsRouteEnv=environment;
const shim={name:'operations-route-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));b.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env=globalThis.__OperationsRouteEnv;'}));}};
async function compile(path){const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false,plugins:[shim]});const compiled={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);return compiled.exports;}
const fleet=await compile('lib/fleet-server.ts'),route=await compile('app/api/fleet/[...path]/route.ts'),customerRoute=await compile('app/api/customer/[...path]/route.ts'),storage=await compile('lib/private-customer-store.ts');
let sqlite;
function adapter(connection){return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return connection.prepare(sql).get(...args)||null;},async all(){return {results:connection.prepare(sql).all(...args)};},async run(){const result=connection.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){connection.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());connection.exec('COMMIT');return values;}catch(error){connection.exec('ROLLBACK');throw error;}}};}
async function fixture(){
 sqlite?.close();sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 for(const key of Object.keys(environment))delete environment[key];environment.FLEET_OWNER_ID='owner';environment.DB=adapter(sqlite);
 const bucket=new Map();environment.BUCKET={async put(key,bytes,metadata){bucket.set(key,{bytes:new Uint8Array(bytes),metadata});},async delete(key){bucket.delete(key);},async get(key){const object=bucket.get(key);return object?{body:object.bytes,size:object.bytes.length,async text(){return new TextDecoder().decode(object.bytes);},async arrayBuffer(){return object.bytes.slice().buffer;},writeHttpMetadata(headers){headers.set('Content-Type',object.metadata?.httpMetadata?.contentType||'application/octet-stream');}}:null;}};
 environment.ASSETS={async fetch(){return new Response(readFileSync('public/fonts/DejaVuSans.ttf'));}};
 await fleet.initialize('owner');await fleet.saveSettings({address:'Endereço de teste',whatsapp:'19999999999',coverage:'Condições de teste',protection_daily_cents:1500,protection_enabled:false,rentals_enabled:true});
}
const req=(path,body,owner=false,cookie='')=>new Request('https://calori.test/api/fleet/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(owner?{'oai-authenticated-user-id':'owner'}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
async function quoteAndRequest(color='padrao-loja'){
 const commercial={model_id:'t1',color,start:'2030-10-15T09:00:00-03:00',end:'2030-10-17T09:00:00-03:00',insurance:'none'};
 const q=await fleet.quote(commercial);return {...commercial,insurance:q.insurance,request_key:crypto.randomUUID(),expected_daily_cents:q.daily_cents,expected_total_cents:q.total_cents,terms_version:'rental-v1',terms_accepted:true,expected_terms_token:q.terms_token};
}
async function photo(reservationId){
 const form=new FormData();form.set('reservation_id',reservationId);form.set('photo',new File([readFileSync('public/fleet/t1/manual.png')],'foto.png',{type:'image/png'}));
 const response=await route.POST(new Request('https://calori.test/api/fleet/admin/inspection-photos',{method:'POST',headers:{'oai-authenticated-user-id':'owner'},body:form}));
 assert.equal(response.status,200);return response.json();
}
const checks={brakes:true,tires:true,lights:true,battery:true,charger:true,key:true,condition:true};

test('inspection, operations, audit and communication routes are owner-only; private photos never use catalogue paths',async()=>{
 await fixture();
 for(const path of ['admin/inspections?reservation_id='+crypto.randomUUID(),'admin/inspection-photos/'+crypto.randomUUID(),'admin/operation-records','admin/audit','admin/notifications'])assert.equal((await route.GET(req(path))).status,401,path);
 const b=await fleet.reserve(await quoteAndRequest());const uploaded=await photo(b.id);
 assert.equal((await route.GET(req('photos/'+uploaded.id))).status,404);
 const privatePhoto=await route.GET(req('admin/inspection-photos/'+uploaded.id,undefined,true));assert.equal(privatePhoto.status,200);assert.match(privatePhoto.headers.get('Cache-Control'),/no-store/);assert.equal(privatePhoto.headers.get('Content-Type'),'image/png');
 const record=await route.POST(req('admin/operation-record',{unit_id:'t1-001',kind:'tracker',title:'Rastreador registrado',notes:'Identificador técnico de teste'},true));assert.equal(record.status,200);
 const logs=await (await route.GET(req('admin/audit',undefined,true))).json();assert.equal(logs.events[0].actor,'owner');assert.equal(logs.events[0].action,'operation_record_created');
 const care=await route.GET(req('care-guide'));assert.equal(care.status,200);assert.equal(care.headers.get('Content-Type'),'application/pdf');assert.equal(Buffer.from(await care.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
});

test('public reservations store only authorized contact, share stock with the catalogue and never create or bind an account',async()=>{
 await fixture();
 const input={...await quoteAndRequest(),contact:{phone:'(19) 98888-8888',name:'Cliente de teste'},whatsapp_consent:true};
 for(const invalid of [{...input,contact:undefined},{...input,whatsapp_consent:false},{...input,customer_id:crypto.randomUUID()},{...input,contact:{...input.contact,cpf:'52998224725'}}])assert.equal((await route.POST(req('reservations',invalid))).status,400);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservations').get().n,0);
 const before=await fleet.availability(input.start,input.end);assert.equal(before.models.find(m=>m.id==='t1').available,5);
 const response=await route.POST(req('reservations',input,false,'calori_customer=obsolete-session'));assert.equal(response.status,200);const b=await response.json();assert.equal(b.account_linked,false);assert.equal('customer_id'in b,false);assert.equal(b.delivery.status,'not_configured');assert.equal(b.contact_saved,true);assert.match(b.code,/^CG-/);assert.equal(b.payment_status,'pending');assert.equal(b.payment_method,'pickup');assert.equal(b.total_cents,9000);
 const stored=sqlite.prepare('SELECT customer_id,name,phone,email,city FROM reservations WHERE id=?').get(b.id);assert.deepEqual({...stored},{customer_id:'',name:'',phone:'',email:'',city:''});
 const contact=sqlite.prepare('SELECT name,phone,consent_ms,revoked_ms FROM reservation_contacts WHERE reservation_id=?').get(b.id);assert.equal(contact.name,input.contact.name);assert.equal(contact.phone,'5519988888888');assert.ok(contact.consent_ms>0);assert.equal(contact.revoked_ms,null);
 const replay=await route.POST(req('reservations',input));assert.equal(replay.status,200);assert.equal((await replay.json()).id,b.id);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservations').get().n,1);
 assert.equal((await route.POST(req('reservations',{...input,contact:{phone:'19777777777'}}))).status,409);
 const available=await route.GET(req('availability?'+new URLSearchParams({start:input.start,end:input.end})));assert.equal(available.status,200);const catalogue=await available.json();assert.equal(catalogue.models.find(m=>m.id==='t1').available,4);assert.equal(JSON.stringify(catalogue).includes(contact.phone),false);assert.equal(JSON.stringify(catalogue).includes(contact.name),false);
 for(const path of ['register','login','session','reservations']){
  const request=new Request('https://calori.test/api/customer/'+path,{method:path==='register'||path==='login'?'POST':'GET',headers:{Cookie:'calori_customer=obsolete-session','Content-Type':'application/json'},...(path==='register'||path==='login'?{body:JSON.stringify({phone:input.contact.phone,password:'Unused password'})}:{})});
  const retired=await customerRoute[request.method](request);assert.equal(retired.status,410);assert.match(retired.headers.get('Set-Cookie'),/Max-Age=0/);
 }
 for(const table of ['customers','customer_sessions','reservation_customer_data','customer_profiles','reservation_private_documents'])assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n,0,table);
});

test('inspection-gated pickup starts the real clock, queues WhatsApp texts and preserves safety holds on return',async()=>{
 await fixture();
 const contact={phone:'19999999999'},response=await route.POST(req('reservations',{...await quoteAndRequest(),contact,whatsapp_consent:true}));assert.equal(response.status,200);const b=await response.json();
 assert.equal((await route.POST(req('contact',{reservation_id:b.id,delivery_token:'invalid',contact,whatsapp_consent:true}))).status,403);
 assert.equal((await route.POST(req('contact',{reservation_id:b.id,delivery_token:b.delivery_token,contact,whatsapp_consent:true}))).status,200);
 assert.equal((await route.POST(req('admin/reservation',{id:b.id,status:'preparing',payment_status:'pending'},true))).status,200);
 const uploaded=await photo(b.id);
 const saved=await (await route.POST(req('admin/inspections',{reservation_id:b.id,kind:'departure',checks,notes:'Moto e equipamentos conferidos',photo_ids:[uploaded.id]},true))).json();
 assert.ok(saved.inspection.id);
 const released=await route.POST(req('admin/reservation',{id:b.id,status:'ready',payment_status:'pending',pickup_time:new Date(b.start_ms).toISOString(),vehicle_checked:true,documents_checked:true,battery_checked:true},true));assert.equal(released.status,200);assert.equal((await released.json()).delivery.status,'not_configured');
 assert.equal((await route.POST(req('admin/reservation',{id:b.id,status:'rented',payment_status:'paid'},true))).status,400);
 const pickup=await (await route.POST(req('admin/reservation',{id:b.id,status:'rented',payment_status:'paid',inspection_id:saved.inspection.id},true))).json();
 assert.equal(pickup.reservation.status,'rented');assert.equal(pickup.reservation.due_ms-pickup.reservation.actual_start_ms,2*86400000);
 const queued=sqlite.prepare('SELECT kind,scheduled_ms FROM customer_notifications ORDER BY kind').all();assert.deepEqual(queued.map(r=>r.kind),[]);
 assert.ok(sqlite.prepare("SELECT event_key FROM reservation_document_deliveries WHERE reservation_id=? AND kind='whatsapp_ready'").get(b.id));
 const backPhoto=await photo(b.id),back=await (await route.POST(req('admin/inspections',{reservation_id:b.id,kind:'return',checks,notes:'Falha no freio exige reparo',photo_ids:[backPhoto.id],maintenance_required:true},true))).json();
 const returned=await route.POST(req('admin/reservation',{id:b.id,status:'returned',payment_status:'paid',inspection_id:back.inspection.id},true));assert.equal(returned.status,200);
 const data=await (await route.GET(req('admin',undefined,true))).json();assert.equal(data.safety_holds.length,1);assert.equal(data.safety_holds[0].unit_id,'t1-001');
 const audit=sqlite.prepare("SELECT payload FROM admin_audit_events WHERE action='reservation' ORDER BY created_ms DESC").all();assert.ok(audit.some(r=>JSON.parse(r.payload).inspection_id===back.inspection.id));
 const resolved=await route.POST(req('admin/safety-holds/resolve',{id:data.safety_holds[0].id,resolution:'Freio reparado e testado pelo administrador'},true));assert.equal(resolved.status,200);
 assert.equal((await (await route.GET(req('admin',undefined,true))).json()).safety_holds.length,0);
});

const personal={name:'Cliente Fictício Documento',cpf:'52998224725',phone:'19999999999',email:'cliente@example.com',birth:'2000-01-01',cep:'13720146',street:'Rua de Teste',number:'1',district:'Centro',city:'Cidade Teste',state:'SP'};
test('retired identification writes cannot alter encrypted historical data or private PDF retained for the owner',async()=>{
 await fixture();environment.CUSTOMER_DATA_KEY='a'.repeat(64);
 const b=await fleet.reserve(await quoteAndRequest());
 // Seed records through the archived storage helper; no HTTP route accepts a new full identity.
 await storage.saveReservationCustomer(b.id,personal);await storage.savePrivateReservationDocument({reservation:b,fontBytes:readFileSync('public/fonts/DejaVuSans.ttf')});
 const preserved=()=>JSON.stringify({identity:sqlite.prepare('SELECT * FROM reservation_customer_data').all(),documents:sqlite.prepare('SELECT * FROM reservation_private_documents').all()});const before=preserved();
 for(const path of ['documents/send','admin/documents/send','admin/customer-data','admin/customer-reference']){
  const sent=await route.POST(req(path,{reservation_id:b.id,delivery_token:b.delivery_token,customer:{...personal,name:'Alteração rejeitada'}},path.startsWith('admin/')));assert.equal(sent.status,410,path);
 }
 const row=sqlite.prepare('SELECT envelope FROM reservation_customer_data WHERE reservation_id=?').get(b.id);assert.ok(row);
 for(const text of [personal.name,personal.cpf,personal.email,personal.street])assert.equal(row.envelope.includes(text),false);
 const ownerData=await route.GET(req('admin/customer-data?reservation_id='+b.id,undefined,true));assert.equal((await ownerData.json()).customer.name,personal.name);
 assert.equal((await route.GET(req('admin/customer-data?reservation_id='+b.id))).status,401);
 const documents=await (await route.GET(req('admin/private-documents?reservation_id='+b.id,undefined,true))).json();assert.equal(documents.documents.length,1);assert.match(documents.documents[0].url,/^\/api\/fleet\/admin\/private-documents\//);
 const document=await route.GET(req('admin/private-documents/'+documents.documents[0].id,undefined,true));assert.equal(document.status,200);assert.match(document.headers.get('Cache-Control'),/no-store/);assert.equal(Buffer.from(await document.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 assert.equal((await route.GET(req('admin/private-documents/'+documents.documents[0].id))).status,401);
 assert.equal((await route.GET(req('photos/'+documents.documents[0].id))).status,404);
 assert.equal(preserved(),before);
 assert.equal((await (await route.GET(req('admin/customer-data?reservation_id='+b.id,undefined,true))).json()).customer.name,personal.name);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM reservation_private_documents').get().n,1);
});
test('counter contact and inspection reports require the owner and preserve full photo evidence privately',async()=>{
 await fixture();
 const b=await fleet.reserve(await quoteAndRequest());
 assert.equal((await route.POST(req('admin/contact',{reservation_id:b.id,contact:{phone:personal.phone},whatsapp_consent:true}))).status,401);
 const registered=await route.POST(req('admin/contact',{reservation_id:b.id,contact:{phone:personal.phone,name:personal.name},whatsapp_consent:true},true));assert.equal(registered.status,200);assert.equal((await registered.json()).contact.phone,'5519999999999');
 for(const table of ['customers','reservation_customer_data','reservation_private_documents'])assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n,0,table);
 await fleet.updateReservation({id:b.id,status:'preparing',payment_status:'pending'});
 const uploaded=await photo(b.id);
 const saved=await (await route.POST(req('admin/inspections',{reservation_id:b.id,kind:'departure',checks,notes:'Equipamentos conferidos em teste',photo_ids:[uploaded.id]},true))).json();
 assert.equal((await route.GET(req('admin/inspection-report/'+saved.inspection.id))).status,401);
 const report=await route.GET(req('admin/inspection-report/'+saved.inspection.id,undefined,true));assert.equal(report.status,200);assert.equal(report.headers.get('Content-Type'),'application/pdf');
 const pdf=await import('pdf-lib').then(({PDFDocument})=>report.arrayBuffer().then(bytes=>PDFDocument.load(bytes)));assert.equal(pdf.getPageCount(),2);
 assert.ok(pdf.getPages()[1].node.Resources().lookupMaybe((await import('pdf-lib')).PDFName.of('XObject'),(await import('pdf-lib')).PDFDict));
 const archived=await route.POST(req('admin/inspection-archive',{inspection_id:saved.inspection.id},true));assert.equal(archived.status,200);assert.equal((await archived.json()).status,'not_configured');
 const before=JSON.stringify(sqlite.prepare("SELECT * FROM settings WHERE key='notify_auto_availability'").all());
 for(const path of ['admin/notifications/settings','admin/notifications/availability'])assert.equal((await route.POST(req(path,{auto_availability:false},true))).status,410);
 assert.equal(JSON.stringify(sqlite.prepare("SELECT * FROM settings WHERE key='notify_auto_availability'").all()),before);
 const notifications=await route.GET(req('admin/notifications',undefined,true));assert.equal(notifications.status,200);assert.ok((await notifications.json()).reservation_messages.some(message=>message.reservation_id===b.id));
});
test('manual bookings use the same stock and minimal contact, with owner-only correction and revocation',async()=>{
 await fixture();const input={...await quoteAndRequest(),unit_id:'t1-001',contact:{phone:'19999999999'},whatsapp_consent:true};
 assert.equal((await route.POST(req('admin/manual-reservation',input))).status,401);
 assert.equal((await route.POST(req('admin/manual-reservation',{...input,customer_id:crypto.randomUUID()},true))).status,400);
 const response=await route.POST(req('admin/manual-reservation',input,true));assert.equal(response.status,200);const b=await response.json();assert.equal(b.source,'manual');assert.equal(b.account_linked,false);assert.equal(b.contact_saved,true);
 assert.ok(sqlite.prepare("SELECT event_key FROM reservation_document_deliveries WHERE reservation_id=? AND kind='whatsapp_reservation'").get(b.id));
 assert.equal((await fleet.availability(input.start,input.end)).models.find(m=>m.id==='t1').available,4);
 for(const path of ['admin/contact?reservation_id='+b.id,'admin/contact?reservation_id='+crypto.randomUUID()])assert.equal((await route.GET(req(path))).status,401);
 assert.equal((await route.POST(req('admin/contact',{reservation_id:b.id,contact:{phone:'19888888888',cpf:personal.cpf},whatsapp_consent:true},true))).status,400);
 const corrected=await route.POST(req('admin/contact',{reservation_id:b.id,contact:{phone:'19888888888',name:'Contato corrigido'},whatsapp_consent:true},true));assert.equal(corrected.status,200);assert.equal((await corrected.json()).contact.phone,'5519888888888');
 const visible=await route.GET(req('admin/contact?reservation_id='+b.id,undefined,true));assert.equal(visible.status,200);assert.equal((await visible.json()).contact.name,'Contato corrigido');
 const revoked=await route.POST(req('admin/contact/revoke',{reservation_id:b.id},true));assert.equal(revoked.status,200);assert.ok(sqlite.prepare('SELECT revoked_ms FROM reservation_contacts WHERE reservation_id=?').get(b.id).revoked_ms);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM reservation_document_deliveries WHERE reservation_id=? AND kind='whatsapp_reservation' AND status!='cancelled'").get(b.id).n,0);
 const audit=JSON.stringify(sqlite.prepare('SELECT payload FROM admin_audit_events').all());for(const value of ['19888888888','Contato corrigido',personal.cpf])assert.equal(audit.includes(value),false);
 for(const table of ['customers','customer_sessions','reservation_customer_data','customer_profiles','reservation_private_documents'])assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n,0,table);
});
