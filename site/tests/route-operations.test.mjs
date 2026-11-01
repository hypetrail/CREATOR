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
const fleet=await compile('lib/fleet-server.ts'),route=await compile('app/api/fleet/[...path]/route.ts'),accounts=await compile('lib/customer-auth.ts');
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
async function quoteAndRequest(color='azul'){
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

test('public reservation binds only the authenticated customer and cannot claim an earlier guest request',async()=>{
 await fixture();
 const registered=await accounts.registerCustomer(new Request('https://calori.test/api/customer/register',{method:'POST'}),{phone:'19999999999',password:'Uma senha de teste forte!'}),cookie=registered.setCookie.split(';')[0];
 const guestInput=await quoteAndRequest('branca');const guest=await (await route.POST(req('reservations',guestInput))).json();assert.equal(guest.account_linked,false);
 assert.equal((await route.POST(req('reservations',guestInput,false,cookie))).status,409);
 const input=await quoteAndRequest('azul');assert.equal((await route.POST(req('reservations',{...input,customer_id:registered.customer.id},false,cookie))).status,400);
 const response=await route.POST(req('reservations',input,false,cookie));assert.equal(response.status,200);const b=await response.json();assert.equal(b.account_linked,true);assert.equal('customer_id'in b,false);
 assert.equal(sqlite.prepare('SELECT customer_id FROM reservations WHERE id=?').get(b.id).customer_id,registered.customer.id);
});

test('inspection-gated pickup starts the real clock, queues WhatsApp texts and preserves safety holds on return',async()=>{
 await fixture();environment.CUSTOMER_DATA_KEY='b2'.repeat(32);
 const registered=await accounts.registerCustomer(new Request('https://calori.test/api/customer/register',{method:'POST'}),{phone:'19999999999',password:'Outra senha de teste forte!',operational_whatsapp:true});
 sqlite.prepare('UPDATE customers SET phone_verified=1 WHERE id=?').run(registered.customer.id);
 const cookie=registered.setCookie.split(';')[0],b=await (await route.POST(req('reservations',await quoteAndRequest(),false,cookie))).json();
 assert.equal((await route.POST(req('contact',{reservation_id:b.id,delivery_token:b.delivery_token,customer:personal,whatsapp_consent:true},false,cookie))).status,200);
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
test('the originating reservation stores encrypted identification and private PDF even before Gmail is connected',async()=>{
 await fixture();environment.CUSTOMER_DATA_KEY='a'.repeat(64);
 const b=await fleet.reserve(await quoteAndRequest());
 const sent=await route.POST(req('documents/send',{reservation_id:b.id,delivery_token:b.delivery_token,customer:personal}));
 assert.equal(sent.status,200);const value=await sent.json();assert.equal(value.status,'not_configured');assert.equal(value.customer_stored,true);assert.equal(value.document_saved,true);
 const row=sqlite.prepare('SELECT envelope FROM reservation_customer_data WHERE reservation_id=?').get(b.id);assert.ok(row);
 for(const text of [personal.name,personal.cpf,personal.email,personal.street])assert.equal(row.envelope.includes(text),false);
 const ownerData=await route.GET(req('admin/customer-data?reservation_id='+b.id,undefined,true));assert.equal((await ownerData.json()).customer.name,personal.name);
 assert.equal((await route.GET(req('admin/customer-data?reservation_id='+b.id))).status,401);
 const documents=await (await route.GET(req('admin/private-documents?reservation_id='+b.id,undefined,true))).json();assert.equal(documents.documents.length,1);assert.match(documents.documents[0].url,/^\/api\/fleet\/admin\/private-documents\//);
 const document=await route.GET(req('admin/private-documents/'+documents.documents[0].id,undefined,true));assert.equal(document.status,200);assert.match(document.headers.get('Cache-Control'),/no-store/);assert.equal(Buffer.from(await document.arrayBuffer()).subarray(0,5).toString(),'%PDF-');
 assert.equal((await route.GET(req('admin/private-documents/'+documents.documents[0].id))).status,401);
 assert.equal((await route.GET(req('photos/'+documents.documents[0].id))).status,404);
 const retry=await route.POST(req('documents/send',{reservation_id:b.id,delivery_token:b.delivery_token,customer:{...personal,name:'Outra Identificação Fictícia'}}));assert.equal((await retry.json()).document_saved,true);
 assert.equal((await (await route.GET(req('admin/customer-data?reservation_id='+b.id,undefined,true))).json()).customer.name,personal.name);
 assert.equal(sqlite.prepare('SELECT count(*) n FROM reservation_private_documents').get().n,1);
});
test('counter registration and inspection reports require the owner and preserve full photo evidence privately',async()=>{
 await fixture();environment.CUSTOMER_DATA_KEY='b'.repeat(64);
 const b=await fleet.reserve(await quoteAndRequest());
 assert.equal((await route.POST(req('admin/customer-data',{reservation_id:b.id,customer:personal}))).status,401);
 const registered=await route.POST(req('admin/customer-data',{reservation_id:b.id,customer:personal,generate_pdf:true},true));assert.equal(registered.status,200);assert.equal((await registered.json()).document_saved,true);
 await fleet.updateReservation({id:b.id,status:'preparing',payment_status:'pending'});
 const uploaded=await photo(b.id);
 const saved=await (await route.POST(req('admin/inspections',{reservation_id:b.id,kind:'departure',checks,notes:'Equipamentos conferidos em teste',photo_ids:[uploaded.id]},true))).json();
 assert.equal((await route.GET(req('admin/inspection-report/'+saved.inspection.id))).status,401);
 const report=await route.GET(req('admin/inspection-report/'+saved.inspection.id,undefined,true));assert.equal(report.status,200);assert.equal(report.headers.get('Content-Type'),'application/pdf');
 const pdf=await import('pdf-lib').then(({PDFDocument})=>report.arrayBuffer().then(bytes=>PDFDocument.load(bytes)));assert.equal(pdf.getPageCount(),2);
 assert.ok(pdf.getPages()[1].node.Resources().lookupMaybe((await import('pdf-lib')).PDFName.of('XObject'),(await import('pdf-lib')).PDFDict));
 const archived=await route.POST(req('admin/inspection-archive',{inspection_id:saved.inspection.id},true));assert.equal(archived.status,200);assert.equal((await archived.json()).status,'not_configured');
 const invalidSettings=await route.POST(req('admin/notifications/settings',{auto_availability:'true'},true));assert.equal(invalidSettings.status,400);
 const settings=await route.POST(req('admin/notifications/settings',{auto_availability:false},true));assert.equal(settings.status,200);
 assert.equal((await (await route.GET(req('admin/notifications',undefined,true))).json()).auto_availability,false);
});
test('counter can save full identification without email or automatic PDF and prepare the approved WhatsApp flow',async()=>{
 await fixture();environment.CUSTOMER_DATA_KEY='c3'.repeat(32);const b=await fleet.reserve(await quoteAndRequest());
 const response=await route.POST(req('admin/customer-data',{reservation_id:b.id,customer:{...personal,email:''},whatsapp_consent:true},true));assert.equal(response.status,200);const result=await response.json();assert.equal(result.customer_stored,true);assert.equal(result.document_saved,false);assert.equal(result.customer.email,'');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservation_private_documents').get().n,0);assert.ok(sqlite.prepare("SELECT event_key FROM reservation_document_deliveries WHERE reservation_id=? AND kind='whatsapp_reservation'").get(b.id));
});
