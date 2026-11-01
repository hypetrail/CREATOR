import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),environment={FLEET_OWNER_ID:'owner',CUSTOMER_DATA_KEY:'a1'.repeat(32)};
globalThis.__WhatsAppReservationEnv=environment;
const shim={name:'env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));b.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env=globalThis.__WhatsAppReservationEnv;'}));}};
async function compile(path){const r=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false,plugins:[shim]});const m={exports:{}};new Function('module','exports','require',r.outputFiles[0].text)(m,m.exports,require);return m.exports;}
const fleet=await compile('lib/fleet-server.ts'),wa=await compile('lib/reservation-whatsapp-server.ts'),store=await compile('lib/private-customer-store.ts'),ops=await compile('lib/operation-records-server.ts');
let sqlite;
const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort();
function adapter(c){return {prepare(sql){let args=[];return {bind(...a){args=a;return this;},async first(){return c.prepare(sql).get(...args)||null;},async all(){return {results:c.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(c.prepare(sql).run(...args).changes)}};}};},async batch(statements){c.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());c.exec('COMMIT');return r;}catch(e){c.exec('ROLLBACK');throw e;}}};}
const start='2030-10-15T09:00:00-03:00',end='2030-10-17T09:00:00-03:00';
const customer={name:'Cliente Fictício Teste',phone:'5519999999999',cpf:'52998224725',birth:'2000-01-01',cep:'13720146',street:'Rua de Teste',number:'123',district:'Centro',city:'Cidade Teste',state:'SP',email:''};
async function fixture(){sqlite?.close();sqlite=new DatabaseSync(':memory:');for(const f of files)sqlite.exec(readFileSync('drizzle/'+f,'utf8'));environment.DB=adapter(sqlite);for(const k of ['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION','WHATSAPP_TEMPLATE_RENTAL'])delete environment[k];await fleet.initialize('owner');await fleet.saveSettings({address:'Endereço de Teste',whatsapp:'19999999999',coverage:'Condições de teste',protection_enabled:false,protection_daily_cents:1500,rentals_enabled:true});}
async function reserve(){const q=await fleet.quote({model_id:'t1',start,end});return fleet.reserve({model_id:'t1',start,end,insurance:q.insurance,request_key:crypto.randomUUID(),terms_version:'rental-v1',terms_accepted:true,expected_terms_token:q.terms_token,expected_daily_cents:q.daily_cents,expected_total_cents:q.total_cents});}
const contact=(r,changes={})=>wa.registerWhatsAppContact({reservation_id:r.id,delivery_token:r.delivery_token,customer,whatsapp_consent:true,...changes});
const configure=()=>Object.assign(environment,{WHATSAPP_ACCESS_TOKEN:'test-token',WHATSAPP_PHONE_NUMBER_ID:'123456',WHATSAPP_API_VERSION:'v25.0',WHATSAPP_TEMPLATE_RENTAL:'calori_locacao_texto'});
test('single-finish T1 pools five units, accepts no color, and atomically exhausts stock',async()=>{await fixture();const q=await fleet.quote({model_id:'t1',start,end});assert.equal(q.color_name,'');assert.equal(q.total_cents,9000);const results=await Promise.allSettled(Array.from({length:6},()=>reserve()));assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);assert.equal((await fleet.availability(start,end)).models[0].available,0);});
test('full identity without email is encrypted, frozen and queued without PDF, R2 or Gmail',async()=>{
 await fixture();const r=await reserve();const sent=await contact(r);assert.equal(sent.status,'not_configured');assert.equal(sent.contact_saved,true);assert.equal(sent.customer_stored,true);
 const frozen=await store.readReservationCustomer(r.id);assert.equal(frozen.name,customer.name);assert.equal(frozen.email,'');assert.equal(frozen.street,customer.street);
 const stored=sqlite.prepare('SELECT envelope FROM reservation_customer_data').get().envelope;for(const value of [customer.name,customer.cpf,customer.phone,customer.street])assert.equal(stored.includes(value),false);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservation_private_documents').get().n,0);
 const text=sent.parts.map(p=>p.text).join(' ');for(const value of [customer.name,customer.street,'9000']){if(value!=='9000')assert.ok(text.includes(value));}assert.match(text,/90,00/);assert.match(text,/Motor: 1000 W/);assert.match(text,/dividida por 24/);assert.doesNotMatch(text,/Cor:|Padrão da loja|metade da diária/);
 const count=sqlite.prepare('SELECT COUNT(*) n FROM reservation_document_deliveries').get().n;await contact(r);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservation_document_deliveries').get().n,count);
 await assert.rejects(contact(r,{delivery_token:'invalid'}),e=>e.status===403);await assert.rejects(contact(r,{whatsapp_consent:false}),e=>e.status===400);await assert.rejects(contact(r,{customer:{...customer,phone:'5511988888888'}}),e=>e.status===409);
});
test('full identification remains mandatory and rejected fields never create WhatsApp jobs',async()=>{await fixture();const r=await reserve();for(const invalid of [{name:'Nome'},{street:''},{cpf:'123'},{email:'invalid'},{birth:'2015-01-01'}])await assert.rejects(contact(r,{customer:{...customer,...invalid}}));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservation_document_deliveries').get().n,0);});
test('official WhatsApp text templates target only saved contact; successful parts never resend',async()=>{
 await fixture();const r=await reserve();await contact(r);configure();const bodies=[];const fake=async(url,init)=>{assert.match(url,/^https:\/\/graph.facebook.com\//);assert.equal(init.redirect,'manual');const body=JSON.parse(init.body);assert.equal(body.to,customer.phone);assert.equal(body.type,'template');for(const p of body.template.components[0].parameters)assert.ok(p.text.length<=1024);bodies.push(body);return Response.json({messages:[{id:'wamid.test.'+bodies.length}]});};
 const first=await wa.processReservationWhatsApp(50,fake);assert.ok(first.submitted>1);const second=await wa.processReservationWhatsApp(50,fake);assert.equal(second.submitted,0);assert.equal(bodies.length,first.submitted);
});
test('unknown delivery is not automatically resent and cancellation blocks queued messages',async()=>{
 await fixture();const r=await reserve();await contact(r);configure();let calls=0;await wa.processReservationWhatsApp(1,async()=>{calls++;throw new Error('network timeout');});assert.equal(calls,1);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM reservation_document_deliveries WHERE status='unknown'").get().n,1);
 sqlite.prepare("UPDATE reservations SET status='cancelled' WHERE id=?").run(r.id);await wa.processReservationWhatsApp(50,async()=>{throw new Error('must not send');});assert.equal(calls,1);assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM reservation_document_deliveries WHERE status='submitted'").get().n,0);
});
test('local inspection records photo references without storing images and preserves safety holds',async()=>{
 await fixture();const r=await reserve();await fleet.updateReservation({id:r.id,status:'preparing',payment_status:'pending'});const checks=Object.fromEntries(['brakes','tires','lights','battery','charger','key','condition'].map(k=>[k,true]));
 const input={reservation_id:r.id,kind:'departure',checks,photo_storage:'local',local_photo_names:['frente.jpg','lateral.jpg'],photo_ids:[],notes:'Conferência de teste'};
 const result=await ops.saveInspection(input,'owner');assert.equal(result.inspection.payload.photo_storage,'local');assert.deepEqual(result.inspection.payload.photo_ids,[]);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM inspection_photos').get().n,0);
 await assert.rejects(ops.saveInspection({...input,local_photo_names:['../arquivo.jpg']},'owner'),e=>e.status===400);await assert.rejects(ops.saveInspection({...input,local_photo_names:[]},'owner'),e=>e.status===400);
});
test('single-finish migration preserves existing reservation snapshots, prices and unit identities',async()=>{
 await fixture();const m=(await fleet.adminData()).models[0];await fleet.saveModel({...m,colors:[{id:'azul',name:'Azul',hex:'#123456',photos:[]},{id:'padrao-loja',name:'Padrão da loja',hex:'#f58220',photos:[]}],spec:{...m.spec,color_selection:true}});const u=(await fleet.adminData()).units[0];await fleet.saveUnit({...u,color:'azul'});const q=await fleet.quote({model_id:'t1',color:'azul',start,end});const r=await fleet.reserve({model_id:'t1',color:'azul',start,end,insurance:q.insurance,request_key:crypto.randomUUID(),terms_version:'rental-v1',terms_accepted:true,expected_terms_token:q.terms_token,expected_daily_cents:q.daily_cents,expected_total_cents:q.total_cents});
 sqlite.exec(readFileSync('drizzle/0009_t1_single_finish.sql','utf8'));const saved=sqlite.prepare('SELECT * FROM reservations WHERE id=?').get(r.id);assert.equal(saved.terms_snapshot,r.terms_snapshot);assert.equal(saved.total_cents,9000);assert.equal(saved.color_name,'Azul');assert.equal(saved.unit_id,u.id);assert.equal((await fleet.adminData()).models[0].spec.color_selection,false);assert.equal((await fleet.availability(start,end)).models[0].available,4);
});
test('readiness never sends for an unsafe unit and revoked WhatsApp consent cancels pending parts',async()=>{
 await fixture();const r=await reserve();await contact(r);await fleet.updateReservation({id:r.id,status:'preparing',payment_status:'pending'});await fleet.updateReservation({id:r.id,status:'ready',payment_status:'pending',pickup_time:start,vehicle_checked:true,documents_checked:true,battery_checked:true});await wa.queueReadyWhatsApp(r.id);configure();
 const unit=sqlite.prepare('SELECT unit_id FROM reservations WHERE id=?').get(r.id).unit_id;
 sqlite.prepare('INSERT INTO unit_safety_holds (id,unit_id,reason,created_ms,created_by) VALUES (?,?,?,?,?)').run(crypto.randomUUID(),unit,'Falha de teste',Date.now(),'owner');
 const calls=[];await wa.processReservationWhatsApp(50,async(url,init)=>{calls.push(JSON.parse(init.body));return Response.json({messages:[{id:'wamid.safe.'+calls.length}]});});
 assert.equal(calls.some(body=>body.template.components[0].parameters[1].text.includes('Pronta para retirada')),false);
 assert.ok(sqlite.prepare("SELECT event_key FROM reservation_document_deliveries WHERE kind='whatsapp_ready' AND status='cancelled'").get());
 await fixture();const second=await reserve();await contact(second);configure();sqlite.prepare("UPDATE reservation_document_deliveries SET status='revoked' WHERE kind='whatsapp_consent'").run();let sent=0;await wa.processReservationWhatsApp(50,async()=>{sent++;throw new Error('must not send');});assert.equal(sent,0);
});
test('guest return reminder uses effective pickup deadline and does not require a customer account',async(t)=>{
 await fixture();const r=await reserve();await contact(r);await fleet.updateReservation({id:r.id,status:'preparing',payment_status:'pending'});await fleet.updateReservation({id:r.id,status:'ready',payment_status:'pending',pickup_time:start,vehicle_checked:true,documents_checked:true,battery_checked:true});
 const checks=Object.fromEntries(['brakes','tires','lights','battery','charger','key','condition'].map(k=>[k,true]));const inspection=await ops.saveInspection({reservation_id:r.id,kind:'departure',checks,photo_storage:'local',local_photo_names:['saida.jpg'],photo_ids:[]},'owner');
 const started=await fleet.updateReservation({id:r.id,status:'rented',payment_status:'paid',inspection_id:inspection.inspection.id});assert.equal(started.reservation.account_linked,false);
 const original=Date.now;t.after(()=>{Date.now=original;});Date.now=()=>started.reservation.due_ms-90*60_000;configure();let body;await wa.processReservationWhatsApp(50,async(url,init)=>{body=JSON.parse(init.body);return Response.json({messages:[{id:'wamid.return.test'}]});});
 assert.match(body.template.components[0].parameters[1].text,/Lembrete de devolução/);assert.ok(sqlite.prepare("SELECT event_key FROM reservation_document_deliveries WHERE kind='whatsapp_return_reminder' AND status='submitted'").get());
});
