import {PDFDocument,rgb,type PDFFont} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {reservationLabels,type ReservationState} from './reservation-workflow';
import {defaultDocumentPolicy,documentSections,parseDocumentPolicy} from './document-policy';
import {parseCareGuide} from './care-guide';
export interface PdfReservation {
 code:string;model_name:string;color_name?:string;unit_label?:string;start_ms:number;end_ms:number;
 days:number;daily_cents:number;protection_daily_cents:number;total_cents:number;payment_status:string;status:string;terms_version?:string;terms_snapshot?:string;
 created_ms?:number;pickup_ms?:number|null;ready_ms?:number|null;
 actual_start_ms?:number|null;actual_end_ms?:number|null;due_ms?:number|null;
 late_fee_cents?:number|null;late_fee_status?:string;
}
export type ReservationDocumentKind='reservation'|'pickup_confirmation';
export interface PdfInput {reservation:PdfReservation;customer?:Record<string,string>;fontBytes:Uint8Array;kind?:ReservationDocumentKind}
const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
const date=(n:number)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(n);
export async function createReservationPdf({reservation:r,customer={},fontBytes,kind='reservation'}:PdfInput){
 const pickupConfirmation=kind==='pickup_confirmation';
 const inUse=r.status==='rented',closed=r.status==='returned'||r.status==='cancelled';
 if(pickupConfirmation&&(r.status!=='ready'||!Number.isFinite(r.ready_ms)||!Number.isFinite(r.pickup_ms)||!r.ready_ms||!r.pickup_ms))throw new Error('A moto ainda não foi liberada para retirada.');
 let saved:Record<string,unknown>={};try{saved=JSON.parse(r.terms_snapshot||'{}');}catch{/* Missing historical snapshots stay explicitly unreviewed. */}
 const policy=saved.document?parseDocumentPolicy(saved.document):{
  ...defaultDocumentPolicy,version:'historico-sem-clausulas',approved:false,
  company:{name:'Calori Go',registration:'',address:String(saved.address||''),contact:''},
  clauses:Object.fromEntries(documentSections.map(([key])=>[key,'As condições desta reserva não constam no registro histórico. Consulte a empresa para recuperar a versão aceita; condições novas não foram aplicadas a esta reserva.'])) as typeof defaultDocumentPolicy.clauses,
 };
 const dailyTotal=r.daily_cents+r.protection_daily_cents;
 const delayDaily=Number.isSafeInteger(saved.delay_daily_cents)&&Number(saved.delay_daily_cents)>=0?Number(saved.delay_daily_cents):dailyTotal;
 const title=pickupConfirmation?'CONFIRMAÇÃO DE RETIRADA':'COMPROVANTE DE RESERVA';
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(fontBytes,{subset:true});
 pdf.setTitle(`${pickupConfirmation?'Retirada':'Reserva'} ${r.code} — Calori Go`);pdf.setAuthor(policy.company.name||'Calori Go');pdf.setSubject(pickupConfirmation?'Moto pronta; horário confirmado para retirada; pagamento presencial':'Comprovante da reserva; aguarde liberação para retirada; pagamento presencial');
 const W=595.28,H=841.89,margin=44,lineHeight=15,body=10;
 let page=pdf.addPage([W,H]),y=H-85;
 const clean=(text:string)=>text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
 const addPage=()=>{page=pdf.addPage([W,H]);y=H-85;};
 const fit=(text:string,size:number,f:PDFFont=font)=>f.widthOfTextAtSize(text,size)<=W-2*margin;
 const write=(value:string,size=body,color=rgb(.12,.17,.14))=>{
  for(const paragraph of clean(value).split('\n')){
   let line='';
   for(const word of paragraph.split(/\s+/)){
    if(!word)continue;
    if(!fit(word,size)){
     if(line){if(y<65)addPage();page.drawText(line,{x:margin,y,font,size,color});y-=lineHeight;line='';}
     let chunk='';for(const char of word){if(!fit(chunk+char,size)&&chunk){if(y<65)addPage();page.drawText(chunk,{x:margin,y,font,size,color});y-=lineHeight;chunk='';}chunk+=char;}line=chunk;
    }else if(fit(line?line+' '+word:word,size)){line=line?line+' '+word:word;}
    else{if(y<65)addPage();page.drawText(line,{x:margin,y,font,size,color});y-=lineHeight;line=word;}
   }
   if(line){if(y<65)addPage();page.drawText(line,{x:margin,y,font,size,color});y-=lineHeight;}
   else y-=8;
  }
 };
 const section=(title:string,text:string)=>{if(y<115)addPage();y-=10;write(title.toUpperCase(),11,rgb(.08,.4,.21));y-=3;write(text);};
 write(title,18);y-=10;write(r.code,14);
 write(policy.approved?'Condições registradas e aprovadas pela empresa.':'RASCUNHO — cláusulas pendentes de revisão pela empresa.',11,rgb(.65,.24,.08));
 if(pickupConfirmation)section('Sua moto está pronta',`Retirada confirmada: ${date(r.pickup_ms!)}\nHorário de Brasília. A unidade foi liberada pela equipe.\nApresente o número ${r.code} e os documentos combinados com a loja.\nLiberação registrada em: ${date(r.ready_ms!)}.`);
 else if(inUse)section('Locação em andamento','A retirada já foi registrada pela equipe. Consulte o prazo de devolução efetivo e as condições preservadas neste documento.');
 else if(closed)section(r.status==='returned'?'Locação encerrada':'Reserva cancelada',r.status==='returned'?'A devolução já foi registrada pela equipe. Consulte os horários efetivos e eventuais pendências no atendimento.':'Esta reserva foi cancelada. Este documento preserva as informações do registro e não autoriza a retirada.');
 else section('Aguarde a confirmação de retirada','Sua reserva foi registrada. A moto ainda depende da preparação e da liberação da equipe. O horário confirmado será enviado no documento de confirmação de retirada; este comprovante não autoriza a retirada.');
 section('Empresa',`${policy.company.name}\nIdentificação cadastral: ${policy.company.registration||'Pendente de preenchimento'}\nEndereço da empresa: ${policy.company.address||'Pendente de preenchimento'}\nContato: ${policy.company.contact||'Pendente de preenchimento'}`);
 const personal=customer.name?`Nome: ${customer.name}\nCPF: ${customer.cpf||'Não informado'}\nNascimento: ${customer.birth||'Não informado'}\nWhatsApp: ${customer.phone||'Não informado'}\nE-mail: ${customer.email||'Não informado'}\nEndereço: ${[customer.street,customer.number,customer.complement,customer.district,customer.city,customer.state,customer.cep].filter(Boolean).join(' · ')||'Não informado'}`:'A identificação completa do cliente não está incluída nesta via operacional. Consulte o cadastro protegido e os documentos autorizados da empresa.';
 section('Cliente',personal);
 if(customer.guardian)section('Responsável',`Nome: ${customer.guardian}\nCPF: ${customer.guardianCPF||'Não informado'}\nWhatsApp: ${customer.guardianPhone||'Não informado'}\nPresença e assinatura serão conferidas na retirada.`);
 section('Moto e período',`Modelo: ${r.model_name}\nCor: ${r.color_name||'Conforme unidade'}\nUnidade: ${r.unit_label||'Conforme registro'}\n${pickupConfirmation?'Retirada confirmada: '+date(r.pickup_ms!):(inUse||closed?'Retirada inicialmente prevista: ':'Retirada prevista — aguarde confirmação: ')+date(r.start_ms)}\n${inUse||closed?'Devolução inicialmente prevista: ':'Devolução: '}${date(r.end_ms)}\nHorários de Brasília.\nLocal de retirada e devolução: ${String(saved.address||'Conforme combinado com a loja')}`);
 if(r.actual_start_ms&&Number.isFinite(r.actual_start_ms))section('Retirada efetiva e prazo',`Retirada efetiva registrada: ${date(r.actual_start_ms)}\nPrazo de devolução registrado: ${r.due_ms&&Number.isFinite(r.due_ms)?date(r.due_ms):'Consulte o atendimento'}${r.actual_end_ms&&Number.isFinite(r.actual_end_ms)?`\nDevolução efetiva registrada: ${date(r.actual_end_ms)}`:''}\nA contagem do período começa na retirada efetiva registrada pela equipe.`);
 section('Valores e pagamento',`${r.days} diária(s) × ${money(r.daily_cents)} de aluguel = ${money(r.days*r.daily_cents)}\nSeguro/proteção: ${r.protection_daily_cents?`${r.days} × ${money(r.protection_daily_cents)} = ${money(r.days*r.protection_daily_cents)}`:'Sem adicional'}\nDiária contratada: ${money(dailyTotal)}${r.protection_daily_cents?' (aluguel + seguro/proteção já incluído)':''}.\nTotal: ${money(r.total_cents)}\nPagamento exclusivamente no local. Situação financeira: ${r.payment_status==='paid'?'PAGO — anotação manual da equipe':inUse||closed?'PENDENTE — conferir com a loja':'PENDENTE — pagar na retirada'}.\nEste documento não é recibo nem comprovação bancária.\nSituação operacional no momento da emissão: ${reservationLabels[r.status as ReservationState]||'Conforme registro'}.${pickupConfirmation?' A moto foi liberada para o horário confirmado acima.':inUse?' A retirada efetiva já foi registrada.':closed?' Consulte o atendimento para eventuais pendências.':' Aguarde a liberação da equipe antes da retirada.'}`);
 section('Condições preservadas da reserva',`Versão do registro: ${r.terms_version||'Histórica'}\nVersão das cláusulas: ${policy.version}\n${String(saved.period||'Período conforme a reserva acima.')}\nProteção registrada: ${String(saved.coverage||'Consultar registro da loja.')}`);
 for(const [key,sectionTitle] of documentSections){
  const text=policy.clauses[key]||'Pendente de definição e revisão pela empresa.';
  let detail='';
  if(key==='delay'&&saved.document){
   if(saved.late_fee_policy){
    detail=`\nDiária de referência preservada: ${money(delayDaily)}, já com a composição contratada de aluguel e seguro.`+(String((saved.late_fee_policy as {calculation?:string}).calculation)==='proportional_24h'?` Referência horária: diária dividida por 24, sem arredondamento intermediário.`:` Metade dessa diária: ${money(Math.round(delayDaily/2))}.`);
    if(['calculated','not_due'].includes(r.late_fee_status||'')&&Number.isSafeInteger(r.late_fee_cents)&&Number(r.late_fee_cents)>=0)detail+=`\nValor de atraso registrado no atendimento: ${money(Number(r.late_fee_cents))}. Não constitui pagamento nem débito automático.`;
    else detail+='\nA apuração do atraso depende da regra preservada, dos horários efetivos e da conferência da equipe; pendências de regra não são apresentadas como cobrança final.';
   }else if(/1 diária adicional/iu.test(text))detail=`\nMulta por atraso: 1 diária contratada, no valor de ${money(delayDaily)}, conforme os valores preservados desta reserva.`;
  }
  section(sectionTitle,text+detail);
 }
 if(saved.care_guide){
  const guide=parseCareGuide(saved.care_guide);
  section('Guia de cuidados da reserva',`${guide.title}\nVersão preservada: ${guide.version}\nO guia reúne as orientações de peso, condução, inspeção, recarga, água, bateria e devolução correspondentes a esta reserva. Consulte a via do guia disponibilizada junto aos documentos. Ele não substitui o manual original do fabricante nem a conferência de elegibilidade da unidade.`);
 }
 section('Conferência e assinatura','Documento preenchido para conferência. A loja verificará documentação, elegibilidade e estado da unidade. Este comprovante não substitui contrato, vistoria ou apólice e não constitui assinatura eletrônica.\n\nLocal e data: ______________________________________\nCliente: __________________________________________\nResponsável, quando aplicável: _______________________\nEmpresa: _________________________________________');
 const pages=pdf.getPages();pages.forEach((p,i)=>{
  p.drawText(policy.approved?`CALORI GO — ${pickupConfirmation?'RETIRADA CONFIRMADA':'RESERVA'}`: 'RASCUNHO — NÃO É CONTRATO DEFINITIVO',{x:margin,y:H-40,font,size:9,color:rgb(.48,.25,.1)});
  p.drawText(`${r.code}  |  ${i+1}/${pages.length}`,{x:margin,y:32,font,size:9,color:rgb(.4,.4,.4)});
 });
 return pdf.save();
}
