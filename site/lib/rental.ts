export const DAY=86_400_000;
export function period(start:string,end:string,now=Date.now(),future=true){
 const a=Date.parse(start),b=Date.parse(end);
 if(!Number.isFinite(a)||!Number.isFinite(b))throw new Error('Informe datas e horários válidos.');
 if(future&&a<now)throw new Error('A retirada precisa ser no futuro.');
 if(b-a<2*DAY)throw new Error('A locação exige pelo menos 2 diárias completas (48 horas).');
 return {start:a,end:b,days:Math.ceil((b-a)/DAY)};
}
export function charges(days:number,daily:number,protection:number,include:boolean){
 if(!Number.isInteger(days)||days<2||!Number.isInteger(daily)||daily<=0||!Number.isInteger(protection)||protection<0)throw new Error('Tarifa ou período inválido.');
 return {days,daily_cents:daily,rental_cents:days*daily,protection_daily_cents:include?protection:0,protection_cents:include?days*protection:0,total_cents:days*daily+(include?days*protection:0)};
}
export type Insurance = 'none'|'basic'|'full';
export function rentalCharges(days:number,daily:number,insurance:Insurance='none',_legacyCleaning=false){
 if(!['none','basic','full'].includes(insurance))throw new Error('Escolha uma opção de seguro válida.');
 const fee=insurance==='basic'?1500:insurance==='full'?3000:0;
 const base=charges(days,daily,fee,fee>0);
 return {...base,insurance,cleaning_prepaid_cents:0,return_cleaning_cents:0,total_cents:base.total_cents};
}
export function returnCleaning(prepaid:number,dirty:boolean){return 0;}
export function phone(value:unknown){let v=String(value??'').replace(/\D/g,'');if(v.length===10||v.length===11)v='55'+v;if(!/^55\d{10,11}$/.test(v))throw new Error('Informe um WhatsApp brasileiro válido, com DDD.');return v;}
export function customer(input:any){const name=String(input?.name??'').trim(),email=String(input?.email??'').trim(),city=String(input?.city??'').trim();if(name.length<5||name.length>120||!name.includes(' '))throw new Error('Informe seu nome completo.');if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>160)throw new Error('Informe um e-mail válido.');if(city.length<2||city.length>100)throw new Error('Informe sua cidade.');return {name,email,city,phone:phone(input?.phone)};}
export const allocationSQL=`INSERT INTO reservations
 (id,code,request_key,unit_id,model_id,model_name,start_ms,end_ms,days,daily_cents,protection_daily_cents,total_cents,name,phone,email,city,payment_method,payment_status,status,created_ms,insurance,cleaning_prepaid_cents)
 SELECT ?,?,?,u.id,m.id,m.name,?,?,?,?,?,?,?,?,?,?,'pickup','pending','reserved',?,?,?
 FROM units u JOIN rental_models m ON m.id=u.model_id
 WHERE m.id=? AND m.daily_cents=? AND m.active=1 AND u.status='available'
 AND (SELECT value FROM settings WHERE key='rentals_enabled')='true'
 AND (?=0 OR ((SELECT value FROM settings WHERE key='protection_enabled')='true' AND ? IN (1500,3000)))
 AND NOT EXISTS(SELECT 1 FROM reservations b WHERE b.unit_id=u.id AND ((b.status='rented' AND b.end_ms<=?) OR (b.status IN ('reserved','preparing','ready','rented') AND b.start_ms<? AND b.end_ms>?)))
 AND NOT EXISTS(SELECT 1 FROM blocks k WHERE k.unit_id=u.id AND k.start_ms<? AND k.end_ms>?)
 ORDER BY u.ordinal LIMIT 1 RETURNING *`;
export function allocationArgs(id:string,code:string,key:string,modelId:string,p:any,c:any,user:any,now:number){return [id,code,key,p.start,p.end,p.days,c.daily_cents,c.protection_daily_cents,c.total_cents,user.name,user.phone,user.email,user.city,now,c.insurance||'none',c.cleaning_prepaid_cents||0,modelId,c.daily_cents,c.protection_daily_cents,c.protection_daily_cents,now,p.end,p.start,p.end,p.start];}
