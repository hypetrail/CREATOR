export const storeHoursText = 'Segunda a sexta: 9h às 18h. Sábado: 8h às 15h. Domingo: fechado. Horários de Brasília.';
const formatter = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function storeLocal(ms:number) {
  if(!Number.isFinite(ms)) throw new Error('Informe datas e horários válidos.');
  const p=Object.fromEntries(formatter.formatToParts(ms).map(p=>[p.type,p.value]));
  const date=`${p.year}-${p.month}-${p.day}`;
  return {date,weekday:new Date(date+'T12:00:00Z').getUTCDay(),seconds:Number(p.hour)*3600+Number(p.minute)*60+Number(p.second)};
}
export function hoursForDate(date:string) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
  const ms=Date.parse(date+'T12:00:00Z');if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date)return null;
  const day=new Date(ms).getUTCDay();
  return day===0?null:day===6?{min:'08:00',max:'15:00'}:{min:'09:00',max:'18:00'};
}
export function nextOpenDate(date:string) {
  let ms=Date.parse(date+'T12:00:00Z');if(!Number.isFinite(ms))return date;
  for(let i=0;i<7;i++,ms+=86400000){const value=new Date(ms).toISOString().slice(0,10);if(hoursForDate(value))return value;}
  return date;
}
export function validateStoreTime(value:string|number,label='Retirada') {
  const time=typeof value==='number'?value:Date.parse(value),local=storeLocal(time),hours=hoursForDate(local.date);
  if(!hours)throw new Error(`${label}: a loja fecha aos domingos. Escolha um dia de atendimento; para o fim de semana, devolva na segunda-feira.`);
  const seconds=(h:string)=>Number(h.slice(0,2))*3600+Number(h.slice(3))*60;
  if(local.seconds<seconds(hours.min)||local.seconds>seconds(hours.max))throw new Error(`${label}: neste dia o atendimento é das ${hours.min} às ${hours.max} (Brasília).`);
}
export function validateStorePeriod(start:string,end:string){validateStoreTime(start,'Retirada');validateStoreTime(end,'Devolução');}
