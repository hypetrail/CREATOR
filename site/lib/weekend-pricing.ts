import {fleetCharges,type PricedModel} from './fleet-pricing';
import {storeLocal} from './store-hours';
import type {Insurance} from './rental';
export const weekendPromotionText='T1: retirando quinta ou sexta e devolvendo na segunda-feira seguinte, o aluguel de domingo tem 50% de desconto. O seguro é cobrado integralmente em todas as diárias.';
export function periodCharges(model:PricedModel & {id?:string},start:number,end:number,insurance:Insurance='none') {
  const base=fleetCharges(model,Math.ceil((end-start)/86400000),insurance);
  const a=storeLocal(start),b=storeLocal(end),calendarDays=(Date.parse(b.date+'T12:00:00Z')-Date.parse(a.date+'T12:00:00Z'))/86400000;
  const eligible=model.id==='t1'&&base.insurance_included&&b.weekday===1&&((a.weekday===4&&calendarDays===4)||(a.weekday===5&&calendarDays===3));
  const discount_cents=eligible?Math.round(base.daily_cents/2):0;
  return {...base,discount_cents,rental_cents:base.rental_cents-discount_cents,total_cents:base.total_cents-discount_cents,
    promotion:discount_cents?{version:'t1-sunday-rental-half-v1',discount_cents,description:weekendPromotionText}:null};
}
/** Read saved amounts only; never recompute a historical promotion. */
export function savedDiscount(row:{terms_snapshot?:string;days:number;daily_cents:number}) {
  try{const p=JSON.parse(row.terms_snapshot||'{}').promotion;return p?.version==='t1-sunday-rental-half-v1'&&Number.isInteger(p.discount_cents)&&p.discount_cents>0&&p.discount_cents<=row.days*row.daily_cents?p.discount_cents:0;}catch{return 0;}
}
