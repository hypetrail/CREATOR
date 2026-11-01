import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),environment={};
globalThis.__NotificationTestEnv=environment;
const shim={name:'notification-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));b.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env=globalThis.__NotificationTestEnv;'}));}};
async function compile(path){const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false,plugins:[shim]});const compiled={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);return compiled.exports;}
const provider=await compile('lib/whatsapp-server.ts'),queue=await compile('lib/notification-server.ts'),cron=await compile('app/api/notifications/route.ts');
const schemas="CREATE TABLE customer_notifications (\n id text PRIMARY KEY NOT NULL,\n customer_id text NOT NULL,\n reservation_id text NOT NULL DEFAULT '',\n kind text NOT NULL,\n event_key text NOT NULL,\n scheduled_ms integer NOT NULL,\n payload text NOT NULL DEFAULT '{}',\n status text NOT NULL DEFAULT 'pending',\n attempts integer NOT NULL DEFAULT 0,\n lease_ms integer NOT NULL DEFAULT 0,\n created_ms integer NOT NULL,\n updated_ms integer NOT NULL,\n provider_id text NOT NULL DEFAULT '',\n last_reason text NOT NULL DEFAULT '',\n submitted_ms integer\n);\nCREATE UNIQUE INDEX customer_notification_event ON customer_notifications(event_key);\nCREATE INDEX customer_notification_due ON customer_notifications(status,scheduled_ms);\nCREATE INDEX customer_notification_customer ON customer_notifications(customer_id,kind,created_ms);\n";
const HOUR=3600000,DAY=24*HOUR;
const configured={WHATSAPP_ACCESS_TOKEN:'test-secret-token',WHATSAPP_PHONE_NUMBER_ID:'1234567890123',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_TEMPLATE_LANGUAGE:'pt_BR',WHATSAPP_TEMPLATE_PREPARING:'calori_preparando',WHATSAPP_TEMPLATE_READY:'calori_pronta',WHATSAPP_TEMPLATE_RETURN_REMINDER:'calori_devolucao',WHATSAPP_TEMPLATE_AVAILABILITY:'calori_disponibilidade',WHATSAPP_TEMPLATE_CARE:'calori_cuidados',WHATSAPP_TEMPLATE_AUTH:'calori_acesso',APP_PUBLIC_URL:'https://calori.example'};
let sqlite;
function adapter(connection){return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return connection.prepare(sql).get(...args)||null;},async all(){return {results:connection.prepare(sql).all(...args)};},async run(){const result=connection.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};}};}
function fixture({state='ready',verified=1,service=1,marketing=0,configured:enabled=true}={}){
 sqlite?.close();sqlite=new DatabaseSync(':memory:');for(const key of Object.keys(environment))delete environment[key];if(enabled)Object.assign(environment,configured);
 sqlite.exec(`CREATE TABLE settings (key text PRIMARY KEY,value text NOT NULL);
 INSERT INTO settings (key,value) VALUES ('rentals_enabled','true'),('notify_auto_availability','false');
 CREATE TABLE customers (id text PRIMARY KEY,phone text,phone_verified integer,service_consent integer,marketing_consent integer,disabled integer NOT NULL DEFAULT 0);
 CREATE TABLE rental_models (id text PRIMARY KEY,name text,active integer,daily_cents integer);
 CREATE TABLE units (id text PRIMARY KEY,model_id text,status text);
 CREATE TABLE blocks (id text PRIMARY KEY,unit_id text,start_ms integer,end_ms integer);
 CREATE TABLE unit_safety_holds (id text PRIMARY KEY,unit_id text,resolved_ms integer);
 CREATE TABLE reservations (id text PRIMARY KEY,code text,customer_id text,model_name text,color_name text,status text,start_ms integer,end_ms integer,actual_start_ms integer,actual_end_ms integer,due_ms integer,pickup_ms integer,ready_ms integer,terms_snapshot text,unit_id text);`);
 sqlite.exec(schemas);sqlite.exec(readFileSync('drizzle/0006_document_delivery_tracking.sql','utf8'));environment.DB=adapter(sqlite);
 sqlite.prepare('INSERT INTO customers (id,phone,phone_verified,service_consent,marketing_consent) VALUES (?,?,?,?,?)').run('customer-1','5519999999999',verified,service,marketing);
 sqlite.prepare('INSERT INTO rental_models VALUES (?,?,?,?)').run('t1','T1',1,3000);sqlite.prepare('INSERT INTO units VALUES (?,?,?)').run('unit-1','t1','available');
 const now=Date.now();if(state)sqlite.prepare('INSERT INTO reservations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('reservation-1','CG-TEST','customer-1','T1','Azul',state,now+HOUR,now+49*HOUR,state==='rented'?now-DAY:null,null,state==='rented'?now+HOUR:null,now+HOUR,now-1000,JSON.stringify({address:'Endereço da reserva'}),'unit-1');
 return now;
}
function mockProvider(t,{ambiguous=false}={}){
 const old=globalThis.fetch,calls=[];globalThis.fetch=async(url,init)=>{assert.equal(url,'https://graph.facebook.com/v23.0/1234567890123/messages');const payload=JSON.parse(init.body);calls.push(payload);if(ambiguous)throw new Error('network response lost phone 5519999999999 token test-secret-token');return Response.json({messages:[{id:'wamid.TEST-'+calls.length}]});};
 t.after(()=>{globalThis.fetch=old;});return calls;
}

test('WhatsApp templates require explicit version, sender, secrets and approved template configuration',async()=>{
 const never=()=>{throw new Error('network must not be called');};
 assert.equal(provider.whatsappAuthConfigured(configured),true);assert.equal(provider.whatsappAuthConfigured({...configured,WHATSAPP_API_VERSION:''}),false);
 assert.equal(provider.whatsappConfiguration({}).provider,'not_configured');
 const result=await provider.sendWhatsAppTemplate({environment:{},to:'19999999999',kind:'ready',parameters:['CG-TEST']},never);assert.equal(result.status,'not_configured');
 assert.equal((await provider.sendWhatsAppTemplate({environment:configured,to:'19999999999',kind:'ready',parameters:['text\nheader']} ,never)).reason,'whatsapp_parameters_invalid');
 assert.equal(provider.whatsappConfiguration({...configured,WHATSAPP_ACCESS_TOKEN:'secret\r\nheader'}).provider,'not_configured');
});
test('authentication template sends its one-time code in provider body and button, never returns code or error bodies',async()=>{
 const result=await provider.sendWhatsAppAuthCode({environment:configured,to:'19999999999',code:'123456'},async(url,init)=>{
  const payload=JSON.parse(init.body);assert.equal(payload.to,'5519999999999');assert.equal(payload.template.name,'calori_acesso');assert.equal(payload.template.components[0].parameters[0].text,'123456');assert.equal(payload.template.components[1].sub_type,'url');assert.equal(payload.template.components[1].parameters[0].text,'123456');assert.equal(init.redirect,'manual');return Response.json({messages:[{id:'wamid.OTP'}]});
 });assert.deepEqual(result,{status:'submitted',provider_id:'wamid.OTP'});assert.equal(JSON.stringify(result).includes('123456'),false);
 const failure=await provider.sendWhatsAppAuthCode({environment:configured,to:'19999999999',code:'123456'},async()=>new Response('secret private body',{status:400}));assert.deepEqual(failure,{status:'failed',reason:'whatsapp_provider_rejected'});
 const uncertain=await provider.sendWhatsAppAuthCode({environment:configured,to:'19999999999',code:'123456'},async()=>{throw new Error('private');});assert.equal(uncertain.status,'uncertain');
});
test('operational and marketing messages require verified phone and distinct explicit consent',async()=>{
 fixture({verified:0});assert.equal((await queue.enqueueReadyNotification('reservation-1')).status,'skipped');
 sqlite.prepare('UPDATE customers SET phone_verified=1,service_consent=0,marketing_consent=1').run();assert.equal((await queue.enqueueReadyNotification('reservation-1')).status,'skipped');
 sqlite.prepare('UPDATE customers SET service_consent=1,marketing_consent=0').run();assert.equal((await queue.enqueueReadyNotification('reservation-1')).status,'queued');
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_notifications').get().n,1);
});
test('ready messages deduplicate event and concurrent worker claims and store no phone or secret in payload',async t=>{
 fixture();const calls=mockProvider(t);assert.equal((await queue.enqueueReadyNotification('reservation-1')).status,'queued');assert.equal((await queue.enqueueReadyNotification('reservation-1')).status,'exists');
 await Promise.all([queue.processNotifications(),queue.processNotifications()]);assert.equal(calls.length,1);assert.equal(calls[0].template.name,'calori_pronta');assert.equal(calls[0].template.components[0].parameters[0].text,'CG-TEST');assert.equal(calls[0].template.components[0].parameters[4].text,'Endereço da reserva');
 const row=sqlite.prepare('SELECT * FROM customer_notifications').get();assert.equal(row.status,'submitted');assert.equal(row.attempts,1);assert.equal(row.provider_id,'wamid.TEST-1');
 const persisted=JSON.stringify(row);for(const privateValue of ['5519999999999','test-secret-token','Endereço da reserva'])assert.equal(persisted.includes(privateValue),false);
 await queue.processNotifications();assert.equal(calls.length,1);
});
test('revoked consent and changed reservation status cancel queued messages before provider calls',async t=>{
 fixture();const calls=mockProvider(t);await queue.enqueueReadyNotification('reservation-1');sqlite.prepare('UPDATE customers SET service_consent=0').run();await queue.processNotifications();assert.equal(calls.length,0);assert.equal(sqlite.prepare('SELECT status FROM customer_notifications').get().status,'cancelled');
 fixture();await queue.enqueueReadyNotification('reservation-1');sqlite.prepare("UPDATE reservations SET status='returned'").run();await queue.processNotifications();assert.equal(calls.length,0);assert.equal(sqlite.prepare('SELECT status FROM customer_notifications').get().status,'cancelled');
});
test('preparation template never announces a vehicle as ready and is cancelled after release changes',async t=>{
 fixture({state:'preparing'});const calls=mockProvider(t);await queue.enqueuePreparationNotification('reservation-1');await queue.processNotifications();assert.equal(calls.length,1);assert.equal(calls[0].template.name,'calori_preparando');
 fixture({state:'preparing'});await queue.enqueuePreparationNotification('reservation-1');sqlite.prepare("UPDATE reservations SET status='cancelled'").run();await queue.processNotifications();assert.equal(calls.length,1);assert.equal(sqlite.prepare('SELECT status FROM customer_notifications').get().status,'cancelled');
});
test('return reminder and care schedule use actual pickup and due time with two-hour default lead',async t=>{
 const now=fixture({state:'rented'}),calls=mockProvider(t);sqlite.prepare('UPDATE reservations SET due_ms=?,end_ms=?').run(now+HOUR,now+10*DAY);
 await queue.enqueueReturnReminder('reservation-1');const scheduled=sqlite.prepare("SELECT scheduled_ms FROM customer_notifications WHERE kind='return_reminder'").get().scheduled_ms;assert.ok(scheduled<now);
 await queue.processNotifications();assert.equal(calls.length,2);const reminder=calls.find(call=>call.template.name==='calori_devolucao'),care=calls.find(call=>call.template.name==='calori_cuidados');assert.ok(reminder);assert.ok(care);assert.match(care.template.components[0].parameters[2].text,/https:\/\/calori.example\/api\/fleet\/care-guide/);
 const due=reminder.template.components[0].parameters[2].text;assert.equal(due,new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(now+HOUR));
});
test('availability campaigns use marketing opt-in, current stock and a rolling seven-day frequency cap',async t=>{
 fixture({state:null,marketing:1});const calls=mockProvider(t);
 sqlite.prepare('INSERT INTO customers (id,phone,phone_verified,service_consent,marketing_consent) VALUES (?,?,?,?,?)').run('customer-2','5519888888888',1,1,0);sqlite.prepare('INSERT INTO customers (id,phone,phone_verified,service_consent,marketing_consent) VALUES (?,?,?,?,?)').run('customer-3','5519777777777',0,1,1);
 assert.equal((await queue.enqueueAvailabilityCampaign()).queued,1);assert.equal((await queue.enqueueAvailabilityCampaign()).queued,0);
 await queue.processNotifications();assert.equal(calls.length,1);assert.equal(calls[0].template.name,'calori_disponibilidade');assert.deepEqual(calls[0].template.components[0].parameters.map(p=>p.text),['T1','https://calori.example/']);
 assert.equal((await queue.enqueueAvailabilityCampaign()).queued,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_notifications').get().n,1);
});
test('automatic availability respects the owner setting, public opening and the seven-day opt-in limit',async t=>{
 fixture({state:null,marketing:1});const calls=mockProvider(t);
 assert.equal((await queue.notificationAdmin()).auto_availability,false);
 await queue.processNotifications();assert.equal(calls.length,0);
 await queue.saveNotificationSettings({auto_availability:true});
 assert.equal((await queue.notificationAdmin()).auto_availability,true);
 await queue.processNotifications();assert.equal(calls.length,1);assert.equal(calls[0].template.name,'calori_disponibilidade');
 await queue.processNotifications();assert.equal(calls.length,1);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_notifications').get().n,1);
 sqlite.prepare('INSERT INTO customers (id,phone,phone_verified,service_consent,marketing_consent) VALUES (?,?,?,?,?)').run('customer-2','5519888888888',1,1,1);
 assert.equal((await queue.enqueueAvailabilityCampaign()).queued,1);
 sqlite.prepare("UPDATE settings SET value='false' WHERE key='rentals_enabled'").run();
 await queue.processNotifications();assert.equal(calls.length,1);
 assert.equal(sqlite.prepare("SELECT last_reason FROM customer_notifications WHERE customer_id='customer-2'").get().last_reason,'rentals_closed');
 assert.equal((await queue.enqueueAvailabilityCampaign()).queued,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_notifications').get().n,2);
});
test('automatic availability keeps one open task while the provider is not configured',async t=>{
 fixture({state:null,marketing:1,configured:false});const calls=mockProvider(t);
 await queue.saveNotificationSettings({auto_availability:true});
 for(let i=0;i<4;i++)await queue.processNotifications();
 assert.equal(calls.length,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_notifications').get().n,1);
 assert.equal(sqlite.prepare('SELECT status FROM customer_notifications').get().status,'not_configured');
});
test('operational messages take priority over a waiting availability campaign',async t=>{
 const now=fixture(),calls=mockProvider(t);
 for(let i=0;i<3;i++){
  const id='marketing-'+i;
  sqlite.prepare('INSERT INTO customers (id,phone,phone_verified,service_consent,marketing_consent) VALUES (?,?,?,?,?)').run(id,'551988888888'+i,1,0,1);
  await queue.enqueueNotification({customerId:id,kind:'availability',dedupeKey:'availability:'+id,scheduledMs:now-HOUR,payload:{model_ids:['t1']}});
 }
 await queue.enqueueReadyNotification('reservation-1');
 const result=await queue.processNotifications({limit:1});assert.equal(result.submitted,1);assert.equal(calls.length,1);assert.equal(calls[0].template.name,'calori_pronta');
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM customer_notifications WHERE kind='availability' AND status='pending'").get().n,3);
});
test('availability is rechecked when stock disappears and no catalogue read causes a campaign',async t=>{
 fixture({state:null,marketing:1});const calls=mockProvider(t);await queue.enqueueAvailabilityCampaign();sqlite.prepare("UPDATE units SET status='maintenance'").run();await queue.processNotifications();assert.equal(calls.length,0);assert.equal(sqlite.prepare('SELECT last_reason FROM customer_notifications').get().last_reason,'stock_unavailable');
});
test('ambiguous provider results and expired in-flight claims block duplicate automatic messages',async t=>{
 fixture();const calls=mockProvider(t,{ambiguous:true});await queue.enqueueReadyNotification('reservation-1');const result=await queue.processNotifications();assert.equal(result.unknown,1);assert.equal(calls.length,1);await queue.processNotifications();assert.equal(calls.length,1);assert.equal(sqlite.prepare('SELECT status FROM customer_notifications').get().status,'unknown');
 fixture();await queue.enqueueReadyNotification('reservation-1');sqlite.prepare("UPDATE customer_notifications SET status='sending',lease_ms=?").run(Date.now()-1);await queue.processNotifications();assert.equal(calls.length,1);assert.equal(sqlite.prepare('SELECT status FROM customer_notifications').get().status,'unknown');
});
test('missing credentials remain pending without consuming attempt limits or claiming a message was sent',async t=>{
 fixture({configured:false});const calls=mockProvider(t);await queue.enqueueReadyNotification('reservation-1');for(let i=0;i<6;i++)await queue.processNotifications();assert.equal(calls.length,0);const row=sqlite.prepare('SELECT status,attempts FROM customer_notifications').get();assert.equal(row.status,'not_configured');assert.equal(row.attempts,0);
});
test('unconfigured older templates do not starve a later ready notification',async t=>{
 const now=fixture({state:null}),calls=mockProvider(t);delete environment.WHATSAPP_TEMPLATE_CARE;
 for(let i=0;i<20;i++){
  const id='old-rental-'+i,actualStart=now-DAY;
  sqlite.prepare('INSERT INTO reservations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'CG-OLD-'+i,'customer-1','T1','Azul','rented',actualStart,now+DAY,actualStart,null,now+DAY,actualStart,actualStart-1000,'{}','unit-1');
  await queue.enqueueNotification({customerId:'customer-1',reservationId:id,kind:'care',dedupeKey:`care:${id}:${actualStart}`,scheduledMs:now-HOUR+i});
 }
 const first=await queue.processNotifications({limit:20});assert.equal(first.not_configured,20);assert.equal(calls.length,0);
 assert.equal(sqlite.prepare("SELECT COUNT(*) n FROM customer_notifications WHERE kind='care' AND status='not_configured'").get().n,20);
 sqlite.prepare('INSERT INTO reservations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('reservation-1','CG-TEST','customer-1','T1','Azul','ready',now+HOUR,now+49*HOUR,null,null,null,now+HOUR,now-1000,'{}','unit-1');
 await queue.enqueueReadyNotification('reservation-1');
 // The next batch must process the new ready event, not the same twenty
 // missing care templates again. A larger batch would hide this starvation.
 const second=await queue.processNotifications({limit:1});assert.equal(second.submitted,1);assert.equal(calls.length,1);
 assert.equal(calls[0].template.name,'calori_pronta');
 assert.equal(sqlite.prepare("SELECT status FROM customer_notifications WHERE kind='ready'").get().status,'submitted');
});
test('missing operational templates do not block a configured availability template',async t=>{
 fixture({state:'rented',marketing:1});const calls=mockProvider(t);
 delete environment.WHATSAPP_TEMPLATE_CARE;delete environment.WHATSAPP_TEMPLATE_RETURN_REMINDER;
 sqlite.prepare('INSERT INTO units VALUES (?,?,?)').run('unit-2','t1','available');
 await queue.enqueueCareReminder('reservation-1');await queue.enqueueReturnReminder('reservation-1');
 assert.equal((await queue.enqueueAvailabilityCampaign()).queued,1);
 const result=await queue.processNotifications({limit:1});assert.equal(result.submitted,1);assert.equal(calls.length,1);assert.equal(calls[0].template.name,'calori_disponibilidade');
});
test('cron rejects missing configuration and anonymous requests and accepts a secret-protected invocation',async()=>{
 fixture({state:null});const request=authorization=>new Request('https://calori.example/api/notifications',{method:'POST',headers:authorization?{Authorization:authorization}:{}});
 assert.equal((await cron.POST(request())).status,503);environment.NOTIFY_CRON_SECRET='x'.repeat(32);assert.equal((await cron.POST(request())).status,401);assert.equal((await cron.POST(request('Bearer wrong'))).status,401);assert.equal((await cron.POST(request('Bearer '+'x'.repeat(32)))).status,200);
});

test('marketing frequency counts actual submission, including an old event delayed by missing credentials',async t=>{
 fixture({state:null,marketing:1});const calls=mockProvider(t);await queue.enqueueAvailabilityCampaign();sqlite.prepare('UPDATE customer_notifications SET created_ms=?').run(Date.now()-8*DAY);
 await queue.processNotifications();assert.equal(calls.length,1);assert.equal((await queue.enqueueAvailabilityCampaign()).queued,0);
});
test('private inspection archive uses a media upload and approved document-header template to the configured company recipient',async()=>{
 const config={...configured,WHATSAPP_TEMPLATE_INSPECTION:'calori_vistoria',INSPECTION_ARCHIVE_PHONE:'5519888888888'},calls=[];
 const result=await provider.sendInspectionArchivePDF({environment:config,to:'19888888888',documentBytes:new TextEncoder().encode('%PDF-private-inspection'),filename:'Vistoria-TEST.pdf',parameters:['CG-TEST','Saída','T1 Azul']},async(url,init)=>{
  calls.push(url);assert.equal(init.redirect,'manual');
  if(url.endsWith('/media')){assert.ok(init.body instanceof FormData);assert.equal(init.body.get('messaging_product'),'whatsapp');assert.equal(init.body.get('file').type,'application/pdf');assert.equal(await init.body.get('file').text(),'%PDF-private-inspection');return Response.json({id:'12345678'});}
  const payload=JSON.parse(init.body);assert.equal(payload.to,'5519888888888');assert.equal(payload.template.name,'calori_vistoria');assert.equal(payload.template.components[0].type,'header');assert.equal(payload.template.components[0].parameters[0].document.id,'12345678');assert.deepEqual(payload.template.components[1].parameters.map(p=>p.text),['CG-TEST','Saída','T1 Azul']);return Response.json({messages:[{id:'wamid.ARCHIVE'}]});
 });assert.equal(result.status,'submitted');assert.equal(calls.length,2);assert.equal(JSON.stringify(result).includes('private-inspection'),false);
 const never=()=>{throw new Error('must not send');};
 assert.equal((await provider.sendInspectionArchivePDF({environment:config,to:'19999999999',documentBytes:new TextEncoder().encode('%PDF-test'),filename:'Vistoria.pdf',parameters:[]},never)).reason,'inspection_archive_recipient_invalid');
 assert.equal((await provider.sendInspectionArchivePDF({environment:{},documentBytes:new TextEncoder().encode('%PDF-test'),filename:'Vistoria.pdf',parameters:[]},never)).status,'not_configured');
});
test('an inspection media upload failure is safe to retry and never claims that a message was sent',async()=>{
 const config={...configured,WHATSAPP_TEMPLATE_INSPECTION:'calori_vistoria',INSPECTION_ARCHIVE_PHONE:'5519888888888'};let calls=0;
 const result=await provider.sendInspectionArchivePDF({environment:config,documentBytes:new TextEncoder().encode('%PDF-test'),filename:'Vistoria.pdf',parameters:[]},async url=>{calls++;assert.ok(url.endsWith('/media'));throw new Error('network during upload');});
 assert.deepEqual(result,{status:'failed',reason:'inspection_archive_upload_unavailable'});assert.equal(calls,1);
});

test('disabled accounts cannot enqueue or receive messages and safety-held units cannot be advertised',async t=>{
 fixture();const calls=mockProvider(t);await queue.enqueueReadyNotification('reservation-1');sqlite.prepare('UPDATE customers SET disabled=1').run();await queue.processNotifications();assert.equal(calls.length,0);assert.equal(sqlite.prepare('SELECT status FROM customer_notifications').get().status,'cancelled');assert.equal((await queue.enqueueReadyNotification('reservation-1')).status,'skipped');
 fixture({state:null,marketing:1});sqlite.prepare('INSERT INTO unit_safety_holds VALUES (?,?,?)').run('hold-1','unit-1',null);assert.equal((await queue.enqueueAvailabilityCampaign()).queued,0);assert.equal(calls.length,0);
 sqlite.prepare('UPDATE unit_safety_holds SET resolved_ms=?').run(Date.now());assert.equal((await queue.enqueueAvailabilityCampaign()).queued,1);
});

test('a safety fault discovered after release cancels the queued ready message before any provider call',async t=>{
 fixture();const calls=mockProvider(t);
 await queue.enqueueReadyNotification('reservation-1');
 sqlite.prepare('INSERT INTO unit_safety_holds VALUES (?,?,?)').run('hold-after-release','unit-1',null);
 const result=await queue.processNotifications();assert.equal(result.cancelled,1);assert.equal(calls.length,0);
 const recorded=sqlite.prepare('SELECT status,last_reason FROM customer_notifications').get();assert.equal(recorded.status,'cancelled');assert.equal(recorded.last_reason,'pickup_unit_not_safe');
});
