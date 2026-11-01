export const reservationLabels = {reserved:'Reservada',preparing:'Em preparação',ready:'Pronta para retirada',rented:'Alugada',returned:'Devolvida',cancelled:'Cancelada'};
export type ReservationState = keyof typeof reservationLabels;
export const holdingStates: string[] = ['reserved','preparing','ready','rented'];
export interface OperationalReservation {
 id:string;code:string;model_name:string;unit_id?:string;unit_label?:string;color_name?:string;start_ms:number;end_ms:number;
 days:number;daily_cents:number;protection_daily_cents?:number;total_cents:number;status:ReservationState;payment_status:'pending'|'paid';terms_snapshot?:string;pickup_ms?:number|null;ready_ms?:number|null;source?:string;actual_start_ms?:number|null;actual_end_ms?:number|null;due_ms?:number|null;late_fee_cents?:number;late_fee_status?:string;preparation_buffer_ms?:number;account_linked?:boolean;external_customer_system?:string;external_customer_ref?:string;
}
const date=(ms:number)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(ms);
export function reservationMessage(booking:OperationalReservation,kind:'confirmation'|'ready',addressFallback:string){
 let address=addressFallback;
 try {address=JSON.parse(booking.terms_snapshot||'{}').address||address;} catch {/* Older records use the current shop address. */}
 if(kind==='ready'){
  if(booking.status!=='ready'||!booking.ready_ms||!booking.pickup_ms)throw new Error('A moto ainda não foi liberada para retirada.');
  return `Sua moto está pronta! Você pode retirar sua reserva ${booking.code} em ${date(booking.pickup_ms)}, no endereço ${address}.\nMoto: ${booking.model_name}${booking.color_name?' · '+booking.color_name:''}.\nApresente o número da reserva e os documentos combinados com a loja.\n${booking.payment_status==='paid'?'Pagamento registrado pela equipe.':'O pagamento será feito na loja.'}`;
 }
 if(['returned','cancelled'].includes(booking.status))throw new Error('Esta reserva já foi encerrada.');
 return `Sua reserva ${booking.code} foi registrada.\nModelo: ${booking.model_name}${booking.color_name?' · '+booking.color_name:''}.\nRetirada prevista: ${date(booking.start_ms)}.\nDevolução: ${date(booking.due_ms??booking.end_ms)}.\nTotal: ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(booking.total_cents/100)}, ${booking.payment_status==='paid'?'pagamento registrado pela equipe':'com pagamento na loja'}.\nAguarde a confirmação de que a moto está pronta para retirada.`;
}
