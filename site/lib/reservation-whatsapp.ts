import type {DocumentPolicy} from './document-policy';
import {lateFeePolicyText,type LateFeePolicy} from './late-fees';
import {reservationMessage,type OperationalReservation} from './reservation-workflow';

export type ReservationWhatsAppKind='reservation'|'ready'|'preparing'|'return_reminder'|'pending';
export interface WhatsAppPart {title:string;text:string}
const clean=(value:unknown)=>String(value??'').replace(/[\x00-\x1f\x7f]/g,' ').replace(/\s+/g,' ').trim();
const excerpt=(value:unknown,maximum:number)=>{const text=clean(value);return text.length>maximum?text.slice(0,maximum-1).trimEnd()+'…':text;};
const money=(value:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
/** Meta body parameters must remain bounded, including surrogate pairs. */
export function whatsappParts(sections:WhatsAppPart[]):WhatsAppPart[]{
 const parts:WhatsAppPart[]=[];
 for(const section of sections){let chunk='';for(const point of clean(section.text)){if(chunk.length+point.length>900){parts.push({title:clean(section.title),text:chunk});chunk='';}chunk+=point;}if(chunk)parts.push({title:clean(section.title),text:chunk});}
 return parts;
}
/** Operational summary only; accepted full clauses remain immutable in D1. */
export function reservationWhatsAppParts(row:OperationalReservation,kind:ReservationWhatsAppKind,_historicalContact:Record<string,string>={}):WhatsAppPart[]{
 void _historicalContact; // Old identification is deliberately never copied into messages.
 let saved:{address?:string;vehicle_spec?:{power?:number;range?:number;capacity?:number;capacity_exclusive?:boolean;battery?:string;charge?:string};document?:DocumentPolicy;late_fee_policy?:LateFeePolicy;care_guide?:{sections:{title:string;text:string}[]}}={};try{saved=JSON.parse(row.terms_snapshot||'{}');}catch{/* Never invent historical conditions. */}
 if(kind==='preparing')return whatsappParts([{title:'Em preparação',text:`Sua reserva ${row.code}, modelo ${row.model_name}, está em preparação. Aguarde o aviso de que a moto está pronta antes de ir retirar.`}]);
 if(kind==='return_reminder')return whatsappParts([{title:'Lembrete de devolução',text:`Reserva ${row.code}, modelo ${row.model_name}. Devolução: ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(row.due_ms||row.end_ms)}. Devolva a moto, chave e carregador. Qualquer prorrogação exige autorização prévia da loja. As regras de atraso são as preservadas nesta reserva.`}]);
 if(kind==='ready')return whatsappParts([{title:'Pronta para retirada',text:reservationMessage(row,'ready',saved.address||'Confirme o endereço com a loja')}]);
 if(kind==='pending')return whatsappParts([{title:'Reserva com pendência',text:`Sua reserva ${row.code}, modelo ${row.model_name}, aguarda a conclusão de uma informação com a loja. Entre em contato com a CaloriMob para conferir o atendimento. Aguarde a confirmação de que a moto está pronta antes de ir retirar.`}]);
 const sections:WhatsAppPart[]=[{title:'RESUMO da reserva',text:reservationMessage({...row,due_ms:null},'confirmation',saved.address||'')+` Duração: ${row.days} diária(s) de 24 horas.`}];
 const protection=row.protection_daily_cents||0;
 sections.push({title:'Valores e condições — RESUMO',text:`Aluguel: ${row.days} × ${money(row.daily_cents)}. Proteção: ${row.days} × ${money(protection)}${protection?' já incluída no total informado':''}. Total: ${money(row.total_cents)}. ${saved.document?`Condições preservadas: ${saved.document.version}. ${saved.document.approved?'':'Rascunho para conferência; assinatura e condições definitivas na loja. '}Coberturas, exclusões e responsabilidades são as condições aceitas na reserva; este resumo não amplia a proteção.`:'Recupere com a loja a versão das condições desta reserva.'} Pagamento exclusivamente na loja; este resumo não comprova pagamento nem assinatura.`});
 const policy=saved.late_fee_policy;
 const delay=policy&&typeof policy.version==='string'&&Number.isFinite(policy.grace_minutes)?lateFeePolicyText(policy):saved.document?.clauses.delay;
 sections.push({title:'Atraso e prorrogação — RESUMO',text:excerpt(delay||'Consulte com a loja as condições de atraso preservadas nesta reserva.',710)+' Qualquer prorrogação exige autorização antes do prazo. Confira todas as condições aceitas no atendimento.'});
 const spec=saved.vehicle_spec;
 const technical=spec?`${row.model_name}. Motor: ${spec.power||'a confirmar'} W. Autonomia estimada: ${spec.range||'a confirmar'} km. Peso total: ${spec.capacity_exclusive?'abaixo de ':''}${spec.capacity||'a confirmar'} kg. Bateria: ${excerpt(spec.battery||'a confirmar',100)}. Recarga: ${excerpt(spec.charge||'a confirmar',100)}. `:'';
 sections.push({title:'Especificações e cuidados — RESUMO',text:technical+'Use somente o carregador autorizado. Evite água, alagamentos, sobrecarga e alterações nos componentes. Confira freios, pneus, bateria, chave e carregador. Avise a loja imediatamente em caso de falha, queda ou dano. Passageiro e condução dependem da conferência legal da unidade. Devolva todos os acessórios no prazo combinado.'});
 return whatsappParts(sections);
}
