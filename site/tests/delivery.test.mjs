import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
async function compile(path){const bundled=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false});const compiled={exports:{}};new Function('module','exports','require',bundled.outputFiles[0].text)(compiled,compiled.exports,require);return compiled.exports;}
const email=await compile('lib/reservation-delivery.ts'),external=await compile('lib/customer-delivery.ts');
const environment={RESEND_API_KEY:'fake-test-key',RESERVATION_EMAIL_FROM:'CaloriMob <reservas@example.com>',CUSTOMER_API_URL:'https://customer.example.com/api',CUSTOMER_API_TOKEN:'test-secret',CUSTOMER_SYSTEM_NAME:'Sistema de testes'};
const gmailEnvironment={RESERVATION_EMAIL_PROVIDER:'gmail',RESERVATION_EMAIL_FROM:'calori.mobi2@gmail.com',GMAIL_CLIENT_ID:'oauth-client-test',GMAIL_CLIENT_SECRET:'oauth-secret-test',GMAIL_REFRESH_TOKEN:'oauth-refresh-test'};
const customer={name:'Cliente Teste',cpf:'52998224725',phone:'19999999999',email:'cliente@example.com',birth:'1990-01-01',cep:'13720146',street:'Rua Teste',number:'12',district:'Centro',city:'Cidade Teste',state:'sp'};
const reservation={code:'CG-EMAIL-TEST',model_name:'T1',color_name:'Branca',unit_label:'T1 · 002',start_ms:Date.parse('2030-10-15T09:00:00-03:00'),end_ms:Date.parse('2030-10-17T09:00:00-03:00'),days:2,daily_cents:3000,protection_daily_cents:1500,total_cents:9000,payment_status:'pending',status:'reserved',terms_version:'rental-v1',terms_snapshot:JSON.stringify({address:'Endereço do teste'})};
const input={environment,reservation,customer,fontBytes:readFileSync('public/fonts/DejaVuSans.ttf'),kind:'reservation',idempotencyKey:'reservation-CG-EMAIL-TEST'};
test('transactional contact validation requires real identification and email without headers; adults discard guardian data',()=>{
 const normalized=external.validateDeliveryCustomer({...customer,guardian:'Outro Nome',guardianCPF:'12345678909',guardianPhone:'19999999999'});
 assert.equal(normalized.state,'SP');assert.equal(normalized.guardian,undefined);assert.equal(normalized.phone,'5519999999999');
 for(const invalid of [{email:''},{email:'a@example.com\r\nBcc:other@example.com'},{cpf:'123'},{birth:'bad'},{cep:'123'},{name:'Nome'},{street:'Rua\nSenha'}]) assert.throws(()=>external.validateDeliveryCustomer({...customer,...invalid}));
 assert.equal(email.reservationEmailConfigured({...environment,RESERVATION_EMAIL_FROM:'CaloriMob <reservas@example.com>\r\nBcc:invasor@example.com'}),false);
});
test('missing delivery secrets never claim a send or call external services',async()=>{
 const noRequest=()=>{throw new Error('network must not be called');};
 assert.deepEqual(await email.sendReservationEmail({...input,environment:{}},noRequest),{status:'not_configured',reason:'email_not_configured'});
 assert.deepEqual(await external.saveExternalCustomer({environment:{},reservationId:'reservation-1',customer},noRequest),{status:'not_configured',reason:'customer_system_not_configured'});
 assert.equal(external.externalCustomerConfigured({...environment,CUSTOMER_API_URL:'http://customer.example.com/api'}),false);
 assert.equal(external.externalCustomerConfigured({...environment,CUSTOMER_API_URL:'https://localhost/api'}),false);
});
test('initial email attaches server-generated PDF with a stable provider idempotency key and awaits release',async()=>{
 let payload;
 const result=await email.sendReservationEmail(input,async(url,init)=>{
  assert.equal(url,'https://api.resend.com/emails');assert.equal(init.redirect,'manual');assert.equal(init.headers['Idempotency-Key'],input.idempotencyKey);
  payload=JSON.parse(init.body);assert.deepEqual(payload.to,[customer.email]);assert.match(payload.text,/Aguarde a confirmação/);assert.match(payload.text,/Pagamento pendente/);assert.match(payload.text,/90,00/);
  assert.equal(Buffer.from(payload.attachments[0].content,'base64').subarray(0,5).toString(),'%PDF-');
  return Response.json({id:'test-provider-id'});
 });
 assert.deepEqual(result,{status:'submitted',provider_id:'test-provider-id'});assert.match(payload.subject,/CG-EMAIL-TEST/);
 assert.equal(JSON.stringify(result).includes(customer.email),false);
});
test('pickup emails require operator release and use the confirmed pickup hour',async()=>{
 const never=()=>{throw new Error('not called');};
 assert.deepEqual(await email.sendReservationEmail({...input,kind:'pickup_confirmation'},never),{status:'failed',reason:'pickup_not_released'});
 const pickup=Date.parse('2030-10-15T10:00:00-03:00');
 const result=await email.sendReservationEmail({...input,kind:'pickup_confirmation',reservation:{...reservation,status:'ready',pickup_ms:pickup,ready_ms:Date.parse('2030-10-15T08:00:00-03:00')}},async(url,init)=>{
  const payload=JSON.parse(init.body);assert.match(payload.subject,/Sua moto está pronta/);assert.match(payload.text,/10:00/);assert.doesNotMatch(payload.text,/Retirada prevista/);assert.match(payload.attachments[0].filename,/Confirmacao-Retirada/);
  return Response.json({id:'test-ready-id'});
 });
 assert.equal(result.status,'submitted');
});
test('external adapter exchanges PII only with its configured HTTPS system and stores an opaque reference',async()=>{
 const stored=await external.saveExternalCustomer({environment,reservationId:'reservation-1',customer},async(url,init)=>{
  assert.equal(url,'https://customer.example.com/api/customer-reservations');assert.equal(init.headers.Authorization,'Bearer test-secret');assert.equal(init.headers['Idempotency-Key'],'reservation-reservation-1');assert.equal(init.redirect,'manual');
  const payload=JSON.parse(init.body);assert.equal(payload.reservation_id,'reservation-1');assert.equal(payload.customer.email,customer.email);
  return Response.json({reference:'cust_opaque_1'});
 });
 assert.deepEqual(stored,{status:'linked',system:'Sistema de testes',reference:'cust_opaque_1'});
 const loaded=await external.readExternalCustomer({environment,reference:stored.reference,system:stored.system},async(url,init)=>{
  assert.equal(url,'https://customer.example.com/api/customer-reservations/cust_opaque_1');assert.equal(init.cache,'no-store');return Response.json({customer});
 });
 assert.equal(loaded.status,'loaded');assert.equal(loaded.customer.email,customer.email);
 assert.equal((await external.readExternalCustomer({environment,reference:stored.reference,system:'different'},()=>{throw new Error('no network');})).reason,'customer_reference_invalid');
 for(const reference of [customer.cpf,customer.phone,customer.email,'../cust_1']) assert.equal(external.validExternalReference(reference),false);
});
test('provider and external-system failures expose fixed codes, never raw errors or personal data',async()=>{
 const failed=await email.sendReservationEmail(input,async()=>new Response(JSON.stringify({error:customer}),{status:400}));
 assert.deepEqual(failed,{status:'failed',reason:'email_provider_rejected'});
 const oversized=await email.sendReservationEmail(input,async()=>new Response('x'.repeat(33_000),{status:200}));
 assert.equal(oversized.reason,'email_delivery_uncertain');
 const externalFailed=await external.saveExternalCustomer({environment,reservationId:'reservation-1',customer},async()=>{throw new Error(JSON.stringify(customer));});
 assert.deepEqual(externalFailed,{status:'failed',reason:'customer_system_unavailable'});
 assert.equal(JSON.stringify([failed,oversized,externalFailed]).includes(customer.email),false);
 const invalidRef=await external.saveExternalCustomer({environment,reservationId:'reservation-1',customer},async()=>Response.json({reference:customer.cpf}));
 assert.equal(invalidRef.reason,'customer_system_rejected');
});
test('Gmail OAuth sends Unicode subject and a real PDF as a MIME attachment without contacting Resend',async()=>{
 const messages=[];
 const fakeGmail=async(url,init)=>{
  assert.equal(init.redirect,'manual');
  if(url==='https://oauth2.googleapis.com/token'){
   const form=new URLSearchParams(init.body);assert.equal(form.get('grant_type'),'refresh_token');assert.equal(form.get('client_id'),'oauth-client-test');assert.equal(form.get('refresh_token'),'oauth-refresh-test');
   return Response.json({access_token:'test-short-lived-token'});
  }
  assert.equal(url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.equal(init.headers.Authorization,'Bearer test-short-lived-token');
  const {raw}=JSON.parse(init.body);assert.match(raw,/^[-A-Za-z0-9_]+$/);
  const mime=Buffer.from(raw,'base64url').toString('utf8');messages.push(mime);
  assert.match(mime,/From: <calori\.mobi2@gmail\.com>/);assert.match(mime,/To: <cliente@example\.com>/);
  const subject=mime.match(/Subject: =\?UTF-8\?B\?([^?]+)\?=/)[1];assert.match(Buffer.from(subject,'base64').toString('utf8'),/Documento da reserva.*CaloriMob/);
  const text=mime.match(/Content-Type: text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n\r\n--calori_/)[1];assert.match(Buffer.from(text,'base64').toString('utf8'),/confirmação/);
  const attachment=mime.match(/Content-Disposition: attachment; filename="[^"]+"\r\n\r\n([\s\S]*?)\r\n\r\n--calori_/)[1];assert.equal(Buffer.from(attachment,'base64').subarray(0,5).toString(),'%PDF-');
  return Response.json({id:'gmail-test-message'});
 };
 assert.equal(email.emailDeliveryProvider(gmailEnvironment),'gmail');assert.equal(email.reservationEmailConfigured(gmailEnvironment),true);
 assert.deepEqual(await email.sendReservationEmail({...input,environment:gmailEnvironment},fakeGmail),{status:'submitted',provider_id:'gmail-test-message'});
 await email.sendReservationEmail({...input,environment:gmailEnvironment},fakeGmail);
 assert.equal(messages[0].match(/Message-ID: ([^\r]+)/)[1],messages[1].match(/Message-ID: ([^\r]+)/)[1]);
 assert.equal(email.reservationEmailConfigured({RESERVATION_EMAIL_FROM:'calori.mobi2@gmail.com',RESEND_API_KEY:'cannot-send-personal-gmail'}),false);
});
test('ambiguous Gmail attempts are marked uncertain so orchestration can prevent duplicate sends',async()=>{
 for(const response of [()=>{throw new Error('network after send');},()=>new Response('temporary error',{status:503}),()=>Response.json({unrecognized:'payload'})]){
  let sendCalls=0;
  const result=await email.sendReservationEmail({...input,environment:gmailEnvironment},async(url)=>{
   if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'short-lived-test'});
   sendCalls++;return response();
  });
  assert.deepEqual(result,{status:'failed',reason:'email_delivery_uncertain'});assert.equal(sendCalls,1);
 }
 let sendCalls=0;
 const rejected=await email.sendReservationEmail({...input,environment:gmailEnvironment},async(url)=>{
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'short-lived-test'});
  sendCalls++;return new Response('invalid request',{status:400});
 });
 assert.deepEqual(rejected,{status:'failed',reason:'email_provider_rejected'});assert.equal(sendCalls,1);
 const oauthRejected=await email.sendReservationEmail({...input,environment:gmailEnvironment},async(url)=>{assert.equal(url,'https://oauth2.googleapis.com/token');return new Response('oauth denied',{status:400});});
 assert.deepEqual(oauthRejected,{status:'failed',reason:'email_oauth_rejected'});
});

test('both email providers attach the saved care guide beside the reservation PDF',async()=>{
 const {defaultCareGuide}=await compile('lib/care-guide.ts');
 const saved={...reservation,terms_snapshot:JSON.stringify({address:'Endereço do teste',care_guide:defaultCareGuide})};
 const result=await email.sendReservationEmail({...input,reservation:saved},async(url,init)=>{
  assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(init.body);assert.equal(body.attachments.length,2);
  assert.equal(body.attachments[1].filename,'Guia-Cuidados-T1-CaloriMob.pdf');
  for(const attachment of body.attachments)assert.equal(Buffer.from(attachment.content,'base64').subarray(0,5).toString(),'%PDF-');
  assert.match(body.text,/guia de cuidados/);return Response.json({id:'two-documents-resend'});
 });assert.equal(result.status,'submitted');
 const gmail=await email.sendReservationEmail({...input,reservation:saved,environment:gmailEnvironment},async(url,init)=>{
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fake-access'});
  const mime=Buffer.from(JSON.parse(init.body).raw,'base64url').toString('utf8');assert.equal((mime.match(/Content-Disposition: attachment;/g)||[]).length,2);assert.match(mime,/Guia-Cuidados-T1-CaloriMob.pdf/);
  const files=[...mime.matchAll(/Content-Disposition: attachment; filename="[^"]+"\r\n\r\n([\s\S]*?)\r\n\r\n--calori_/g)];assert.equal(files.length,2);
  for(const file of files)assert.equal(Buffer.from(file[1],'base64').subarray(0,5).toString(),'%PDF-');return Response.json({id:'two-documents-gmail'});
 });assert.equal(gmail.status,'submitted');
});
test('email validation preserves the responsible adult accepted when the reservation was created',async()=>{
 const child={...customer,birth:'2008-10-31',guardian:'Responsável Fictício',guardianCPF:'11144477735',guardianPhone:'19999999999',accompanied:'on'};
 const historical=external.validateDeliveryCustomer(child,Date.parse('2025-11-01T12:00:00-03:00'));assert.equal(historical.guardian,'Responsável Fictício');
 const result=await email.sendReservationEmail({...input,customer:child,reservation:{...reservation,created_ms:Date.parse('2025-11-01T12:00:00-03:00')}},async()=>Response.json({id:'historical-responsible'}));assert.equal(result.status,'submitted');
});
