import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),environment={FLEET_OWNER_ID:'owner'};
globalThis.__FleetTestEnv=environment;
const shim={name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));b.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env=globalThis.__FleetTestEnv;'}));}};
async function compile(path){const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false,plugins:[shim]});const m={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(m,m.exports,require);return m.exports;}
const fleet=await compile('lib/fleet-server.ts'),legacy=await compile('lib/rental-server.ts'),route=await compile('app/api/fleet/[...path]/route.ts'),legacyRoute=await compile('app/api/rental/[...path]/route.ts');
const migrations=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('drizzle/'+f,'utf8')).join('\n');
let sqlite,interleave,defaultTermsToken,beforeAllocation;
function adapter(connection){return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){if(beforeAllocation&&/^INSERT INTO reservations/.test(sql)){const action=beforeAllocation;beforeAllocation=null;await action();}const row=connection.prepare(sql).get(...args)||null;if(interleave&&/^SELECT COUNT\(\*\) n FROM reservations/.test(sql)){const action=interleave;interleave=null;await action();}return row;},async all(){return {results:connection.prepare(sql).all(...args)};},async run(){const r=connection.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){connection.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());connection.exec('COMMIT');return results;}catch(error){connection.exec('ROLLBACK');throw error;}}};}
async function fixture({enabled=true}={}){
 sqlite?.close();sqlite=new DatabaseSync(':memory:');sqlite.exec(migrations);environment.DB=adapter(sqlite);interleave=null;beforeAllocation=null;
 await fleet.initialize('owner');
 // Keep the generic multi-color regression fixture separate from the current
 // single-finish T1 seed. These cases also exercise other future fleet models.
 if(enabled){const palette=['azul','branca','verde','vermelha','verde-camela'].map(id=>({id,name:id==='azul'?'Azul':id,hex:'#123456',photos:[]}));sqlite.prepare("UPDATE rental_models SET colors=?,spec=json_set(spec,'$.color_selection',json('true')) WHERE id='t1'").run(JSON.stringify(palette));palette.forEach((c,i)=>sqlite.prepare('UPDATE units SET color=? WHERE ordinal=?').run(c.id,i+1));}
 if(enabled){const m=(await fleet.adminData()).models.find(m=>m.id==='t1');await fleet.saveModel({...m,daily_cents:5000,spec:{...m.spec,pricing:undefined}});await fleet.saveSettings({address:'Endereço do teste',whatsapp:'19999999999',coverage:'Cobertura do teste',protection_enabled:true,protection_daily_cents:1500,rentals_enabled:true});}
 defaultTermsToken=(await fleet.quote({model_id:'t1',color:'azul',start,end,insurance:'none'})).terms_token;
}
const start='2030-10-15T09:00:00-03:00',end='2030-10-17T09:00:00-03:00';
const request=(extra={})=>({model_id:'t1',color:'azul',start,end,insurance:'none',request_key:crypto.randomUUID(),expected_daily_cents:5000,expected_total_cents:10000,terms_version:'rental-v1',terms_accepted:true,expected_terms_token:defaultTermsToken,...extra});
const status=n=>e=>e.status===n;
function inspection(reservationId,kind,completed=true){
 const id=crypto.randomUUID();
 sqlite.prepare('INSERT INTO rental_inspections (id,reservation_id,kind,payload,created_ms,created_by) VALUES (?,?,?,?,?,?)').run(id,reservationId,kind,JSON.stringify({completed,photo_ids:[crypto.randomUUID()],checks:{vehicle:true,battery:true,accessories:true}}),Date.now(),'owner');
 return id;
}
async function ready(booking){await fleet.updateReservation({id:booking.id,status:'preparing',payment_status:'pending'});return fleet.updateReservation({id:booking.id,status:'ready',payment_status:'pending',vehicle_checked:true,documents_checked:true,battery_checked:true,pickup_time:new Date(booking.start_ms).toISOString()});}


test('owner-only initialization seeds the confirmed model and five units without enabling bookings',async()=>{
 await fixture({enabled:false});
 assert.equal((await fleet.catalog()).models.length,1);
 const {models,units}=await fleet.adminData();assert.equal(models[0].daily_cents,3000);assert.equal(models[0].quantity,5);assert.equal(units.length,5);
 assert.deepEqual(new Set(units.map(u=>u.color)),new Set(['padrao-loja']));
 assert.equal((await fleet.availability(start,end)).models[0].available,5);assert.equal((await fleet.catalog()).settings.rentals_enabled,false);
 await fleet.initialize('owner');assert.equal((await fleet.adminData()).units.length,5);
 sqlite.exec('DELETE FROM settings');await fleet.initialize('visitor');assert.equal(sqlite.prepare("SELECT value FROM settings WHERE key='owner_id'").get(),undefined);
});
test('date and color availability tracks units, blocks, maintenance and three-hour preparation intervals',async()=>{
 await fixture();
 assert.equal((await fleet.availability(start,end)).models[0].available,5);
 await fleet.saveUnit({...(await fleet.adminData()).units.find(u=>u.color==='verde'),status:'maintenance'});
 const white=(await fleet.adminData()).units.find(u=>u.color==='branca');await fleet.addBlock({unit_id:white.id,start,end,kind:'blocked'});
 const b=await fleet.reserve(request());assert.equal(b.color,'azul');assert.equal(b.payment_status,'pending');assert.equal(b.payment_method,'pickup');
 const available=(await fleet.availability(start,end)).models[0];assert.equal(available.available,2);assert.equal(available.colors.find(c=>c.id==='azul').available,0);
 await assert.rejects(()=>fleet.reserve(request()),status(409));
 assert.equal((await fleet.availability(end,'2030-10-19T09:00:00-03:00')).models[0].colors.find(c=>c.id==='azul').available,0);
 assert.equal((await fleet.availability('2030-10-17T12:00:00-03:00','2030-10-19T12:00:00-03:00')).models[0].colors.find(c=>c.id==='azul').available,1);
});
test('confirmed T1 pricing includes insurance: 24h R$60, 48h R$90, 72h R$135',async()=>{
 await fixture({enabled:false});
 await fleet.saveSettings({address:'Endereço teste',whatsapp:'19999999999',coverage:'Condições informadas para teste',protection_daily_cents:1500,protection_enabled:false,rentals_enabled:true});
 for(const [duration,total,rental] of [[1,6000,4500],[2,9000,3000],[3,13500,3000]]){
  const endAt=new Date(Date.parse(start)+duration*86400000).toISOString();
  const q=await fleet.quote({model_id:'t1',color:'azul',start,end:endAt,insurance:'none'});
  assert.equal(q.total_cents,total);assert.equal(q.daily_cents,rental);assert.equal(q.base_daily_cents,3000);assert.equal(q.insurance,'basic');assert.equal(q.protection_daily_cents,1500);assert.equal(q.insurance_included,true);
 }
 const oneDay=new Date(Date.parse(start)+86400000).toISOString();
 const accepted=await fleet.quote({model_id:'t1',color:'azul',start,end:oneDay,insurance:'none'});
 const reserved=await fleet.reserve(request({end:oneDay,expected_daily_cents:4500,expected_total_cents:6000,expected_terms_token:accepted.terms_token}));assert.equal(reserved.total_cents,6000);assert.equal(reserved.insurance,'basic');
 const original=(await fleet.adminData()).models[0];await fleet.saveModel({...original,daily_cents:4000});
 assert.equal(sqlite.prepare('SELECT daily_cents,total_cents FROM reservations WHERE id=?').get(reserved.id).total_cents,6000);
 assert.equal((await fleet.quote({model_id:'t1',color:'branca',start,end,insurance:'none'})).total_cents,11000);
 await assert.rejects(()=>fleet.quote({model_id:'t1',color:'branca',start,end,insurance:'full'}),/já inclui/);
});
test('one-day availability excludes other models that retain the 48-hour minimum',async()=>{
 await fixture({enabled:false});const t1=(await fleet.adminData()).models[0];
 await fleet.saveModel({...t1,id:'other',name:'Other',daily_cents:3000,spec:{...t1.spec,pricing:undefined}});await fleet.saveUnit({model_id:'other',color:'padrao-loja',label:'Other 1',status:'available'});
 const result=await fleet.availability(start,new Date(Date.parse(start)+86400000).toISOString());assert.equal(result.models.find(m=>m.id==='t1').available,5);assert.equal(result.models.find(m=>m.id==='other').available,0);
});
test('allocation gives the last unit of a color to only one concurrent request',async()=>{
 await fixture();const results=await Promise.allSettled([fleet.reserve(request()),fleet.reserve(request())]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);
});
test('public booking persists operational snapshots and refuses personal data',async()=>{
 await fixture();await assert.rejects(()=>fleet.reserve(request({name:'Private Person'})),status(400));await assert.rejects(()=>fleet.reserve(request({customer:{cpf:'123'}})),status(400));
 const accepted=await fleet.quote({model_id:'t1',color:'azul',start,end,insurance:'basic'});
 const b=await fleet.reserve(request({insurance:'basic',expected_total_cents:13000,expected_terms_token:accepted.terms_token}));
 const row=sqlite.prepare('SELECT * FROM reservations WHERE id=?').get(b.id);assert.equal(row.name,'');assert.equal(row.phone,'');assert.equal(row.email,'');assert.equal(row.city,'');
 assert.equal(b.total_cents,13000);assert.equal(b.unit_label,'T1 · 001');assert.equal(b.color_name,'Azul');assert.equal(b.terms_version,'rental-v1');assert.match(b.terms_snapshot,/Cobertura do teste/);
 for(const name of ['name','email','phone','city','request_key','request_fingerprint'])assert.equal(Object.hasOwn(b,name),false);
 const m=(await fleet.adminData()).models[0];await fleet.saveModel({...m,daily_cents:6000});
 const retained=sqlite.prepare('SELECT daily_cents,total_cents FROM reservations WHERE id=?').get(b.id);assert.equal(retained.daily_cents,5000);assert.equal(retained.total_cents,13000);
});
test('retries are idempotent and bind the complete accepted commercial request',async()=>{
 await fixture();const input=request();const a=await fleet.reserve(input),b=await fleet.reserve(input);assert.equal(a.code,b.code);
 await assert.rejects(()=>fleet.reserve({...input,color:'branca'}),status(409));await assert.rejects(()=>fleet.reserve({...input,expected_total_cents:1}),status(409));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservations').get().n,1);
});
test('changed conditions require renewed acceptance and cannot race the reservation insert',async()=>{
 await fixture();const accepted=request();
 await fleet.saveSettings({address:'Novo endereço',whatsapp:'19999999999',coverage:'Nova cobertura',protection_enabled:true,protection_daily_cents:1500,rentals_enabled:true});
 await assert.rejects(()=>fleet.reserve(accepted),status(409));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservations').get().n,0);
 const latest=await fleet.quote({model_id:'t1',color:'azul',start,end,insurance:'none'});
 beforeAllocation=()=>fleet.saveSettings({address:'Endereço alterado durante a confirmação',whatsapp:'19999999999',coverage:'Nova cobertura',protection_enabled:true,protection_daily_cents:1500,rentals_enabled:true});
 await assert.rejects(()=>fleet.reserve(request({expected_terms_token:latest.terms_token})),status(409));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservations').get().n,0);
});
test('activation, price, terms and color checks reject incomplete public bookings',async()=>{
 await fixture({enabled:false});await assert.rejects(()=>fleet.reserve(request()),status(409));
 await fixture();await assert.rejects(()=>fleet.reserve(request({terms_accepted:false})),status(400));await assert.rejects(()=>fleet.reserve(request({terms_version:'old'})),status(400));await assert.rejects(()=>fleet.reserve(request({color:'unknown'})),status(400));await assert.rejects(()=>fleet.reserve(request({expected_total_cents:1})),status(409));
 await fleet.saveSettings({address:'Teste',whatsapp:'19999999999',coverage:'Teste',protection_enabled:false,protection_daily_cents:1500,rentals_enabled:false});await assert.rejects(()=>fleet.reserve(request()),status(409));
});
test('unit archival preserves history and active reservations prevent recoloring or retirement',async()=>{
 await fixture();const b=await fleet.reserve(request());const unit=(await fleet.adminData()).units.find(u=>u.color==='azul');
 await assert.rejects(()=>fleet.saveUnit({...unit,status:'retired'}),status(409));await assert.rejects(()=>fleet.saveUnit({...unit,color:'branca'}),status(409));
 await fleet.updateReservation({id:b.id,status:'preparing',payment_status:'pending'});
 await fleet.updateReservation({id:b.id,status:'ready',payment_status:'pending',vehicle_checked:true,documents_checked:true,battery_checked:true,pickup_time:start});
 await fleet.updateReservation({id:b.id,status:'rented',payment_status:'paid',inspection_id:inspection(b.id,'departure')});
 await fleet.updateReservation({id:b.id,status:'returned',payment_status:'paid',inspection_id:inspection(b.id,'return')});
 await fleet.saveUnit({...unit,status:'retired'});assert.equal((await fleet.catalog()).models[0].quantity,4);assert.equal((await fleet.adminData()).units.length,5);
 assert.throws(()=>sqlite.prepare('DELETE FROM units WHERE id=?').run(unit.id),/UNIT_HAS_HISTORY/);
 assert.equal((await fleet.adminData()).reservations[0].unit_label,unit.label);
});
test('overdue rented vehicles remain unavailable until an actual return is recorded',async()=>{
 await fixture();const b=await fleet.reserve(request());const unit=(await fleet.adminData()).units.find(u=>u.color==='azul');
 sqlite.prepare("UPDATE reservations SET status='rented',start_ms=?,end_ms=? WHERE id=?").run(Date.now()-3*86400000,Date.now()-86400000,b.id);
 assert.equal((await fleet.availability(start,end)).models[0].colors.find(c=>c.id==='azul').available,0);
 await assert.rejects(()=>fleet.reserve(request()),status(409));await assert.rejects(()=>fleet.saveUnit({...unit,status:'retired'}),status(409));await assert.rejects(()=>legacy.updateUnit({id:unit.id,status:'maintenance'}),status(409));
 await assert.rejects(()=>fleet.addBlock({unit_id:unit.id,start,end,kind:'maintenance'}),status(409));
 assert.throws(()=>sqlite.prepare("UPDATE units SET status='retired' WHERE id=?").run(unit.id),/UNIT_ACTIVE_RESERVATION/);
 await fleet.updateReservation({id:b.id,status:'returned',payment_status:'paid',inspection_id:inspection(b.id,'return')});assert.equal((await fleet.availability(start,end)).models[0].colors.find(c=>c.id==='azul').available,1);
 assert.ok((await fleet.reserve(request())).code);
});
test('new physical units and model changes preserve separate identity and validate color references',async()=>{
 await fixture();const newUnit=await fleet.saveUnit({model_id:'t1',label:'T1 extra',color:'azul',identifier:'serial-001',status:'available'});assert.ok(newUnit.id);assert.equal((await fleet.catalog()).models[0].quantity,6);
 await assert.rejects(()=>fleet.saveUnit({model_id:'t1',label:'Duplicada',color:'azul',identifier:'serial-001',status:'available'}),status(409));
 const m=(await fleet.adminData()).models[0];await assert.rejects(()=>fleet.saveModel({...m,colors:m.colors.filter(c=>c.id!=='azul')}),status(409));
 await fleet.saveModel({...m,active:false});assert.equal((await fleet.catalog()).models.length,0);
});
test('product uploads are published as photo assets without making administration public',async()=>{
 await fixture();const m=(await fleet.adminData()).models[0],photo='a9b83985-098b-4b94-a7cb-03ac7cc6e59c';
 await fleet.saveModel({...m,photos:['/api/rental/photos/'+photo],colors:m.colors.map(c=>({...c,photos:c.id==='azul'?['/api/rental/photos/'+photo]:[]}))});
 const model=(await fleet.catalog()).models[0];assert.equal(model.photos[0],'/api/fleet/photos/'+photo);assert.equal(model.colors.find(c=>c.id==='azul').photos[0],'/api/fleet/photos/'+photo);
 environment.BUCKET={async get(key){assert.equal(key,'photos/'+photo);return {body:new Uint8Array([1,2,3]),writeHttpMetadata(headers){headers.set('Content-Type','image/png');}};}};
 const response=await route.GET(new Request('https://fleet.test/api/fleet/photos/'+photo));assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/png');
 delete environment.BUCKET;
});
test('atomic guard catches reservation interleaved with legacy unit reduction',async()=>{
 await fixture();await legacy.saveModel({id:'t1',name:'T1',brand:'New e-bike',daily_cents:5000,quantity:5,active:true,spec:{}});
 interleave=()=>fleet.reserve(request({color:'verde-camela'}));
 await assert.rejects(()=>legacy.saveModel({id:'t1',name:'T1',brand:'New e-bike',daily_cents:5000,quantity:4,active:true,spec:{}}),status(409));
 const row=sqlite.prepare("SELECT u.status FROM units u JOIN reservations r ON r.unit_id=u.id WHERE r.status='reserved'").get();assert.equal(row.status,'available');
});
test('API protects administration, rejects cross-site mutations and keeps public catalog read-only',async()=>{
 await fixture();
 const admin=await route.GET(new Request('https://fleet.test/api/fleet/admin'));assert.equal(admin.status,401);
 const outsider=await route.GET(new Request('https://fleet.test/api/fleet/admin',{headers:{'oai-authenticated-user-id':'visitor'}}));assert.equal(outsider.status,403);
 const catalog=await route.GET(new Request('https://fleet.test/api/fleet/catalog'));assert.equal(catalog.status,200);assert.equal((await catalog.json()).models.length,1);
 const post=(body,extra={})=>new Request('https://fleet.test/api/fleet/reservations',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify(body)});
 assert.equal((await route.POST(post(request(),{Origin:'https://other.test'}))).status,403);
 assert.equal((await route.POST(post(request(),{'sec-fetch-site':'cross-site'}))).status,403);
 assert.equal((await route.POST(post({padding:'x'.repeat(70_000)}))).status,413);
 assert.equal((await route.POST(post(request()))).status,200);
});
test('legacy creation is retired without reseeding the former fleet or losing historical queries',async()=>{
 await fixture();const request=new Request('https://fleet.test/api/rental/reservations',{method:'POST',headers:{'oai-authenticated-user-id':'owner','Content-Type':'application/json'},body:JSON.stringify({customer:{name:'Personal data'}})});
 assert.equal((await legacyRoute.POST(request)).status,410);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservations').get().n,0);
 const bootstrap=await legacyRoute.GET(new Request('https://fleet.test/api/rental/bootstrap',{headers:{'oai-authenticated-user-id':'owner'}}));assert.equal(bootstrap.status,200);
 assert.deepEqual((await bootstrap.json()).models.map(m=>m.id),['t1']);
});

const workflow=await compile('lib/reservation-workflow.ts');
test('preparation and ready states hold the exact unit and require operational release',async()=>{
 await fixture();const b=await fleet.reserve(request());
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'rented',payment_status:'pending'}),status(409));
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'ready',payment_status:'pending'}),status(409));
 await fleet.updateReservation({id:b.id,status:'preparing',payment_status:'pending'});
 assert.equal((await fleet.availability(start,end)).models[0].colors.find(c=>c.id==='azul').available,0);
 await assert.rejects(()=>fleet.reserve(request()),status(409));
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'ready',payment_status:'pending',pickup_time:start}),status(400));
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'ready',payment_status:'pending',pickup_time:end,vehicle_checked:true,documents_checked:true,battery_checked:true}),status(400));
 const released=(await fleet.updateReservation({id:b.id,status:'ready',payment_status:'pending',pickup_time:start,vehicle_checked:true,documents_checked:true,battery_checked:true})).reservation;
 assert.ok(released.ready_ms);assert.equal(released.pickup_ms,Date.parse(start));
 assert.match(workflow.reservationMessage(released,'ready','fallback'),/Sua moto está pronta/);
 assert.match(workflow.reservationMessage(released,'ready','fallback'),/Endereço do teste/);
 const retry=(await fleet.updateReservation({id:b.id,status:'ready',payment_status:'pending'})).reservation;
 assert.equal(retry.ready_ms,released.ready_ms);
 const unit=(await fleet.adminData()).units.find(u=>u.color==='azul');
 await assert.rejects(()=>fleet.saveUnit({...unit,status:'maintenance'}),status(409));
 await assert.rejects(()=>legacy.updateUnit({id:unit.id,status:'maintenance'}),status(409));
 await fleet.updateReservation({id:b.id,status:'preparing',payment_status:'pending'});
 const preparing=(await fleet.adminData()).reservations.find(r=>r.id===b.id);assert.equal(preparing.ready_ms,null);
 assert.throws(()=>workflow.reservationMessage(preparing,'ready','fallback'),/não foi liberada/);
 await fleet.updateReservation({id:b.id,status:'cancelled',payment_status:'pending'});
 assert.equal((await fleet.availability(start,end)).models[0].colors.find(c=>c.id==='azul').available,1);
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'ready',payment_status:'pending'}),status(409));
});
test('manual reservation selects a physical unit while public bookings are disabled and stores no contacts',async()=>{
 await fixture();const settings=(await fleet.catalog()).settings;await fleet.saveSettings({...settings,rentals_enabled:false});
 const q=await fleet.quote({model_id:'t1',color:'branca',start,end,insurance:'none'});
 const input=request({color:'branca',unit_id:'t1-002',expected_terms_token:q.terms_token});
 const b=await fleet.createManualReservation(input);
 assert.equal(b.unit_label,'T1 · 002');assert.equal(b.source,'manual');assert.equal(b.payment_status,'pending');
 assert.equal((await fleet.createManualReservation(input)).code,b.code);
 await assert.rejects(()=>fleet.createManualReservation({...input,unit_id:'t1-001'}),status(400));
 await assert.rejects(()=>fleet.createManualReservation({...input,phone:'19999999999'}),status(400));
 const row=sqlite.prepare('SELECT * FROM reservations WHERE id=?').get(b.id);
 assert.equal(row.name,'');assert.equal(row.phone,'');assert.equal(row.email,'');
 assert.match(workflow.reservationMessage(b,'confirmation','fallback'),/Aguarde a confirmação/);
 assert.throws(()=>workflow.reservationMessage(b,'ready','fallback'),/não foi liberada/);
 assert.equal((await fleet.availability(start,end)).models[0].colors.find(c=>c.id==='branca').available,0);
 const anonymous=await route.POST(new Request('https://example.test/api/fleet/admin/manual-reservation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}));assert.equal(anonymous.status,401);
});
const documents=await compile('lib/document-server.ts');
const documentPolicy=await compile('lib/document-policy.ts');
test('document clauses require explicit review and reservations preserve immutable accepted versions',async()=>{
 await fixture();
 const first=await fleet.reserve(request());
 assert.equal(JSON.parse(first.terms_snapshot).document.approved,false);
 await assert.rejects(()=>documents.saveDocumentVersion({policy:documentPolicy.defaultDocumentPolicy,publish:true,reviewed:false}),status(400));
 const policy={...documentPolicy.defaultDocumentPolicy,company:{name:'Empresa Teste',registration:'Identificação de teste',address:'Endereço teste',contact:'contato@example.com'},clauses:Object.fromEntries(documentPolicy.documentSections.map(([key])=>[key,'Condição definida e revisada pela empresa para '+key+'.']))};
 const before=await fleet.quote({model_id:'t1',color:'branca',start,end,insurance:'none'});
 const published=await documents.saveDocumentVersion({policy,publish:true,reviewed:true});
 assert.equal(published.approved,true);
 await assert.rejects(()=>fleet.reserve(request({color:'branca',expected_terms_token:before.terms_token})),status(409));
 const after=await fleet.quote({model_id:'t1',color:'branca',start,end,insurance:'none'});
 const second=await fleet.reserve(request({color:'branca',expected_terms_token:after.terms_token}));
 assert.equal(JSON.parse(second.terms_snapshot).document.version,published.version);
 assert.equal(JSON.parse((await fleet.adminData()).reservations.find(r=>r.id===first.id).terms_snapshot).document.version,documentPolicy.defaultDocumentPolicy.version);
 assert.throws(()=>sqlite.prepare('UPDATE document_versions SET approved=0 WHERE id=?').run(published.version),/IMMUTABLE/);
 assert.throws(()=>sqlite.prepare('DELETE FROM document_versions WHERE id=?').run(published.version),/IMMUTABLE/);
 const edited={...policy,clauses:{...policy.clauses,usage:'Outro texto aprovado'}};
 await documents.saveDocumentVersion({policy:edited,publish:true,reviewed:true});
 assert.equal(JSON.parse((await fleet.adminData()).reservations.find(r=>r.id===second.id).terms_snapshot).document.clauses.usage,policy.clauses.usage);
});
test('external customer references remain owner-only and contain no copied personal fields',async()=>{
 await fixture();const b=await fleet.reserve(request());
 await documents.linkExternalCustomer({id:b.id,system:'Sistema teste',reference:'customer-123'});
 const admin=(await fleet.adminData()).reservations.find(r=>r.id===b.id);assert.equal(admin.external_customer_ref,'customer-123');
 const replay=await fleet.reserve(request({request_key:sqlite.prepare('SELECT request_key FROM reservations WHERE id=?').get(b.id).request_key}));
 assert.equal('external_customer_ref' in replay,false);
 await assert.rejects(()=>documents.linkExternalCustomer({id:b.id,system:'ERP',reference:'52998224725'}),status(400));
 await assert.rejects(()=>documents.linkExternalCustomer({id:b.id,system:'ERP',reference:'customer-123',email:'test@example.com'}),status(400));
 const anon=await route.GET(new Request('https://example.test/api/fleet/admin/documents'));assert.equal(anon.status,401);
});

const deliveryServer=await compile('lib/document-delivery-server.ts');
const deliveryCustomer={name:'Cliente Teste Documento',cpf:'52998224725',phone:'19999999999',email:'cliente@example.com',birth:'2000-01-01',cep:'13720146',street:'Rua Teste',number:'100',district:'Centro',city:'Cidade Teste',state:'SP'};
const deliveryRequest=(path,body,owner=false)=>new Request('https://fleet.test/api/fleet/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(owner?{'oai-authenticated-user-id':'owner'}:{})},body:JSON.stringify(body)});
const configureGmail=()=>Object.assign(environment,{RESERVATION_EMAIL_FROM:'calori.mobi2@gmail.com',GMAIL_CLIENT_ID:'test-id',GMAIL_CLIENT_SECRET:'test-secret',GMAIL_REFRESH_TOKEN:'test-refresh'});
function resetDeliveryEnvironment(){for(const key of ['RESERVATION_EMAIL_FROM','RESERVATION_EMAIL_PROVIDER','GMAIL_CLIENT_ID','GMAIL_CLIENT_SECRET','GMAIL_REFRESH_TOKEN','CUSTOMER_API_URL','CUSTOMER_API_TOKEN','CUSTOMER_SYSTEM_NAME','ASSETS'])delete environment[key];}
function mockDelivery(t,{ambiguous=false}={}){
 const originalFetch=globalThis.fetch,calls={gmail:0,externalWrites:0,externalReads:0,raw:[]};
 const customers=new Map();
 environment.ASSETS={async fetch(){return new Response(readFileSync('public/fonts/DejaVuSans.ttf'));}};
 globalThis.fetch=async(url,options={})=>{
  const target=String(url);
  if(target==='https://oauth2.googleapis.com/token')return Response.json({access_token:'test-access'});
  if(target==='https://gmail.googleapis.com/gmail/v1/users/me/messages/send'){
   calls.gmail++;calls.raw.push(Buffer.from(JSON.parse(options.body).raw,'base64url').toString('utf8'));
   if(ambiguous)throw new Error('network response lost with private details');
   return Response.json({id:'gmail-test-'+calls.gmail});
  }
  if(target==='https://customer.example/api/customer-reservations'){
   calls.externalWrites++;const body=JSON.parse(options.body),ref='record-'+body.reservation_id;
   if(!customers.has(ref))customers.set(ref,body.customer);
   return Response.json({reference:ref});
  }
  if(target.startsWith('https://customer.example/api/customer-reservations/')){
   calls.externalReads++;const ref=target.split('/').at(-1);return Response.json({customer:customers.get(ref)});
  }
  throw new Error('Unexpected network target in test');
 };
 t.after(()=>{globalThis.fetch=originalFetch;resetDeliveryEnvironment();});return calls;
}
test('document capability expires, rejects other tokens and does not put personal data in the reservation DB',async()=>{
 await fixture();const b=await fleet.reserve(request());
 assert.ok(b.delivery_token);assert.equal((await fleet.adminData()).reservations[0].delivery_token,undefined);
 const body={reservation_id:b.id,delivery_token:b.delivery_token,customer:deliveryCustomer};
 assert.equal((await route.POST(deliveryRequest('documents/send',{...body,delivery_token:crypto.randomUUID()}))).status,403);
 assert.equal((await route.POST(deliveryRequest('documents/send',body,false))).status,200);
 assert.equal((await route.POST(deliveryRequest('admin/documents/send',{reservation_id:b.id,kind:'reservation'}))).status,401);
 assert.equal((await route.POST(deliveryRequest('documents/send',{...body,kind:'pickup_confirmation'}))).status,400);
 const response=await route.POST(deliveryRequest('documents/send',body));assert.equal((await response.json()).status,'not_configured');
 const stored=JSON.stringify(sqlite.prepare('SELECT * FROM reservations').all());
 for(const value of [deliveryCustomer.name,deliveryCustomer.cpf,deliveryCustomer.email,deliveryCustomer.street])assert.equal(stored.includes(value),false);
 sqlite.prepare('UPDATE reservations SET created_ms=? WHERE id=?').run(Date.now()-3_600_001,b.id);
 assert.equal((await route.POST(deliveryRequest('documents/send',body))).status,403);
});
test('Gmail reservation and release emails use external identity, deduplicate sends and preserve the first recipient',async t=>{
 await fixture();configureGmail();Object.assign(environment,{CUSTOMER_API_URL:'https://customer.example/api',CUSTOMER_API_TOKEN:'test-token',CUSTOMER_SYSTEM_NAME:'Test CRM'});
 const calls=mockDelivery(t),b=await fleet.reserve(request());
 const body={reservation_id:b.id,delivery_token:b.delivery_token,customer:deliveryCustomer};
 const results=await Promise.all([route.POST(deliveryRequest('documents/send',body)),route.POST(deliveryRequest('documents/send',body))]);
 const statuses=await Promise.all(results.map(r=>r.json()));assert.ok(statuses.some(r=>r.status==='submitted'));
 assert.equal(calls.gmail,1);assert.equal(calls.externalWrites,1);assert.match(calls.raw[0],/To: <cliente@example.com>/);
 const changed={...deliveryCustomer,email:'other@example.com',name:'Outra Pessoa Teste'};
 const repeated=await deliveryServer.sendCustomerDocument({...body,customer:changed},'https://fleet.test/');
 assert.equal(repeated.status,'already_sent');assert.equal(calls.externalWrites,1);assert.equal(calls.gmail,1);
 await fleet.updateReservation({id:b.id,status:'preparing',payment_status:'pending'});
 const released=await route.POST(deliveryRequest('admin/reservation',{id:b.id,status:'ready',payment_status:'pending',pickup_time:start,vehicle_checked:true,documents_checked:true,battery_checked:true},true));
 const result=await released.json();assert.equal(result.delivery.status,'submitted');assert.equal(calls.gmail,2);assert.match(calls.raw[1],/To: <cliente@example.com>/);
 const again=await route.POST(deliveryRequest('admin/documents/send',{reservation_id:b.id,kind:'pickup_confirmation'},true));assert.equal((await again.json()).status,'already_sent');assert.equal(calls.gmail,2);
 const tracked=sqlite.prepare('SELECT * FROM reservation_document_deliveries').all();assert.equal(tracked.filter(r=>r.status==='submitted').length,2);
 const persisted=JSON.stringify({reservations:sqlite.prepare('SELECT * FROM reservations').all(),deliveries:tracked});
 for(const value of [deliveryCustomer.name,deliveryCustomer.cpf,deliveryCustomer.email,deliveryCustomer.street,'test-refresh','test-access'])assert.equal(persisted.includes(value),false);
 assert.equal((await fleet.adminData()).reservations[0].documents_delivery.length,2);
});
test('ambiguous Gmail response and stale leases block repeat sends even with implicit Gmail selection',async t=>{
 await fixture();configureGmail();const calls=mockDelivery(t,{ambiguous:true}),b=await fleet.reserve(request());
 const body={reservation_id:b.id,delivery_token:b.delivery_token,customer:deliveryCustomer};
 const first=await deliveryServer.sendCustomerDocument(body,'https://fleet.test/');assert.equal(first.status,'uncertain');assert.match(first.message,/repetição automática foi bloqueada/);assert.equal(calls.gmail,1);
 assert.equal(sqlite.prepare('SELECT status FROM reservation_document_deliveries WHERE kind=?').get('reservation').status,'unknown');
 await deliveryServer.sendCustomerDocument(body,'https://fleet.test/');assert.equal(calls.gmail,1);
 sqlite.prepare("UPDATE reservation_document_deliveries SET status='sending',lease_ms=?").run(Date.now()-1);
 await deliveryServer.sendCustomerDocument(body,'https://fleet.test/');assert.equal(calls.gmail,1);
 assert.equal(sqlite.prepare('SELECT status FROM reservation_document_deliveries WHERE kind=?').get('reservation').status,'unknown');
});
test('release succeeds while unconfigured email is reported independently and current clauses are snapshotted',async()=>{
 await fixture();const b=await fleet.reserve(request());
 assert.equal(JSON.parse(b.terms_snapshot).delay_daily_cents,5000);assert.match(JSON.parse(b.terms_snapshot).document.clauses.delay,/dividida por 24/i);
 await fleet.updateReservation({id:b.id,status:'preparing',payment_status:'pending'});
 const response=await route.POST(deliveryRequest('admin/reservation',{id:b.id,status:'ready',payment_status:'pending',pickup_time:start,vehicle_checked:true,documents_checked:true,battery_checked:true},true));
 const result=await response.json();assert.equal(response.status,200);assert.equal(result.reservation.status,'ready');assert.equal(result.delivery.status,'not_configured');
});

test('allocation and blocks enforce preparation before and after the requested interval',async()=>{
 await fixture();const b=await fleet.reserve(request());
 const nextStart='2030-10-17T11:59:59-03:00',nextEnd='2030-10-19T11:59:59-03:00';
 const near=await fleet.quote({model_id:'t1',color:'azul',start:nextStart,end:nextEnd,insurance:'none'});
 await assert.rejects(()=>fleet.reserve(request({start:nextStart,end:nextEnd,expected_terms_token:near.terms_token})),status(409));
 const exactStart='2030-10-17T12:00:00-03:00',exactEnd='2030-10-19T12:00:00-03:00';
 const exact=await fleet.quote({model_id:'t1',color:'azul',start:exactStart,end:exactEnd,insurance:'none'});
 assert.ok((await fleet.reserve(request({start:exactStart,end:exactEnd,expected_terms_token:exact.terms_token}))).code);
 await assert.rejects(()=>fleet.addBlock({unit_id:'t1-001',start:end,end:exactStart,kind:'maintenance'}),status(409));
 assert.throws(()=>sqlite.prepare('INSERT INTO blocks (id,unit_id,start_ms,end_ms,reason,kind) VALUES (?,?,?,?,?,?)').run(crypto.randomUUID(),'t1-001',Date.parse(end),Date.parse(exactStart),'Legacy interleaving','maintenance'),/FLEET_BLOCK_CONFLICT/);
 assert.equal(JSON.parse(b.terms_snapshot).preparation_buffer_ms,3*3_600_000);
});
test('actual pickup requires its completed inspection, starts the contracted countdown once and return preserves preparation',async t=>{
 await fixture();const b=await fleet.reserve(request());await ready(b);
 const originalNow=Date.now;t.after(()=>{Date.now=originalNow;});
 const actual=Date.parse('2030-10-15T10:00:00-03:00');Date.now=()=>actual;
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'rented',payment_status:'paid'}),status(400));
 const incomplete=inspection(b.id,'departure',false);
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'rented',payment_status:'paid',inspection_id:incomplete}),status(400));
 const startResult=(await fleet.updateReservation({id:b.id,status:'rented',payment_status:'paid',inspection_id:inspection(b.id,'departure')})).reservation;
 assert.equal(startResult.actual_start_ms,actual);assert.equal(startResult.due_ms,actual+2*86_400_000);
 assert.equal(startResult.start_ms,Date.parse(start));assert.equal(startResult.end_ms,Date.parse(end));
 Date.now=()=>actual+60_000;
 const repeated=(await fleet.updateReservation({id:b.id,status:'rented',payment_status:'paid'})).reservation;
 assert.equal(repeated.actual_start_ms,actual);assert.equal(repeated.due_ms,startResult.due_ms);
 const returnedAt=startResult.due_ms+3*3_600_000;Date.now=()=>returnedAt;
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'returned',payment_status:'paid'}),status(400));
 const ended=(await fleet.updateReservation({id:b.id,status:'returned',payment_status:'paid',inspection_id:inspection(b.id,'return')})).reservation;
 assert.equal(ended.actual_end_ms,returnedAt);assert.equal(ended.late_fee_cents,208);assert.equal(ended.late_fee_status,'calculated');
 const plus=hours=>new Date(returnedAt+hours*3_600_000).toISOString();
 assert.equal((await fleet.availability(plus(1),plus(49))).models[0].colors.find(c=>c.id==='azul').available,0);
 assert.equal((await fleet.availability(plus(3),plus(51))).models[0].colors.find(c=>c.id==='azul').available,1);
 Date.now=()=>returnedAt+60_000;
 assert.equal((await fleet.updateReservation({id:b.id,status:'returned',payment_status:'paid'})).reservation.actual_end_ms,returnedAt);
});
test('late pickup cannot move the actual due time into the following reservation or its preparation gap',async t=>{
 await fixture();const b=await fleet.reserve(request());
 const nextStart='2030-10-17T12:00:00-03:00',nextEnd='2030-10-19T12:00:00-03:00';
 const q=await fleet.quote({model_id:'t1',color:'azul',start:nextStart,end:nextEnd,insurance:'none'});
 await fleet.reserve(request({start:nextStart,end:nextEnd,expected_terms_token:q.terms_token}));await ready(b);
 const originalNow=Date.now;t.after(()=>{Date.now=originalNow;});
 const actual=Date.parse('2030-10-15T10:00:00-03:00');Date.now=()=>actual;
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'rented',payment_status:'paid',inspection_id:inspection(b.id,'departure')}),status(409));
 assert.equal(sqlite.prepare('SELECT status,actual_start_ms FROM reservations WHERE id=?').get(b.id).status,'ready');
 assert.throws(()=>sqlite.prepare("UPDATE reservations SET status='rented',actual_start_ms=?,due_ms=? WHERE id=?").run(actual,actual+2*86_400_000,b.id),/FLEET_PICKUP_CONFLICT/);
 Date.now=()=>Date.parse(start);
 assert.equal((await fleet.updateReservation({id:b.id,status:'rented',payment_status:'paid',inspection_id:inspection(b.id,'departure')})).reservation.status,'rented');
});
test('customer association comes from a trusted argument and is bound to request idempotency without exposing its ID',async()=>{
 await fixture();
 sqlite.prepare('INSERT INTO customers (id,phone,password_hash,created_ms,updated_ms) VALUES (?,?,?,?,?)').run('customer-test','5519999999999','hash-test',Date.now(),Date.now());
 const input=request();const b=await fleet.reserve(input,false,'','customer-test');
 assert.equal(b.account_linked,true);assert.equal('customer_id' in b,false);assert.equal(sqlite.prepare('SELECT customer_id FROM reservations WHERE id=?').get(b.id).customer_id,'customer-test');
 await assert.rejects(()=>fleet.reserve(input),status(409));
 assert.equal((await fleet.reserve(input,false,'','customer-test')).id,b.id);
 await assert.rejects(()=>fleet.reserve(request({customer_id:'customer-test',color:'branca'})),status(400));
});
test('a safety hold hides a unit and blocks physical pickup even when its ordinary status is available',async t=>{
 await fixture();const b=await fleet.reserve(request());await ready(b);
 const hold=crypto.randomUUID();
 sqlite.prepare('INSERT INTO unit_safety_holds (id,unit_id,reason,created_ms,created_by) VALUES (?,?,?,?,?)').run(hold,'t1-001','Falha de freio registrada na vistoria',Date.now(),'owner');
 const tomorrow='2030-10-20T09:00:00-03:00',later='2030-10-22T09:00:00-03:00';
 assert.equal((await fleet.availability(tomorrow,later)).models[0].colors.find(c=>c.id==='azul').available,0);
 const q=await fleet.quote({model_id:'t1',color:'azul',start:tomorrow,end:later,insurance:'none'});
 await assert.rejects(()=>fleet.reserve(request({start:tomorrow,end:later,expected_terms_token:q.terms_token})),status(409));
 const originalNow=Date.now;t.after(()=>{Date.now=originalNow;});Date.now=()=>Date.parse(start);
 const departure=inspection(b.id,'departure');
 await assert.rejects(()=>fleet.updateReservation({id:b.id,status:'rented',payment_status:'paid',inspection_id:departure}),status(409));
 sqlite.prepare('UPDATE unit_safety_holds SET resolved_ms=?,resolved_by=?,resolution=? WHERE id=?').run(Date.now(),'owner','Reparo e conferência concluídos',hold);
 assert.equal((await fleet.updateReservation({id:b.id,status:'rented',payment_status:'paid',inspection_id:departure})).reservation.status,'rented');
});

test('release cannot announce pickup during the prior return preparation or an unresolved safety hold',async()=>{
 await fixture();
 const previousStart='2030-10-13T06:00:00-03:00',previousEnd='2030-10-15T06:00:00-03:00';
 const previousQuote=await fleet.quote({model_id:'t1',color:'azul',start:previousStart,end:previousEnd,insurance:'none'});
 const previous=await fleet.reserve(request({start:previousStart,end:previousEnd,expected_terms_token:previousQuote.terms_token}));
 const current=await fleet.reserve(request());
 sqlite.prepare("UPDATE reservations SET status='returned',actual_end_ms=? WHERE id=?").run(Date.parse(start)-3600000,previous.id);
 await fleet.updateReservation({id:current.id,status:'preparing',payment_status:'pending'});
 const release={id:current.id,status:'ready',payment_status:'pending',pickup_time:start,vehicle_checked:true,documents_checked:true,battery_checked:true};
 await assert.rejects(()=>fleet.updateReservation(release),status(409));
 assert.equal(sqlite.prepare('SELECT status FROM reservations WHERE id=?').get(current.id).status,'preparing');
 const afterPreparation={...release,pickup_time:'2030-10-15T11:00:00-03:00'};
 const hold=crypto.randomUUID();sqlite.prepare('INSERT INTO unit_safety_holds (id,unit_id,reason,created_ms,created_by) VALUES (?,?,?,?,?)').run(hold,'t1-001','Revisão pendente',Date.now(),'owner');
 await assert.rejects(()=>fleet.updateReservation(afterPreparation),status(409));
 sqlite.prepare('UPDATE unit_safety_holds SET resolved_ms=? WHERE id=?').run(Date.now(),hold);
 assert.equal((await fleet.updateReservation(afterPreparation)).reservation.status,'ready');
});

test('Cloudflare production refuses to open full-identification reservations before encryption is configured',async(t)=>{
 await fixture({enabled:false});const savedKey=environment.CUSTOMER_DATA_KEY;t.after(()=>{delete environment.CALORI_AUTH_MODE;if(savedKey===undefined)delete environment.CUSTOMER_DATA_KEY;else environment.CUSTOMER_DATA_KEY=savedKey;});environment.CALORI_AUTH_MODE='password';delete environment.CUSTOMER_DATA_KEY;
 const input={address:'Endereço do teste',whatsapp:'19999999999',coverage:'Condições de teste',protection_enabled:false,protection_daily_cents:1500,rentals_enabled:true};await assert.rejects(()=>fleet.saveSettings(input),e=>e.status===409);environment.CUSTOMER_DATA_KEY='c1'.repeat(32);assert.equal((await fleet.saveSettings(input)).rentals_enabled,true);
});
