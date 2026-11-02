import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const environment={FLEET_OWNER_ID:'owner',CALORI_AUTH_MODE:'password'};
globalThis.__MinimalAllocationEnv=environment;
const compiled=await build({entryPoints:['lib/fleet-server.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'minimal-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));b.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env=globalThis.__MinimalAllocationEnv;'}));}}]});
const compiledModule={exports:{}};
new Function('module','exports','require',compiled.outputFiles[0].text)(compiledModule,compiledModule.exports,require);
const fleet=compiledModule.exports;
let sqlite;

// Serialize the entire batch as one operation, as D1 does. Awaiting individual
// statements between BEGIN and COMMIT would incorrectly interleave transactions
// on this single SQLite connection and would not model D1 atomicity.
function d1Adapter(connection){
 let tail=Promise.resolve();
 const enqueue=(action)=>{const result=tail.then(action);tail=result.catch(()=>{});return result;};
 return {
  prepare(sql){
   let args=[];
   const runSync=()=>{const result=connection.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};};
   return {bind(...values){args=values;return this;},first(){return enqueue(()=>connection.prepare(sql).get(...args)||null);},all(){return enqueue(()=>({results:connection.prepare(sql).all(...args)}));},run(){return enqueue(runSync);},runSync};
  },
  batch(statements){return enqueue(()=>{connection.exec('BEGIN');try{const results=statements.map(s=>s.runSync());connection.exec('COMMIT');return results;}catch(error){connection.exec('ROLLBACK');throw error;}});},
 };
}
const start='2030-10-15T09:00:00-03:00',end='2030-10-17T09:00:00-03:00';
const contact={name:'Cliente Fictício Alocação',phone:'(11) 99888-7766'};
async function fixture(){
 sqlite?.close();sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 environment.DB=d1Adapter(sqlite);
 await fleet.initialize('owner');
 await fleet.saveSettings({address:'Endereço da loja de teste',whatsapp:'19999999999',coverage:'Condições de teste',protection_enabled:false,protection_daily_cents:1500,rentals_enabled:true});
 const quote=await fleet.quote({model_id:'t1',start,end,insurance:'none'});
 return {model_id:'t1',color:quote.color,start,end,insurance:quote.insurance,request_key:crypto.randomUUID(),expected_daily_cents:quote.daily_cents,expected_total_cents:quote.total_cents,terms_version:'rental-v1',terms_accepted:true,expected_terms_token:quote.terms_token,contact:{...contact},whatsapp_consent:true};
}
const count=table=>sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
const available=async()=>(await fleet.availability(start,end)).models.find(m=>m.id==='t1').available;

test('minimal reservation rolls back the allocated stock if storing its contact fails',async()=>{
 const input=await fixture();
 sqlite.exec("CREATE TRIGGER test_minimal_contact_failure BEFORE INSERT ON reservation_contacts BEGIN SELECT RAISE(ABORT,'TEST_CONTACT_WRITE_FAILURE'); END;");
 await assert.rejects(()=>fleet.reserve(input),/TEST_CONTACT_WRITE_FAILURE/);
 assert.equal(count('reservations'),0);assert.equal(count('reservation_contacts'),0);assert.equal(await available(),5);
 sqlite.exec('DROP TRIGGER test_minimal_contact_failure');
 const recovered=await fleet.reserve(input);assert.equal(recovered.total_cents,9000);assert.equal(count('reservations'),1);assert.equal(count('reservation_contacts'),1);
});

test('invalid WhatsApp, extra personal fields and missing consent never consume a unit',async()=>{
 const input=await fixture();
 for(const badContact of [{phone:'123'},{phone:'invalid'},{phone:123},{...contact,cpf:'52998224725'},{...contact,email:'cliente@example.com'},{...contact,street:'Rua Exemplo'}]){
  await assert.rejects(()=>fleet.reserve({...input,request_key:crypto.randomUUID(),contact:badContact}),e=>e.status===400);
 }
 for(const consent of [false,undefined,'true'])await assert.rejects(()=>fleet.reserve({...input,request_key:crypto.randomUUID(),whatsapp_consent:consent}),e=>e.status===400);
 assert.equal(count('reservations'),0);assert.equal(count('reservation_contacts'),0);assert.equal(await available(),5);
});

test('only normalized minimal contact is stored, outside commercial data and public booking response',async()=>{
 const input=await fixture(),booking=await fleet.reserve(input);
 const stored=sqlite.prepare('SELECT * FROM reservation_contacts WHERE reservation_id=?').get(booking.id);
 assert.equal(stored.phone,'5511998887766');assert.equal(stored.name,contact.name);assert.ok(stored.consent_ms>0);assert.equal(stored.revoked_ms,null);
 const operational=sqlite.prepare('SELECT * FROM reservations WHERE id=?').get(booking.id);
 for(const key of ['name','phone','email','city','customer_id'])assert.equal(operational[key],'',key);
 for(const value of [contact.name,contact.phone,stored.phone]){
  assert.equal(JSON.stringify(operational).includes(value),false);
  assert.equal(JSON.stringify(booking).includes(value),false);
 }
 for(const table of ['customers','customer_profiles','reservation_customer_data','reservation_private_documents'])assert.equal(count(table),0,table);
 assert.equal(environment.CUSTOMER_DATA_KEY,undefined);assert.equal(environment.BUCKET,undefined);assert.equal(await available(),4);
});

test('idempotent retries with equivalent phone formatting keep one reservation and one frozen contact',async()=>{
 const input=await fixture(),first=await fleet.reserve(input);
 const replay=await fleet.reserve({...input,contact:{name:contact.name,phone:'5511998887766'}});
 assert.equal(replay.id,first.id);assert.equal(replay.code,first.code);assert.equal(count('reservations'),1);assert.equal(count('reservation_contacts'),1);
 await assert.rejects(()=>fleet.reserve({...input,contact:{...contact,phone:'(11) 99777-6655'}}),e=>e.status===409);
 assert.equal(sqlite.prepare('SELECT phone FROM reservation_contacts WHERE reservation_id=?').get(first.id).phone,'5511998887766');assert.equal(await available(),4);
});

test('concurrent retries of the same request create only one contact and return the same reservation',async()=>{
 const input=await fixture(),results=await Promise.all([fleet.reserve(input),fleet.reserve({...input,contact:{...input.contact}})]);
 assert.equal(results[0].id,results[1].id);assert.equal(count('reservations'),1);assert.equal(count('reservation_contacts'),1);assert.equal(await available(),4);
});

test('two customers competing for the last unit leave exactly one committed reservation and contact',async()=>{
 const input=await fixture();
 sqlite.prepare("UPDATE units SET status='maintenance' WHERE id<>'t1-001'").run();assert.equal(await available(),1);
 const results=await Promise.allSettled([
  fleet.reserve(input),
  fleet.reserve({...input,request_key:crypto.randomUUID(),contact:{name:'Outro Cliente Fictício',phone:'(11) 99777-6655'}}),
 ]);
 const successes=results.filter(r=>r.status==='fulfilled'),conflicts=results.filter(r=>r.status==='rejected'&&r.reason.status===409);
 assert.equal(successes.length,1);assert.equal(conflicts.length,1);assert.equal(count('reservations'),1);assert.equal(count('reservation_contacts'),1);assert.equal(await available(),0);
 const booking=successes[0].value;
 assert.equal(sqlite.prepare('SELECT reservation_id FROM reservation_contacts').get().reservation_id,booking.id);
});
