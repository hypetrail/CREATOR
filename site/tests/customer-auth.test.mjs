import test from 'node:test';
import assert from 'node:assert/strict';
import {pbkdf2Sync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
const require=createRequire(import.meta.url),environment={};
globalThis.__CustomerAccountTestEnv=environment;
const shim={name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'env'}));b.onLoad({filter:/.*/,namespace:'env'},()=>({contents:'export const env=globalThis.__CustomerAccountTestEnv;'}));}};
async function compile(path){const result=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false,plugins:[shim]});const compiled={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);return compiled.exports;}
const auth=await compile('lib/customer-auth.ts'),route=await compile('app/api/customer/[...path]/route.ts'),storage=await compile('lib/private-customer-store.ts');
let sqlite,beforeSessionInsert;
function adapter(connection){return {prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){if(beforeSessionInsert&&/^INSERT INTO customer_sessions/.test(sql)){const action=beforeSessionInsert;beforeSessionInsert=null;await action();}return connection.prepare(sql).get(...args)||null;},async all(){return {results:connection.prepare(sql).all(...args)};},async run(){const result=connection.prepare(sql).run(...args);return {meta:{changes:Number(result.changes)}};}};},async batch(statements){connection.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());connection.exec('COMMIT');return results;}catch(error){connection.exec('ROLLBACK');throw error;}}};}
function fixture(){
 sqlite?.close();sqlite=new DatabaseSync(':memory:');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 for(const key of Object.keys(environment))delete environment[key];environment.DB=adapter(sqlite);beforeSessionInsert=null;
}
const request=(path,body,cookie='',extra={})=>new Request('https://calori.test/api/customer/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...extra},body:body===undefined?undefined:JSON.stringify(body)});
const sample={phone:'19999999999',password:'Minha senha de teste forte!'};
const sessionCookie=result=>result.setCookie.split(';')[0];
async function registered(extra={}){const result=await auth.registerCustomer(request('register',{}),{...sample,...extra});return {result,cookie:sessionCookie(result)};}
const status=code=>error=>error.status===code;

test('password verification uses the recorded work factor for current and legacy hashes',async()=>{
 const salt=Buffer.alloc(32,0x42);
 for(const iterations of [100000,600000]){
  const digest=pbkdf2Sync(sample.password,salt,iterations,32,'sha256').toString('hex');
  const encoded=`pbkdf2-sha256$${iterations}$${salt.toString('hex')}$${digest}`;
  assert.equal(await auth.verifyCustomerPassword(sample.password,encoded),true);
  assert.equal(await auth.verifyCustomerPassword('Uma senha diferente de teste!',encoded),false);
 }
});

test('unrecognized hash formats and arbitrary work factors are rejected before deriving',async t=>{
 const derive=t.mock.method(crypto.subtle,'deriveBits',async()=>{throw new Error('Unsupported hash must not run');});
 const salt='ab'.repeat(32),digest='cd'.repeat(32);
 for(const iterations of ['0','1','100001','600001','999999999','0100000','1e5']){
  assert.equal(await auth.verifyCustomerPassword(sample.password,`pbkdf2-sha256$${iterations}$${salt}$${digest}`),false);
 }
 for(const encoded of [`other$100000$${salt}$${digest}`,`pbkdf2-sha256$100000$short$${digest}`,`pbkdf2-sha256$100000$${salt}$bad`,`pbkdf2-sha256$100000$${salt}$${digest}$extra`]){
  assert.equal(await auth.verifyCustomerPassword(sample.password,encoded),false);
 }
 assert.equal(derive.mock.callCount(),0);
});

test('customer registration uses salted standard password hashing and hashed HttpOnly sessions without returning secrets',async()=>{
 fixture();const {result,cookie}=await registered();
 assert.equal(result.customer.phone_verified,false);assert.equal(result.customer.operational_whatsapp,false);assert.equal(result.customer.marketing_whatsapp,false);
 assert.ok(result.customer.phone_masked.endsWith('9999'));assert.equal('phone' in result.customer,false);
 const row=sqlite.prepare('SELECT * FROM customers').get();assert.match(row.password_hash,/^pbkdf2-sha256\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}$/);assert.equal(row.password_hash.includes(sample.password),false);
 const second=await auth.hashCustomerPassword(sample.password);assert.notEqual(second,row.password_hash);
 const token=cookie.split('=')[1],stored=sqlite.prepare('SELECT * FROM customer_sessions').get();assert.notEqual(stored.token_hash,token);assert.match(stored.token_hash,/^[a-f0-9]{64}$/);
 assert.match(result.setCookie,/HttpOnly/);assert.match(result.setCookie,/SameSite=Lax/);assert.match(result.setCookie,/Secure/);
 const identity=await auth.customerIdentity(request('me',undefined,cookie));assert.equal(identity.id,result.customer.id);
 const before=JSON.stringify(sqlite.prepare('SELECT * FROM customers').all());const response=await route.GET(request('me',undefined,cookie)),payload=await response.json();assert.equal(response.status,410);assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/);assert.equal('customer' in payload,false);assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM customers').all()),before);
 for(const value of ['password_hash','token_hash',sample.password,sample.phone])assert.equal(JSON.stringify(payload).includes(value),false);
});

test('retired account routes reject every request without creating customers or sessions; password validators remain intact',async()=>{
 fixture();
 await assert.rejects(()=>auth.registerCustomer(request('register',{}),{...sample,phone_verified:true}),status(400));
 for(const bad of ['curta','123456789012','aaaaaaaaaaaa'])await assert.rejects(()=>auth.hashCustomerPassword(bad),status(400));
 const cross=await route.POST(request('register',sample,'',{Origin:'https://attacker.test'}));assert.equal(cross.status,410);
 const insecure=new Request('http://calori.test/api/customer/me');assert.equal((await route.GET(insecure)).status,410);
 const huge=await route.POST(request('register',{padding:'x'.repeat(9000)}));assert.equal(huge.status,410);
 const registeredResponse=await route.POST(request('register',sample));assert.equal(registeredResponse.status,410);const body=await registeredResponse.json();assert.equal('customer' in body,false);assert.equal('setCookie' in body,false);assert.match(registeredResponse.headers.get('Set-Cookie'),/Max-Age=0/);
 const duplicate=await route.POST(request('register',sample));assert.equal(duplicate.status,410);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customers').get().n,0);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_sessions').get().n,0);
});

test('login failures are generic, successful sessions expire and logout revokes the session',async()=>{
 fixture();await registered();
 for(const payload of [{...sample,password:'Senha incorreta de teste!'},{phone:'19888888888',password:sample.password}]){
  await assert.rejects(()=>auth.loginCustomer(request('login',{}),payload),error=>error.status===401&&error.message==='Telefone ou senha inválidos.');const before=sqlite.prepare('SELECT COUNT(*) n FROM customer_sessions').get().n;const response=await route.POST(request('login',payload));assert.equal(response.status,410);assert.equal('customer' in await response.json(),false);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_sessions').get().n,before);
 }
 const logged=await auth.loginCustomer(request('login',{}),sample),cookie=sessionCookie(logged);
 assert.ok(await auth.customerIdentity(request('me',undefined,cookie)));
 const logout=await auth.logoutCustomer(request('logout',{},cookie));assert.match(logout.setCookie,/Max-Age=0/);assert.equal(await auth.customerIdentity(request('me',undefined,cookie)),null);
 const again=await auth.loginCustomer(request('login',{}),sample);sqlite.prepare('UPDATE customer_sessions SET expires_ms=?').run(Date.now()-1);
 assert.equal(await auth.customerIdentity(request('me',undefined,sessionCookie(again))),null);
});

test('per-phone login throttling stores only expiring hashed rate keys',async()=>{
 fixture();await registered();
 for(let i=0;i<8;i++)await assert.rejects(()=>auth.loginCustomer(request('login',{},'',{'CF-Connecting-IP':'192.0.2.1'}),{...sample,password:'Senha incorreta de teste!'}),status(401));
 await assert.rejects(()=>auth.loginCustomer(request('login',{},'',{'CF-Connecting-IP':'192.0.2.2'}),sample),status(429));
 const rows=sqlite.prepare('SELECT * FROM customer_auth_limits').all();assert.ok(rows.length>=2);for(const row of rows)assert.match(row.key_hash,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(rows).includes(sample.phone),false);assert.equal(JSON.stringify(rows).includes('192.0.2.1'),false);
 sqlite.prepare('UPDATE customer_auth_limits SET window_ms=?').run(Date.now()-4*3_600_000);
 assert.ok((await auth.loginCustomer(request('login',{}),sample)).customer.id);
});

function insertReservation(customerId,code){
 const id=crypto.randomUUID();sqlite.prepare(`INSERT INTO reservations (id,code,request_key,unit_id,model_id,model_name,start_ms,end_ms,days,daily_cents,protection_daily_cents,total_cents,name,phone,email,city,payment_method,payment_status,status,created_ms,customer_id,terms_snapshot) VALUES (?,?,?,?,?,?,0,172800000,2,3000,1500,9000,'','','','','pickup','pending','reserved',?,?,?)`).run(id,code,crypto.randomUUID(),'unit-'+id,'t1','T1',Date.now(),customerId,'{"document":{"version":"saved"}}');return id;
}
test('archived reservation helpers preserve ownership while public listing and preference writes are retired',async()=>{
 fixture();const a=await registered(),b=await registered({phone:'19888888888'});const idA=insertReservation(a.result.customer.id,'CG-A');insertReservation(b.result.customer.id,'CG-B');
 const before=JSON.stringify(sqlite.prepare('SELECT * FROM reservations ORDER BY code').all());const result=await auth.customerReservations(request('reservations',undefined,a.cookie));assert.equal(result.reservations.length,1);assert.equal(result.reservations[0].id,idA);assert.equal(result.reservations[0].code,'CG-A');assert.ok(result.server_now_ms);
 for(const key of ['customer_id','request_key','request_fingerprint','name','phone','email','external_customer_ref'])assert.equal(key in result.reservations[0],false);
 for(const session of ['',a.cookie,b.cookie]){const response=await route.GET(request('reservations',undefined,session));assert.equal(response.status,410);assert.equal('reservations' in await response.json(),false);}const customers=JSON.stringify(sqlite.prepare('SELECT * FROM customers ORDER BY id').all());assert.equal((await route.POST(request('preferences',{phone_verified:true},a.cookie))).status,410);assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM customers ORDER BY id').all()),customers);assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM reservations ORDER BY code').all()),before);
});

test('transactional and promotional consent are independent, reversible, and do not verify the phone',async()=>{
 fixture();const {cookie}=await registered();
 let result=await auth.customerPreferences(request('preferences',{},cookie),{marketing_whatsapp:true});assert.equal(result.customer.marketing_whatsapp,true);assert.equal(result.customer.operational_whatsapp,false);assert.equal(result.customer.phone_verified,false);
 result=await auth.customerPreferences(request('preferences',{},cookie),{operational_whatsapp:true,marketing_whatsapp:false});assert.equal(result.customer.operational_whatsapp,true);assert.equal(result.customer.marketing_whatsapp,false);
 const row=sqlite.prepare('SELECT * FROM customers').get();assert.ok(row.service_consent_ms);assert.equal(row.marketing_consent_ms,null);assert.equal(row.consent_version,'customer-whatsapp-v1');
 await auth.customerPreferences(request('preferences',{},cookie),{operational_whatsapp:false});assert.equal(sqlite.prepare('SELECT service_consent FROM customers').get().service_consent,0);
});

function otpConfiguration(){Object.assign(environment,{CUSTOMER_OTP_SECRET:'example-test-secret-at-least-32-characters',WHATSAPP_ACCESS_TOKEN:'test-token',WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_API_VERSION:'v99.0',WHATSAPP_TEMPLATE_AUTH:'verify_customer'});}
function mockWhatsApp(t){const original=globalThis.fetch,codes=[];globalThis.fetch=async(url,options)=>{assert.equal(url,'https://graph.facebook.com/v99.0/123456789/messages');const body=JSON.parse(options.body);codes.push(body.template.components[0].parameters[0].text);return Response.json({messages:[{id:'wamid.test'}]});};t.after(()=>{globalThis.fetch=original;});return codes;}
test('phone verification is honestly unavailable without provider configuration and never calls an external service',async t=>{
 fixture();const {cookie}=await registered(),original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('No request expected');};t.after(()=>{globalThis.fetch=original;});
 const result=await auth.requestCustomerVerification(request('verify/request',{},cookie),{});assert.equal(result.status,'not_configured');assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_phone_challenges').get().n,0);
 assert.equal((await route.POST(request('verify/request',{}))).status,410);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_phone_challenges').get().n,0);
});
test('WhatsApp ownership requires a private expiring OTP, enforces cooldown and marks only the authenticated account verified',async t=>{
 fixture();otpConfiguration();const codes=mockWhatsApp(t),a=await registered(),b=await registered({phone:'19888888888'});
 const sent=await auth.requestCustomerVerification(request('verify/request',{},a.cookie),{});assert.equal(sent.status,'submitted');assert.equal(codes.length,1);assert.equal('code' in sent,false);
 const stored=sqlite.prepare('SELECT * FROM customer_phone_challenges').get();assert.equal(stored.code_hash.length,64);assert.notEqual(stored.code_hash,codes[0]);
 await assert.rejects(()=>auth.requestCustomerVerification(request('verify/request',{},a.cookie),{}),status(429));
 await assert.rejects(()=>auth.confirmCustomerVerification(request('verify/confirm',{},b.cookie),{code:codes[0]}),status(400));
 const wrong=codes[0]==='000000'?'111111':'000000';await assert.rejects(()=>auth.confirmCustomerVerification(request('verify/confirm',{},a.cookie),{code:wrong}),status(400));
 const confirmed=await auth.confirmCustomerVerification(request('verify/confirm',{},a.cookie),{code:codes[0]});assert.equal(confirmed.customer.phone_verified,true);assert.equal(sqlite.prepare('SELECT phone_verified FROM customers WHERE id=?').get(b.result.customer.id).phone_verified,0);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_phone_challenges').get().n,0);
});
test('expired codes and five failed code attempts cannot verify a phone',async t=>{
 fixture();otpConfiguration();const codes=mockWhatsApp(t),a=await registered();await auth.requestCustomerVerification(request('verify/request',{},a.cookie),{});
 sqlite.prepare('UPDATE customer_phone_challenges SET expires_ms=?,requested_ms=?').run(Date.now()-1,Date.now()-61_000);
 await assert.rejects(()=>auth.confirmCustomerVerification(request('verify/confirm',{},a.cookie),{code:codes[0]}),status(400));
 await auth.requestCustomerVerification(request('verify/request',{},a.cookie),{});const valid=codes.at(-1),wrong=valid==='000000'?'111111':'000000';
 for(let i=0;i<5;i++)await assert.rejects(()=>auth.confirmCustomerVerification(request('verify/confirm',{},a.cookie),{code:wrong}),status(400));
 await assert.rejects(()=>auth.confirmCustomerVerification(request('verify/confirm',{},a.cookie),{code:valid}),status(400));
 assert.equal(sqlite.prepare('SELECT phone_verified FROM customers').get().phone_verified,0);
});

test('password recovery proves phone ownership, does not enumerate accounts and revokes every old session',async t=>{
 fixture();otpConfiguration();const codes=mockWhatsApp(t),a=await registered();const oldLogin=await auth.loginCustomer(request('login',{}),sample);
 const missing=await auth.requestCustomerPasswordReset(request('password/request',{}),{phone:'19888888888'});
 const found=await auth.requestCustomerPasswordReset(request('password/request',{}),{phone:sample.phone});assert.deepEqual(found,missing);assert.equal(codes.length,1);
 const wrong=codes[0]==='000000'?'111111':'000000';await assert.rejects(()=>auth.resetCustomerPassword(request('password/reset',{}),{phone:sample.phone,code:wrong,password:'Uma nova senha segura!'}),status(400));
 const changed=await auth.resetCustomerPassword(request('password/reset',{}),{phone:sample.phone,code:codes[0],password:'Uma nova senha segura!'});assert.equal(changed.customer.phone_verified,true);
 assert.equal(await auth.customerIdentity(request('me',undefined,a.cookie)),null);assert.equal(await auth.customerIdentity(request('me',undefined,sessionCookie(oldLogin))),null);
 assert.ok(await auth.customerIdentity(request('me',undefined,sessionCookie(changed))));
 await assert.rejects(()=>auth.loginCustomer(request('login',{}),sample),status(401));assert.ok((await auth.loginCustomer(request('login',{}),{...sample,password:'Uma nova senha segura!'})).customer.id);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_password_resets').get().n,0);
 await assert.rejects(()=>auth.resetCustomerPassword(request('password/reset',{}),{phone:sample.phone,code:codes[0],password:'Outra senha muito segura!'}),status(400));
});

test('a login verified with an old password cannot create a session after concurrent recovery',async t=>{
 fixture();otpConfiguration();const codes=mockWhatsApp(t),a=await registered();
 await auth.requestCustomerPasswordReset(request('password/request',{}),{phone:sample.phone});
 let recovered;
 // Interleave immediately after the old credential was verified, before its
 // pending session INSERT reaches the database.
 beforeSessionInsert=async()=>{recovered=await auth.resetCustomerPassword(request('password/reset',{}),{phone:sample.phone,code:codes.at(-1),password:'Uma senha nova e segura!'});};
 await assert.rejects(()=>auth.loginCustomer(request('login',{}),sample),status(401));
 assert.ok(recovered);
 assert.equal(await auth.customerIdentity(request('me',undefined,a.cookie)),null);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customer_sessions').get().n,1);
 assert.ok(await auth.customerIdentity(request('me',undefined,sessionCookie(recovered))));
 assert.ok((await auth.loginCustomer(request('login',{}),{...sample,password:'Uma senha nova e segura!'})).customer.id);
});

test('reclaiming an unverified phone clears third-party opt-ins while verified owners retain their choices',async t=>{
 fixture();otpConfiguration();const codes=mockWhatsApp(t);
 const original=await registered({operational_whatsapp:true,marketing_whatsapp:true});
 await auth.requestCustomerPasswordReset(request('password/request',{}),{phone:sample.phone});
 const reclaimed=await auth.resetCustomerPassword(request('password/reset',{}),{phone:sample.phone,code:codes.at(-1),password:'Uma senha recuperada segura!'});
 assert.equal(reclaimed.customer.phone_verified,true);
 assert.equal(reclaimed.customer.operational_whatsapp,false);
 assert.equal(reclaimed.customer.marketing_whatsapp,false);
 assert.notEqual(reclaimed.customer.id,original.result.customer.id);
 const row=sqlite.prepare('SELECT service_consent,marketing_consent,service_consent_ms,marketing_consent_ms FROM customers WHERE id=?').get(reclaimed.customer.id);
 assert.equal(row.service_consent,0);assert.equal(row.marketing_consent,0);
 assert.equal(row.service_consent_ms,null);assert.equal(row.marketing_consent_ms,null);
 await auth.customerPreferences(request('preferences',{},sessionCookie(reclaimed)),{operational_whatsapp:true,marketing_whatsapp:true});
 await auth.requestCustomerPasswordReset(request('password/request',{}),{phone:sample.phone});
 const verified=await auth.resetCustomerPassword(request('password/reset',{}),{phone:sample.phone,code:codes.at(-1),password:'Outra senha recuperada segura!'});
 assert.equal(verified.customer.id,reclaimed.customer.id);
 assert.equal(verified.customer.operational_whatsapp,true);assert.equal(verified.customer.marketing_whatsapp,true);
});

test('recovering a never-verified number creates a fresh identity without inheriting prior personal data or private contracts',async t=>{
 fixture();otpConfiguration();const codes=mockWhatsApp(t),original=await registered({operational_whatsapp:true,marketing_whatsapp:true});
 environment.CUSTOMER_DATA_KEY='34'.repeat(32);
 const objects=new Map();let bucketReads=0;
 environment.BUCKET={async put(key,value){objects.set(key,new Uint8Array(value));},async get(key){bucketReads++;const value=objects.get(key);return value?{size:value.length,async text(){return new TextDecoder().decode(value);}}:null;},async delete(key){objects.delete(key);}};
 const personal={name:'Cliente Primeiro Cadastro',cpf:'52998224725',phone:'19999999999',email:'primeiro@example.com',birth:'2000-01-01',cep:'13720146',street:'Rua do Primeiro Cadastro',number:'100',district:'Centro',city:'Cidade Teste',state:'SP'};
 const reservationId=insertReservation(original.result.customer.id,'CG-UNVERIFIED-PRIVATE');
 sqlite.prepare("UPDATE reservations SET terms_snapshot='{}' WHERE id=?").run(reservationId);
 await storage.saveCustomerProfile(original.result.customer.id,personal);
 await storage.saveReservationCustomer(reservationId,personal);
 const document=await storage.savePrivateReservationDocument({reservation:{id:reservationId},fontBytes:readFileSync('public/fonts/DejaVuSans.ttf')});
 assert.equal((await storage.documentResponseForCustomer(document.id,original.result.customer.id)).status,200);assert.equal((await route.GET(request('documents/'+document.id,undefined,original.cookie))).status,410);
 bucketReads=0;
 await auth.requestCustomerPasswordReset(request('password/request',{}),{phone:sample.phone});
 const restored=await auth.resetCustomerPassword(request('password/reset',{}),{phone:sample.phone,code:codes.at(-1),password:'Outra pessoa novo acesso seguro!'});
 assert.notEqual(restored.customer.id,original.result.customer.id);
 assert.equal(restored.history_review_required,true);
 assert.match(restored.message,/conferidos pela loja/);
 const cookie=sessionCookie(restored);
 assert.equal(await auth.customerIdentity(request('me',undefined,original.cookie)),null);
 assert.equal(await storage.readCustomerProfile(restored.customer.id),null);const profileResponse=await route.GET(request('profile',undefined,cookie));assert.equal(profileResponse.status,410);assert.equal('profile' in await profileResponse.json(),false);
 const reservations=await auth.customerReservations(request('reservations',undefined,cookie));assert.deepEqual(reservations.reservations,[]);const retiredListing=await route.GET(request('reservations',undefined,cookie));assert.equal(retiredListing.status,410);assert.equal('reservations' in await retiredListing.json(),false);
 assert.equal((await route.GET(request('documents?reservation_id='+reservationId,undefined,cookie))).status,410);await assert.rejects(()=>storage.listPrivateDocumentsForCustomer(reservationId,restored.customer.id),status(404));
 assert.equal((await route.GET(request('documents/'+document.id,undefined,cookie))).status,410);await assert.rejects(()=>storage.documentResponseForCustomer(document.id,restored.customer.id),status(404));
 assert.equal(bucketReads,0);
 const retired=sqlite.prepare('SELECT phone,disabled,service_consent,marketing_consent FROM customers WHERE id=?').get(original.result.customer.id);
 assert.equal(retired.disabled,1);assert.match(retired.phone,/^reclaimed:/);assert.equal(retired.service_consent,0);assert.equal(retired.marketing_consent,0);
 assert.equal(sqlite.prepare('SELECT customer_id FROM reservations WHERE id=?').get(reservationId).customer_id,original.result.customer.id);
 assert.equal((await storage.readReservationCustomer(reservationId)).name,personal.name);
 assert.ok(sqlite.prepare('SELECT id FROM reservation_private_documents WHERE id=?').get(document.id));
 // Once ownership is verified, normal recovery retains that owner's identity
 // and private profile instead of creating yet another account.
 const own={...personal,name:'Cliente Dono Confirmado',email:'confirmado@example.com'};
 await storage.saveCustomerProfile(restored.customer.id,own);
 await auth.requestCustomerPasswordReset(request('password/request',{}),{phone:sample.phone});
 const verified=await auth.resetCustomerPassword(request('password/reset',{}),{phone:sample.phone,code:codes.at(-1),password:'Nova senha do dono confirmado!'});
 assert.equal(verified.customer.id,restored.customer.id);
 assert.equal(verified.history_review_required,false);
 const preserved=await storage.readCustomerProfile(verified.customer.id);assert.equal(preserved.name,own.name);assert.equal((await route.GET(request('profile',undefined,sessionCookie(verified)))).status,410);
});

test('unverified recovery rolls back retirement atomically when the fresh identity cannot be created',async t=>{
 fixture();otpConfiguration();const codes=mockWhatsApp(t),original=await registered();
 await auth.requestCustomerPasswordReset(request('password/request',{}),{phone:sample.phone});
 sqlite.exec("CREATE TRIGGER reject_recovered_identity BEFORE INSERT ON customers WHEN NEW.phone_verified=1 BEGIN SELECT RAISE(ABORT,'TEST_NEW_CUSTOMER_FAILURE'); END;");
 await assert.rejects(()=>auth.resetCustomerPassword(request('password/reset',{}),{phone:sample.phone,code:codes.at(-1),password:'Outra senha segura para teste!'}),/TEST_NEW_CUSTOMER_FAILURE/);
 const row=sqlite.prepare('SELECT phone,disabled FROM customers WHERE id=?').get(original.result.customer.id);
 assert.equal(row.phone,'5519999999999');assert.equal(row.disabled,0);
 assert.ok(await auth.customerIdentity(request('me',undefined,original.cookie)));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM customers').get().n,1);
 assert.equal(sqlite.prepare('SELECT status FROM customer_password_resets').get().status,'active');
});

test('all retired customer endpoints refuse reads and writes without modifying historical customer records',async()=>{
 fixture();const archived=await registered();insertReservation(archived.result.customer.id,'CG-ARCHIVED');
 const state=()=>JSON.stringify({customers:sqlite.prepare('SELECT * FROM customers').all(),sessions:sqlite.prepare('SELECT * FROM customer_sessions').all(),reservations:sqlite.prepare('SELECT * FROM reservations').all()});const before=state();
 for(const path of ['register','login','logout','me','profile','reservations','preferences','verify/request','verify/confirm','password/request','password/reset','offers','documents','documents/fake'])for(const method of ['GET','POST']){
  const response=await route[method](request(path,method==='POST'?sample:undefined,archived.cookie));assert.equal(response.status,410,path+' '+method);const body=JSON.stringify(await response.json());for(const privateValue of [sample.phone,sample.password,archived.result.customer.id,'CG-ARCHIVED'])assert.equal(body.includes(privateValue),false);assert.match(response.headers.get('Cache-Control'),/no-store/);assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/);
 }
 assert.equal(state(),before);
});
