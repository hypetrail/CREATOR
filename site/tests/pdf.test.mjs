import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {PDFDocument} from 'pdf-lib';
const require=createRequire(import.meta.url);
const bundled=await build({entryPoints:['lib/reservation-pdf.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const pdfModule={exports:{}};new Function('module','exports','require',bundled.outputFiles[0].text)(pdfModule,pdfModule.exports,require);
const {createReservationPdf}=pdfModule.exports;
const policyBundle=await build({entryPoints:['lib/document-policy.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const policyModule={exports:{}};new Function('module','exports','require',policyBundle.outputFiles[0].text)(policyModule,policyModule.exports,require);
const {defaultDocumentPolicy}=policyModule.exports;
const lateBundle=await build({entryPoints:['lib/late-fees.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const lateModule={exports:{}};new Function('module','exports','require',lateBundle.outputFiles[0].text)(lateModule,lateModule.exports,require);
const {defaultLateFeePolicy}=lateModule.exports;
const fontBytes=readFileSync('public/fonts/DejaVuSans.ttf');
const reservation={code:'CG-PDF-TEST',model_name:'T1',color_name:'Verde camela',unit_label:'T1 · 005',start_ms:Date.parse('2030-10-15T09:00:00-03:00'),end_ms:Date.parse('2030-10-17T09:00:00-03:00'),days:2,daily_cents:3000,protection_daily_cents:1500,total_cents:9000,payment_status:'pending',status:'reserved',terms_version:'rental-v1',terms_snapshot:JSON.stringify({address:'Endereço de teste',coverage:'Proteção registrada de teste'})};
function textOf(bytes){const dir=mkdtempSync(join(tmpdir(),'calori-pdf-test-'));try{writeFileSync(join(dir,'file.pdf'),bytes);return execFileSync('pdftotext',[join(dir,'file.pdf'),'-'],{encoding:'utf8'});}finally{rmSync(dir,{recursive:true,force:true});}}
test('real PDF contains reservation, personal data supplied only in memory and draft marks on every page',async()=>{
 const bytes=await createReservationPdf({reservation,customer:{name:'Cliente João Teste',cpf:'52998224725',guardian:'Responsável José Teste',guardianCPF:'11122233344',email:'cliente@example.com'},fontBytes});
 assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');
 const loaded=await PDFDocument.load(bytes);assert.ok(loaded.getPageCount()>1);
 const text=textOf(bytes);assert.match(text,/João/);assert.match(text,/Responsável José/);assert.match(text,/CG-PDF-TEST/);assert.match(text,/90,00/);assert.match(text,/PENDENTE/);assert.match(text,/Cancelamento e ausência/i);assert.match(text,/Reembolso/i);
 assert.equal((text.match(/RASCUNHO — NÃO É CONTRATO DEFINITIVO/g)||[]).length,loaded.getPageCount());
 assert.equal(reservation.terms_snapshot.includes('52998224725'),false);
});
test('approved saved clauses are used without replacing them with newer settings',async()=>{
 const clauses=Object.fromEntries(['usage','charging','handover','damage','delay','cancellation','refund','insurance'].map(key=>[key,'Texto aprovado de '+key]));
 const policy={version:'doc-historica',approved:true,created_ms:1,company:{name:'Empresa Histórica',registration:'Registro teste',address:'Endereço histórico',contact:'Contato histórico'},clauses};
 const bytes=await createReservationPdf({reservation:{...reservation,terms_snapshot:JSON.stringify({address:'Retirada histórica',document:policy})},fontBytes});
 const text=textOf(bytes);assert.match(text,/doc-historica/);assert.match(text,/Empresa Histórica/);assert.match(text,/Texto aprovado de refund/);assert.doesNotMatch(text,/RASCUNHO — NÃO É CONTRATO DEFINITIVO/);assert.match(text,/identificação completa do cliente não está incluída/);assert.doesNotMatch(text,/Multa por atraso:/);
});
test('new reservation PDF includes confirmed replacement late fee and protection of the rented motorcycle',async()=>{
 const saved={address:'Local reservado',document:defaultDocumentPolicy,delay_daily_cents:4500,late_fee_policy:defaultLateFeePolicy};
 const customer={name:'Cliente João Teste',cpf:'52998224725',birth:'2000-01-01',phone:'19999999999',email:'cliente@example.com',street:'Rua Exemplo',number:'100',complement:'Casa 2',district:'Centro',city:'Cidade Teste',state:'SP',cep:'13720-146'};
 const text=textOf(await createReservationPdf({reservation:{...reservation,terms_snapshot:JSON.stringify(saved)},customer,fontBytes}));
 for(const title of ['1. Uso do veículo','2. Conservação da moto','3. Manutenção e alterações','4. Carregamento','5. Danos e avarias','6. Acidente, furto ou roubo','7. Devolução','8. Atraso na devolução'])assert.ok(text.includes(title),title);
 for(const value of Object.values(customer))assert.ok(text.includes(value),value);
 const flat=text.replace(/\s+/g,' ');
 assert.match(flat,/Retirada prevista — aguarde confirmação:/);
 assert.match(flat,/30,00 de aluguel/);assert.match(flat,/Seguro\/proteção: 2 × R\$ 15,00/);
 assert.match(flat,/Diária contratada: R\$ 45,00/);assert.match(flat,/Referência horária: diária dividida por 24/);assert.match(flat,/Cada hora iniciada após a tolerância/);assert.doesNotMatch(flat,/Metade dessa diária/);assert.match(flat,/participação de outra pessoa ou veículo no acidente não exclui, por si só, a cobertura dos danos básicos da própria moto alugada/);assert.match(flat,/Não contempla quebra do chassi nem danos a terceiros/);assert.doesNotMatch(flat,/alcance da exclusão de colisões com terceiros.*ainda depende|nem danos causados por terceiros/);assert.doesNotMatch(flat,/Multa por atraso: 1 diária contratada/);
 assert.match(flat,/O desgaste natural decorrente do uso normal não será considerado dano causado pelo cliente/);
 assert.match(flat,/quando necessário, registrar Boletim de Ocorrência/);
 assert.match(flat,/autorizada pela CaloriMob antes do horário previsto de devolução/);
 assert.match(flat,/não utilizar lavadora de alta pressão/);
 assert.match(flat,/RASCUNHO/);assert.equal(defaultDocumentPolicy.approved,false);
});
test('pickup confirmation requires real release and uses confirmed pickup time without changing reserved end or clauses',async()=>{
 const pickup_ms=Date.parse('2030-10-15T11:30:00-03:00');
 const ready_ms=Date.parse('2030-10-15T08:30:00-03:00');
 const saved={address:'Local reservado',document:defaultDocumentPolicy,delay_daily_cents:4500,late_fee_policy:defaultLateFeePolicy};
 await assert.rejects(createReservationPdf({reservation,fontBytes,kind:'pickup_confirmation'}),/ainda não foi liberada/);
 await assert.rejects(createReservationPdf({reservation:{...reservation,status:'ready'},fontBytes,kind:'pickup_confirmation'}),/ainda não foi liberada/);
 const text=textOf(await createReservationPdf({reservation:{...reservation,status:'ready',pickup_ms,ready_ms,terms_snapshot:JSON.stringify(saved)},fontBytes,kind:'pickup_confirmation'})).replace(/\s+/g,' ');
 assert.match(text,/CONFIRMAÇÃO DE RETIRADA/);assert.match(text,/SUA MOTO ESTÁ PRONTA/);
 assert.match(text,/Retirada confirmada: 15\/10\/2030, 11:30/);assert.match(text,/Liberação registrada em: 15\/10\/2030, 08:30/);
 assert.match(text,/Devolução: 17\/10\/2030, 09:00/);assert.match(text,/8\. Atraso na devolução/);
 assert.doesNotMatch(text,/Retirada prevista — aguarde confirmação/);
});
test('historical reservation without clauses does not inherit the current rental terms',async()=>{
 const text=textOf(await createReservationPdf({reservation,fontBytes})).replace(/\s+/g,' ');
 assert.match(text,/historico-sem-clausulas/);assert.match(text,/condições novas não foram aplicadas/);
 assert.doesNotMatch(text,/É proibido emprestar, ceder ou sublocar/);assert.doesNotMatch(text,/Multa por atraso:/);
});
test('one-day exception keeps R$60 daily and R$30 half-day reference in the new late policy',async()=>{
 const oneDay={...reservation,days:1,end_ms:reservation.start_ms+86_400_000,daily_cents:4500,total_cents:6000,terms_snapshot:JSON.stringify({document:defaultDocumentPolicy,delay_daily_cents:6000,late_fee_policy:defaultLateFeePolicy})};
 const text=textOf(await createReservationPdf({reservation:oneDay,fontBytes})).replace(/\s+/g,' ');
 assert.match(text,/1 diária\(s\) × R\$ 45,00 de aluguel/);assert.match(text,/Diária contratada: R\$ 60,00/);
 assert.match(text,/Referência horária: diária dividida por 24/);assert.doesNotMatch(text,/Multa por atraso: 1 diária contratada/);
});

const careBundled=await build({entryPoints:['lib/care-pdf.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const careModule={exports:{}};new Function('module','exports','require',careBundled.outputFiles[0].text)(careModule,careModule.exports,require);
const carePolicyBundle=await build({entryPoints:['lib/care-guide.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const carePolicyModule={exports:{}};new Function('module','exports','require',carePolicyBundle.outputFiles[0].text)(carePolicyModule,carePolicyModule.exports,require);
const {defaultCareGuide}=carePolicyModule.exports;
test('care guide is a real readable PDF sourced to the supplied manual and owner rules',async()=>{
 const bytes=await careModule.exports.createCareGuidePdf(fontBytes);
 assert.equal(Buffer.from(bytes).subarray(0,5).toString(),'%PDF-');
 const pdf=await PDFDocument.load(bytes),text=textOf(bytes).replace(/\s+/g,' ');assert.ok(pdf.getPageCount()>=2);
 for(const word of ['GUIA DE CUIDADOS','abaixo de 120 kg','condutor, eventual passageiro e carga','6 a 7 horas','conecte primeiro o plugue à bateria','desconecte primeiro da rede elétrica','página 1','página 2','página 3',defaultCareGuide.version])assert.ok(text.includes(word),word);
 assert.match(text,/não substituem habilitação ou outros requisitos legais/);
 assert.match(text,/não confirma a lotação/);
 assert.match(text,/três horas de preparação entre locações não garantem uma carga completa/);
 assert.doesNotMatch(text,/consultado na internet|pesquisa online|não precisa de habilitação/i);
});
test('saved care guide version is referenced and can be regenerated without adopting a later guide',async()=>{
 const guide={...defaultCareGuide,version:'cuidados-versao-aceita',sections:[{title:'Regra preservada',text:'Orientação específica entregue nesta reserva.'}]};
 const saved={document:defaultDocumentPolicy,care_guide:guide,late_fee_policy:{version:'late-v2-pending'},delay_daily_cents:4500};
 const text=textOf(await createReservationPdf({reservation:{...reservation,terms_snapshot:JSON.stringify(saved)},fontBytes})).replace(/\s+/g,' ');
 assert.match(text,/Versão preservada: cuidados-versao-aceita/);
 const guideText=textOf(await careModule.exports.createCareGuidePdf(fontBytes,guide)).replace(/\s+/g,' ');
 assert.match(guideText,/Orientação específica entregue nesta reserva/);assert.doesNotMatch(guideText,/3. TRAJETO E CONDUÇÃO/);
});
test('historical one-daily late term remains intact and actual handover times are distinguishable from planned dates',async()=>{
 const oldPolicy={...defaultDocumentPolicy,version:'doc-antigo',clauses:{...defaultDocumentPolicy.clauses,delay:'8. Atraso na devolução: será cobrado o valor correspondente a 1 diária adicional.'}};
 const actualStart=Date.parse('2030-10-15T10:00:00-03:00'),due=actualStart+2*86400000;
 const text=textOf(await createReservationPdf({reservation:{...reservation,status:'returned',actual_start_ms:actualStart,due_ms:due,actual_end_ms:due+1000,terms_snapshot:JSON.stringify({document:oldPolicy,delay_daily_cents:4500})},fontBytes})).replace(/\s+/g,' ');
 assert.match(text,/doc-antigo/);assert.match(text,/Multa por atraso: 1 diária contratada, no valor de R\$ 45,00/);
 assert.match(text,/Retirada efetiva registrada: 15\/10\/2030, 10:00/);assert.match(text,/Prazo de devolução registrado: 17\/10\/2030, 10:00/);
 assert.match(text,/Devolução efetiva registrada:/);assert.match(text,/LOCAÇÃO ENCERRADA/);assert.doesNotMatch(text,/AGUARDE A CONFIRMAÇÃO DE RETIRADA|Aguarde a liberação da equipe antes da retirada/);
});
