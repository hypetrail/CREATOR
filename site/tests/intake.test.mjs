import {buildSync} from 'esbuild';
import {test} from 'node:test';
import assert from 'node:assert/strict';
buildSync({entryPoints:['lib/intake.ts'],bundle:true,platform:'node',format:'esm',outfile:'/tmp/calori-intake.mjs'});
const {ageAt,validCPF,prepareIntake,intakeEmail}=await import('/tmp/calori-intake.mjs');
test('CPF rejects repeated and incorrect check digits',()=>{assert.equal(validCPF('111.111.111-11'),false);assert.equal(validCPF('529.982.247-25'),true);assert.equal(validCPF('529.982.247-26'),false)});
test('age boundaries and impossible dates',()=>{assert.equal(ageAt('2008-10-17','2026-10-16'),17);assert.equal(ageAt('2008-10-16','2026-10-16'),18);assert.throws(()=>ageAt('2010-02-30','2026-10-16'));assert.throws(()=>ageAt('2027-01-01','2026-10-16'))});
const now=new Date(),start=new Date(+now+86400000).toISOString(),end=new Date(+now+3*86400000).toISOString();
const raw={name:'Cliente Teste',cpf:'52998224725',phone:'19999999999',birth:'2000-01-01',cep:'13720146',street:'Rua Teste',number:'1',district:'Centro',city:'Cidade',state:'SP',consent:'on',terms:'on',reminders:'on'};
test('message and term include data and correct two-day package total',()=>{const r=prepareIntake(raw,{name:'JE-7',brand:'Ecoviva',daily_cents:3500},start,end,'full');assert.match(r.message,/130,00/);assert.match(r.message,/CPF: 52998224725/);assert.match(r.term,/assinatura será presencial/);assert.match(r.message,/Autorizo receber/);assert.match(r.message,/2 diárias/)});
test('requires consent and responsible adult for minors',()=>{const model={daily_cents:3500};assert.throws(()=>prepareIntake({...raw,consent:''},model,start,end,'none'));const year=now.getUTCFullYear()-17;assert.throws(()=>prepareIntake({...raw,birth:year+'-01-01'},model,start,end,'none'),/responsável/);assert.throws(()=>prepareIntake({...raw,birth:now.getUTCFullYear()-15+'-01-01'},model,start,end,'none'),/menores/)});

test('rental documents require a valid email without changing the legacy WhatsApp form',()=>{
 const model={name:'JE-7',brand:'Ecoviva',daily_cents:3500};
 assert.throws(()=>prepareIntake(raw,model,start,end,'none',{requireEmail:true}),/e-mail válido/);
 for(const email of ['sem-arroba','cliente@dominio','nome <cliente@example.com>','cliente@example.com\r\nBcc: terceiro@example.com','dois clientes@example.com']){
  assert.throws(()=>prepareIntake({...raw,email},model,start,end,'none',{requireEmail:true}),/e-mail válido/);
 }
 const prepared=prepareIntake({...raw,email:'  cliente+reserva@example.com  '},model,start,end,'none',{requireEmail:true});
 assert.equal(prepared.customer.email,'cliente+reserva@example.com');
 assert.match(prepared.summary,/E-mail: cliente\+reserva@example\.com/);
 assert.match(prepared.summary,/Retirada prevista:/);
 assert.equal(Object.hasOwn(prepared.customer,'consent'),false);
 assert.equal(Object.hasOwn(prepared.customer,'terms'),false);
 assert.equal(Object.hasOwn(prepared.customer,'reminders'),false);
 assert.equal(intakeEmail(undefined),'');
 assert.doesNotThrow(()=>prepareIntake(raw,model,start,end,'none'));
});
test('adult customer payload clears guardian data left from an earlier birth date',()=>{
 const prepared=prepareIntake({...raw,email:'cliente@example.com',guardian:'Pessoa Anterior',guardianCPF:'11144477735',guardianPhone:'19999999999',accompanied:'on'}, {daily_cents:3500},start,end,'none',{requireEmail:true});
 assert.equal(prepared.customer.guardian,'');
 assert.equal(prepared.customer.guardianCPF,'');
 assert.equal(prepared.customer.guardianPhone,'');
 assert.equal(Object.hasOwn(prepared.customer,'accompanied'),false);
});
