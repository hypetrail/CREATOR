import {type DocumentPolicy,documentSections} from './document-policy';
import {reservationMessage,type OperationalReservation} from './reservation-workflow';

export type ReservationWhatsAppKind='reservation'|'ready'|'preparing'|'return_reminder';
export interface WhatsAppPart {title:string;text:string}
const clean=(value:unknown)=>String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
// Meta limits each body parameter. Split every clause without truncation.
export function whatsappParts(sections:WhatsAppPart[]):WhatsAppPart[]{
 const parts:WhatsAppPart[]=[];
 for(const section of sections){
  let chunk='';
  for(const point of clean(section.text)){
   if(chunk.length+point.length>900){parts.push({title:clean(section.title),text:chunk});chunk='';}
   chunk+=point;
  }
  if(chunk)parts.push({title:clean(section.title),text:chunk});
 }
 return parts;
}
export function reservationWhatsAppParts(row:OperationalReservation,kind:ReservationWhatsAppKind,customer:Record<string,string>={}):WhatsAppPart[]{
 let saved:{address?:string;vehicle_spec?:{power?:number;range?:number;capacity?:number;capacity_exclusive?:boolean;battery?:string;charge?:string};document?:DocumentPolicy;care_guide?:{sections:{title:string;text:string}[]}}={};try{saved=JSON.parse(row.terms_snapshot||'{}');}catch{/* Never invent historical conditions. */}
 if(kind==='preparing')return whatsappParts([{title:'Em preparação',text:`Sua reserva ${row.code}, modelo ${row.model_name}, está em preparação. Aguarde o aviso de que a moto está pronta antes de ir retirar.`}]);
 if(kind==='return_reminder')return whatsappParts([{title:'Lembrete de devolução',text:`Reserva ${row.code}, modelo ${row.model_name}. Devolução: ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(row.due_ms||row.end_ms)}. Devolva a moto, chave e carregador. Qualquer prorrogação exige autorização prévia da loja. As regras de atraso são as preservadas nesta reserva.`}]);
 if(kind==='ready')return whatsappParts([{title:'Pronta para retirada',text:reservationMessage(row,'ready',saved.address||'Confirme o endereço com a loja')}]);
 const sections:WhatsAppPart[]=[{title:'Reserva registrada',text:reservationMessage({...row,due_ms:null},'confirmation',saved.address||'')}];
 if(customer.name)sections.push({title:'Identificação do cliente',text:`Nome: ${customer.name}. WhatsApp: ${customer.phone}. CPF: ${customer.cpf||'a conferir'}. Endereço: ${customer.street||''}, ${customer.number||''}${customer.complement?' — '+customer.complement:''}. Bairro: ${customer.district||''}. Cidade: ${customer.city||''}/${customer.state||''}. CEP: ${customer.cep||''}.${customer.guardian?' Responsável: '+customer.guardian+'. CPF do responsável: '+customer.guardianCPF+'.':''}`});
 const spec=saved.vehicle_spec;
 if(spec)sections.push({title:'Especificações da moto',text:`${row.model_name}. Motor: ${spec.power||'a confirmar'} W. Autonomia estimada: ${spec.range||'a confirmar'} km. Peso total: ${spec.capacity_exclusive?'abaixo de ':''}${spec.capacity||'a confirmar'} kg. Bateria: ${spec.battery||'a confirmar'}. Recarga: ${spec.charge||'a confirmar'}. Passageiro e condução dependem da conferência legal da unidade.`});
 if(saved.document){
  sections.push({title:'Condições da reserva',text:`Versão: ${saved.document.version}. ${saved.document.approved?'Condições publicadas pela loja.':'Rascunho para conferência; condições definitivas e assinatura na loja.'} Retirada somente após liberação, identificação e vistoria. Pagamento presencial. Estas mensagens não comprovam pagamento nem assinatura.`});
  for(const [key,title]of documentSections)if(saved.document.clauses?.[key])sections.push({title,text:saved.document.clauses[key]});
 }else sections.push({title:'Condições históricas',text:'Consulte com a loja a versão das condições aceita nesta reserva.'});
 for(const section of saved.care_guide?.sections||[])sections.push({title:`Cuidados: ${section.title}`,text:section.text});
 return whatsappParts(sections);
}
