const DAY=86_400_000;
export interface LateFeePolicy {
 version:string;
 grace_minutes:number;
 half_daily_after_grace:boolean;
 overnight_mode:'pending'|'additive_calendar'|'replace_calendar';
 additional_daily_per_new_day:boolean;
 multi_day_review?:boolean;
 calculation?:'proportional_24h';
 grace_basis?:'elapsed'|'excess';
 rounding?:'started_hour';
}
// Confirmed by the owner: the next-day daily replaces, rather than adds to, the
// half daily. Repetition for further days was not approved and stays for review.
export const legacyLateFeePolicy:LateFeePolicy={version:'late-v2-confirmed-2026-10-29',grace_minutes:120,half_daily_after_grace:true,overnight_mode:'replace_calendar',additional_daily_per_new_day:false,multi_day_review:true};
export const defaultLateFeePolicy:LateFeePolicy={version:'late-v3-proporcional-24h',grace_minutes:120,half_daily_after_grace:false,overnight_mode:'pending',additional_daily_per_new_day:false,calculation:'proportional_24h',grace_basis:'excess',rounding:'started_hour'};
export interface LateFeeReservation {end_ms:number;due_ms?:number|null;daily_cents:number;protection_daily_cents?:number;terms_snapshot?:string}
export interface LateFeeAssessment {cents:number|null;status:'not_due'|'calculated'|'pending_review';late_ms:number;calendar_days:number;daily_cents:number;rule_version:string}
function calendarOrdinal(ms:number){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
 const value=(kind:string)=>Number(parts.find(part=>part.type===kind)?.value);
 return Math.floor(Date.UTC(value('year'),value('month')-1,value('day'))/DAY);
}
export function lateFeePolicyText(policy:LateFeePolicy){
 if(policy.calculation==='proportional_24h')return `Devolução no horário combinado, com tolerância de ${policy.grace_minutes} minutos sem cobrança. Ultrapassada a tolerância, o atraso é calculado proporcionalmente: diária contratada, com a proteção já incluída, dividida por 24 horas, multiplicada pelo tempo ${policy.grace_basis==='excess'?'que exceder a tolerância':'total de atraso desde o horário de devolução'}. ${policy.rounding==='started_hour'?'Cada hora iniciada após a tolerância conta como uma hora de atraso cobrável.':'Frações de hora são proporcionais aos minutos, sem arredondar para uma hora inteira.'} O valor final é arredondado uma única vez para centavos. ${policy.grace_basis==='excess'?'Cada 24 horas além da tolerância':'Cada 24 horas de atraso'} equivalem a uma diária; a contagem usa o tempo decorrido e não a mudança de data.`;
 const base=`Devolução no horário combinado. Tolerância de ${policy.grace_minutes} minutos; após esse prazo, metade da diária contratada, já incluindo o seguro da tarifa.`;
 if(policy.overnight_mode==='pending')return base+' A cobrança ao atravessar a data prevista de devolução aguarda confirmação da empresa; não há lançamento automático dessa cobrança.';
 if(policy.overnight_mode==='replace_calendar')return base+' A tolerância também vale quando o prazo atravessa a meia-noite. Ultrapassada a tolerância e passando para o dia seguinte à data prevista de devolução, uma diária contratada inteira, já com seguro, substitui a metade da diária; as duas cobranças não são somadas.'+(policy.multi_day_review?' Atrasos que alcancem dois ou mais dias posteriores à data prevista ficam para conferência da equipe; não foi definida repetição automática da cobrança.':policy.additional_daily_per_new_day?' Acrescenta-se uma diária por novo dia de atraso.':'');
 return base+' Ao passar para outro dia, soma-se uma diária contratada à metade da diária'+(policy.additional_daily_per_new_day?', com uma diária adicional por novo dia de atraso.':'.');
}
export function assessLateFee(reservation:LateFeeReservation,returnedMs:number):LateFeeAssessment{
 const due=reservation.due_ms??reservation.end_ms;
 if(!Number.isFinite(due)||!Number.isFinite(returnedMs))throw new Error('Horários inválidos para conferir o atraso.');
 let saved:Record<string,unknown>={};try{saved=JSON.parse(reservation.terms_snapshot||'{}');}catch{/* Historical records remain pending. */}
 const daily=Number(saved.delay_daily_cents??(reservation.daily_cents+(reservation.protection_daily_cents||0)));
 if(!Number.isSafeInteger(daily)||daily<0)throw new Error('Diária inválida para conferir o atraso.');
 const late=Math.max(0,returnedMs-due),calendarDays=Math.max(0,calendarOrdinal(returnedMs)-calendarOrdinal(due));
 const raw=saved.late_fee_policy;
 const policy=raw&&typeof raw==='object'?raw as Partial<LateFeePolicy>:null;
 const version=typeof policy?.version==='string'?policy.version:'historical';
 const result=(cents:number|null,status:LateFeeAssessment['status']):LateFeeAssessment=>({cents,status,late_ms:late,calendar_days:calendarDays,daily_cents:daily,rule_version:version});
 if(!late)return result(0,'not_due');
 if(!policy){
  // Older accepted terms are not replaced with today's grace or fee policy.
  const document=saved.document as {clauses?:{delay?:string}}|undefined;
  if(saved.delay_daily_cents!==undefined&&document?.clauses?.delay?.includes('1 diária adicional'))return result(Math.ceil(late/DAY)*daily,'calculated');
  return result(null,'pending_review');
 }
 const grace=Number(policy.grace_minutes);
 if(!Number.isFinite(grace)||grace<0||grace>1440)return result(null,'pending_review');
 if(policy.calculation==='proportional_24h'){
  if(late<=grace*60_000)return result(0,'not_due');
  if(policy.grace_basis!=='elapsed'&&policy.grace_basis!=='excess')return result(null,'pending_review');
  const billable=policy.grace_basis==='excess'?late-grace*60_000:late;
  const chargeable=policy.rounding==='started_hour'?Math.ceil(billable/3_600_000)*3_600_000:billable;
  const cents=Math.round(daily*(chargeable/DAY));
  return Number.isSafeInteger(cents)?result(cents,'calculated'):result(null,'pending_review');
 }
 if(calendarDays&&(!policy.overnight_mode||policy.overnight_mode==='pending'))return result(null,'pending_review');
 if(late<=grace*60_000)return result(0,'not_due');
 if(calendarDays>1&&policy.multi_day_review===true)return result(null,'pending_review');
 const half=policy.half_daily_after_grace===true?Math.round(daily/2):0;
 if(!calendarDays)return result(half,half?'calculated':'not_due');
 const overnight=daily*(policy.additional_daily_per_new_day===true?calendarDays:1);
 if(policy.overnight_mode==='additive_calendar')return result(half+overnight,'calculated');
 if(policy.overnight_mode==='replace_calendar')return result(overnight,'calculated');
 return result(null,'pending_review');
}
