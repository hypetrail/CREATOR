import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),testEnv={};globalThis.__RentalTestEnv=testEnv;
const shim={name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));b.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env=globalThis.__RentalTestEnv;'}));}};
async function compile(path){const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false,plugins:[shim]});const m={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(m,m.exports,require);return m.exports;}
const service=await compile('lib/rental-server.ts'),domain=await compile('lib/rental.ts'),route=await compile('app/api/rental/[...path]/route.ts');
const migration=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort().map(f=>readFileSync('drizzle/'+f,'utf8')).join('\n');
let sqlite;
function adapter(connection){return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return connection.prepare(sql).get(...args)||null;},async all(){return {results:connection.prepare(sql).all(...args)};},async run(){const r=connection.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};},async batch(statements){connection.exec('BEGIN');try{const result=[];for(const stmt of statements)result.push(await stmt.run());connection.exec('COMMIT');return result;}catch(e){connection.exec('ROLLBACK');throw e;}}};}
async function fixture(quantity=1){sqlite=new DatabaseSync(':memory:');sqlite.exec(migration);sqlite.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('owner_id','owner');testEnv.DB=adapter(sqlite);await service.bootstrap('owner');await service.saveModel({id:'cx18',name:'CX18',brand:'CALORIMOB',daily_cents:4500,quantity,active:true,spec:{}});await service.saveSettings({address:'Endereço usado somente no teste',whatsapp:'19999999999',protection_daily_cents:1500,protection_enabled:true,coverage:'Cobertura usada somente no teste',rentals_enabled:true});}
const start='2030-10-15T09:00:00-03:00',end='2030-10-17T09:00:00-03:00';
const contact={name:'Cliente de Teste',phone:'(19) 99999-8888',email:'teste@example.com',city:'Cidade de teste'};
function request(extra={}){return {model_id:'cx18',start,end,protection:true,payment_method:'pickup',customer:contact,request_key:crypto.randomUUID(),expected_total_cents:12000,expected_daily_cents:4500,...extra};}
const expectStatus=n=>e=>e.status===n;
test('24-hour billing enforces 48-hour minimum and rounds excess time',()=>{
 assert.throws(()=>domain.period(start,'2030-10-17T08:59:00-03:00',0));
 assert.equal(domain.period(start,end,0).days,2);
 assert.equal(domain.period(start,'2030-10-17T09:01:00-03:00',0).days,3);
 assert.equal(domain.charges(2,4500,1500,true).total_cents,12000);
 assert.equal(domain.charges(2,4500,1500,false).total_cents,9000);
});
test('initial rental fleet contains exactly the three supplied models and rates',async()=>{
 sqlite=new DatabaseSync(':memory:');sqlite.exec(migration);sqlite.prepare('INSERT INTO settings (key,value) VALUES (?,?)').run('owner_id','owner');testEnv.DB=adapter(sqlite);
 const initial=await service.bootstrap('owner');assert.equal(initial.models.length,3);assert.deepEqual(initial.models.map(m=>[m.id,m.daily_cents,m.quantity]),[['je7',3500,1],['rio',3500,1],['cx18',4500,1]]);assert.equal(initial.settings.rentals_enabled,false);await assert.rejects(()=>service.admin('other-user'),expectStatus(403));
});
test('configuration requires actual coverage and pickup information',async()=>{
 await fixture();await assert.rejects(()=>service.saveSettings({address:'',whatsapp:'',coverage:'',protection_daily_cents:1500,protection_enabled:true,rentals_enabled:false}),expectStatus(400));await assert.rejects(()=>service.saveSettings({address:'',whatsapp:'',coverage:'',protection_daily_cents:1500,protection_enabled:false,rentals_enabled:true}),expectStatus(400));
});
test('atomic allocation prevents two different reservations from claiming one unit',async()=>{
 await fixture();const result=await Promise.allSettled([service.reserve(request()),service.reserve(request())]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected'&&r.reason.status===409).length,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservations').get().n,1);assert.equal((await service.availability(start,end)).models.find(m=>m.id==='cx18').available,0);
});
test('two units can serve two simultaneous bookings and adjacent periods do not overlap',async()=>{
 await fixture(2);await service.reserve(request());await service.reserve(request());await assert.rejects(()=>service.reserve(request()),expectStatus(409));await service.reserve(request({start:end,end:'2030-10-19T09:00:00-03:00'}));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservations').get().n,3);
});
test('tampered totals, price changes and unintegrated online payments are rejected',async()=>{
 await fixture();await assert.rejects(()=>service.reserve(request({expected_total_cents:1})),expectStatus(409));await assert.rejects(()=>service.reserve(request({payment_method:'online'})),expectStatus(501));await service.saveModel({id:'cx18',name:'CX18',brand:'CALORIMOB',daily_cents:5000,quantity:1,active:true,spec:{}});await assert.rejects(()=>service.reserve(request()),expectStatus(409));assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM reservations').get().n,0);
});
test('idempotent retries return the same code; lookup requires matching phone',async()=>{
 await fixture();const input=request(),first=await service.reserve(input),second=await service.reserve(input);assert.equal(first.code,second.code);assert.equal((await service.lookup({phone:contact.phone,code:first.code.toLowerCase()})).id,first.id);await assert.rejects(()=>service.lookup({phone:'19999997777',code:first.code}),expectStatus(404));
});
test('maintenance blocks remove availability; cancellation releases reserved units',async()=>{
 await fixture();const blockResult=await service.addBlock({unit_id:'cx18-1',start,end,reason:'Teste',kind:'maintenance'});assert.equal(blockResult.ok,true);await assert.rejects(()=>service.reserve(request()),expectStatus(409));await assert.rejects(()=>service.addBlock({unit_id:'cx18-1',start,end,reason:'Outro',kind:'blocked'}),expectStatus(409));await service.deleteBlock(sqlite.prepare('SELECT id FROM blocks').get().id);const b=await service.reserve(request());await assert.rejects(()=>service.updateUnit({id:'cx18-1',status:'maintenance'}),expectStatus(409));await assert.rejects(()=>service.saveModel({id:'cx18',daily_cents:4500,quantity:0,active:true,spec:{}}),expectStatus(409));await service.updateReservation({id:b.id,status:'cancelled',payment_status:'pending'});await service.reserve(request());await assert.rejects(()=>service.updateReservation({id:b.id,status:'reserved',payment_status:'pending'}),expectStatus(409));
});
test('API rejects anonymous and non-admin requests server-side',async()=>{
 await fixture();const anonymous=await route.GET(new Request('https://example.test/api/rental/admin'));assert.equal(anonymous.status,401);const outsider=await route.GET(new Request('https://example.test/api/rental/admin',{headers:{'oai-authenticated-user-id':'viewer'}}));assert.equal(outsider.status,403);const crossSite=await route.POST(new Request('https://example.test/api/rental/quote',{method:'POST',headers:{'oai-authenticated-user-id':'owner',origin:'https://other.test','Content-Type':'application/json'},body:JSON.stringify(request())}));assert.equal(crossSite.status,403);
});
test('new model can be added without affecting existing rates or reservations',async()=>{
 await fixture();await service.saveModel({id:'m-test',name:'Modelo de teste',brand:'Marca de teste',daily_cents:6000,quantity:2,active:true,spec:{power:1000,range:50,speed:32,capacity:150,passengers:2},photos:[]});const b=await service.bootstrap('owner'),m=b.models.find(m=>m.id==='m-test');assert.equal(m.quantity,2);assert.equal(m.daily_cents,6000);assert.equal(b.models.find(m=>m.id==='cx18').daily_cents,4500);
});

test('insurance tiers are daily; washing never adds a separate charge',async()=>{
 await fixture();
 for(const [insurance,fee] of [['none',0],['basic',1500],['full',3000]]){
   for(const days of [2,3,7]){
     const q=await service.quote({model_id:'cx18',start,end:new Date(Date.parse(start)+days*domain.DAY).toISOString(),insurance,cleaning:true});
     assert.equal(q.total_cents,days*(4500+fee));assert.equal(q.cleaning_prepaid_cents,0);
   }
 }
 await assert.rejects(()=>service.quote({model_id:'cx18',start,end,insurance:'invalid'}));
 const b=await service.reserve(request({insurance:'full',cleaning:true,expected_total_cents:15000}));
 assert.equal(b.insurance,'full');assert.equal(b.cleaning_prepaid_cents,0);
 await service.updateReservation({id:b.id,status:'returned',payment_status:'paid',return_dirty:true});
 const result=await service.lookup({phone:contact.phone,code:b.code});assert.equal(result.total_cents,15000);assert.equal(result.return_cleaning_cents,0);
});
test('returned motorcycle never generates a separate washing charge',async()=>{
 await fixture();const b=await service.reserve(request({insurance:'none',expected_total_cents:9000}));
 await service.updateReservation({id:b.id,status:'returned',payment_status:'paid',return_dirty:true});
 const result=await service.lookup({phone:contact.phone,code:b.code});assert.equal(result.total_cents,9000);assert.equal(result.payment_status,'paid');assert.equal(result.return_cleaning_cents,0);
});
test('fleet initialization is one-time and preserves operator updates and booking snapshots',async()=>{
 await fixture();const b=await service.reserve(request());
 await service.saveModel({id:'cx18',name:'CX18',brand:'CaloriMob',daily_cents:4600,quantity:1,active:true,spec:{}});
 await service.bootstrap('owner');assert.equal((await service.lookup({phone:contact.phone,code:b.code})).daily_cents,4500);
 assert.equal((await service.bootstrap('owner')).models.find(m=>m.id==='cx18').daily_cents,4600);
});

test('public visitors cannot claim ownership of an uninitialized database',async()=>{sqlite=new DatabaseSync(':memory:');sqlite.exec(migration);testEnv.DB=adapter(sqlite);await service.initialize('visitor');assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM settings WHERE key='owner_id'").get().n,0);await assert.rejects(()=>service.admin('visitor'),expectStatus(403));});
