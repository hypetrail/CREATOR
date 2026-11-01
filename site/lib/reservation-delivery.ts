import {createReservationPdf, type PdfReservation} from './reservation-pdf';
import {createCareGuidePdf} from './care-pdf';
import {parseCareGuide} from './care-guide';
import {readBoundedDeliveryJson, validateDeliveryCustomer, validDeliveryEmail, type DeliveryCustomer, type DeliveryEnvironment, type DeliveryFetch} from './customer-delivery';

export type DocumentDeliveryKind = 'reservation' | 'pickup_confirmation';
export type EmailDeliveryResult =
  | {status: 'submitted'; provider_id: string}
  | {status: 'not_configured' | 'failed'; reason: string};

function emailConfiguration(environment: DeliveryEnvironment) {
  const from = environment.RESERVATION_EMAIL_FROM?.trim();
  if (!from || /[\x00-\x1f\x7f]/.test(from)) return null;
  const sender = from.match(/^[^<>\r\n]{1,100} <([^<>]+)>$/)?.[1] || from;
  if (!validDeliveryEmail(sender)) return null;
  const provider = environment.RESERVATION_EMAIL_PROVIDER || (sender.toLowerCase().endsWith('@gmail.com') ? 'gmail' : 'resend');
  if (provider === 'gmail') {
    const clientId = environment.GMAIL_CLIENT_ID?.trim(), clientSecret = environment.GMAIL_CLIENT_SECRET?.trim(), refreshToken = environment.GMAIL_REFRESH_TOKEN?.trim();
    if (!clientId || !clientSecret || !refreshToken || /[\x00-\x1f\x7f]/.test(clientId + clientSecret + refreshToken)) return null;
    return {provider, from, sender, clientId, clientSecret, refreshToken} as const;
  }
  const key = environment.RESEND_API_KEY?.trim();
  // A personal Gmail address cannot authenticate as a Resend sending domain.
  if (provider !== 'resend' || sender.toLowerCase().endsWith('@gmail.com') || !key || /[\x00-\x1f\x7f]/.test(key)) return null;
  return {provider, key, from, sender} as const;
}
export function reservationEmailConfigured(environment: DeliveryEnvironment) { return !!emailConfiguration(environment); }
export function emailDeliveryProvider(environment: DeliveryEnvironment): 'gmail' | 'resend' | null { return emailConfiguration(environment)?.provider || null; }
const date = (ms: number) => new Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short'}).format(ms);
const money = (cents: number) => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
function base64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 16_384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  return btoa(binary);
}
const wrapBase64 = (encoded: string) => encoded.match(/.{1,76}/g)?.join('\r\n') || '';
const encodedText = (value: string) => base64(new TextEncoder().encode(value));
interface MailAttachment {filename:string;bytes:Uint8Array}
async function gmailMessage({sender,recipient,subject,text,attachments,idempotencyKey}: {sender:string;recipient:string;subject:string;text:string;attachments:MailAttachment[];idempotencyKey:string}) {
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(idempotencyKey)));
 const key=Array.from(digest,value=>value.toString(16).padStart(2,'0')).join('');
 const boundary='calori_'+key.slice(0,32);
 const parts=[`From: <${sender}>`,`To: <${recipient}>`,`Subject: =?UTF-8?B?${encodedText(subject)}?=`,`Message-ID: <reservation-${key}@${sender.split('@')[1]}>`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',wrapBase64(encodedText(text)),''];
 for(const attachment of attachments)parts.push(`--${boundary}`,`Content-Type: application/pdf; name="${attachment.filename}"`,'Content-Transfer-Encoding: base64',`Content-Disposition: attachment; filename="${attachment.filename}"`,'',wrapBase64(base64(attachment.bytes)),'');
 parts.push(`--${boundary}--`,'');
 return encodedText(parts.join('\r\n')).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
async function sendGmail(config: Extract<NonNullable<ReturnType<typeof emailConfiguration>>, {provider: 'gmail'}>, {recipient,subject,text,attachments,idempotencyKey}: {recipient:string;subject:string;text:string;attachments:MailAttachment[];idempotencyKey:string}, request: DeliveryFetch): Promise<EmailDeliveryResult> {
  let accessToken: string;
  try {
    const response = await request('https://oauth2.googleapis.com/token',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(15_000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,refresh_token:config.refreshToken,grant_type:'refresh_token'}).toString()});
    if (!response.ok) return {status:'failed',reason:'email_oauth_rejected'};
    const result = await readBoundedDeliveryJson(response);
    if (!result || typeof result.access_token !== 'string' || !result.access_token || result.access_token.length > 4096 || /[\r\n]/.test(result.access_token)) return {status:'failed',reason:'email_oauth_response_invalid'};
    accessToken = result.access_token;
  } catch { return {status:'failed',reason:'email_oauth_unavailable'}; }
  let raw: string;
  try { raw = await gmailMessage({sender:config.sender,recipient,subject,text,attachments,idempotencyKey}); }
  catch { return {status:'failed',reason:'document_generation_failed'}; }
  // Gmail does not provide Resend-style idempotency. A deterministic Message-ID
  // aids tracing but is NOT a delivery deduplication guarantee. After an
  // ambiguous send the caller must block automatic retries and investigate.
  try {
    const response = await request('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20_000),headers:{'Authorization':'Bearer '+accessToken,'Content-Type':'application/json'},body:JSON.stringify({raw})});
    if (!response.ok) return {status:'failed',reason:response.status >= 500 || response.status === 408 ? 'email_delivery_uncertain' : 'email_provider_rejected'};
    const result = await readBoundedDeliveryJson(response);
    if (!result || typeof result.id !== 'string' || !/^[-A-Za-z0-9_]{1,120}$/.test(result.id)) return {status:'failed',reason:'email_delivery_uncertain'};
    return {status:'submitted',provider_id:result.id};
  } catch { return {status:'failed',reason:'email_delivery_uncertain'}; }
}

/**
 * The caller must authorize, deduplicate and load the reservation from the DB.
 * Never pass a reservation, price, document or recipient supplied by a public
 * request without server validation. Customer data exists only for this call.
 * "submitted" means accepted by the provider, not confirmed inbox delivery.
 */
export async function sendReservationEmail({environment, reservation, customer, fontBytes, kind, idempotencyKey}: {environment: DeliveryEnvironment; reservation: PdfReservation; customer: DeliveryCustomer; fontBytes: Uint8Array; kind: DocumentDeliveryKind; idempotencyKey: string}, request: DeliveryFetch = fetch): Promise<EmailDeliveryResult> {
  const config = emailConfiguration(environment);
  if (!config) return {status: 'not_configured', reason: 'email_not_configured'};
  const recipient = validateDeliveryCustomer(customer,reservation.created_ms);
  if (!/^[A-Za-z0-9_.:-]{1,200}$/.test(idempotencyKey)) return {status: 'failed', reason: 'delivery_key_invalid'};
  if (!['reservation', 'pickup_confirmation'].includes(kind)) return {status: 'failed', reason: 'delivery_kind_invalid'};
  if (['returned', 'cancelled'].includes(reservation.status)) return {status: 'failed', reason: 'reservation_closed'};
  const readyReservation = reservation as PdfReservation & {pickup_ms?: number | null; ready_ms?: number | null};
  if (kind === 'pickup_confirmation' && (reservation.status !== 'ready' || !readyReservation.ready_ms || !readyReservation.pickup_ms || readyReservation.pickup_ms >= reservation.end_ms)) return {status: 'failed', reason: 'pickup_not_released'};
  let address = 'Endereço combinado com a loja';
  try { address = String(JSON.parse(reservation.terms_snapshot || '{}').address || address); } catch { /* Historical record. */ }
  let bytes: Uint8Array;
  try { bytes = await createReservationPdf({reservation, customer: recipient, fontBytes, kind}); }
  catch { return {status: 'failed', reason: 'document_generation_failed'}; }
  const pickup = kind === 'pickup_confirmation';
  const subject = pickup ? `Sua moto está pronta — ${reservation.code}` : `Documento da reserva ${reservation.code} — CaloriMob`;
  const message = pickup
    ? `Sua moto está pronta!\n\nReserva: ${reservation.code}\nMoto: ${reservation.model_name}${reservation.color_name ? ' · ' + reservation.color_name : ''}\nRetirada confirmada: ${date(readyReservation.pickup_ms!)} (horário de Brasília)\nEndereço: ${address}\nApresente o número da reserva e os documentos combinados com a loja.\n\nO documento de confirmação da retirada e as condições da locação estão anexos.`
    : `Sua reserva ${reservation.code} foi registrada.\n\nMoto: ${reservation.model_name}${reservation.color_name ? ' · ' + reservation.color_name : ''}\nRetirada prevista: ${date(reservation.start_ms)} (horário de Brasília)\nDevolução: ${date(reservation.end_ms)}\nTotal: ${money(reservation.total_cents)}\nAguarde a confirmação de que a moto está pronta antes de ir à loja. O horário confirmado será enviado no documento de liberação para retirada.\n\nO documento da reserva com sua identificação e as condições da locação está anexo.`;
  const payment = reservation.payment_status === 'paid' ? '\nPagamento presencial registrado manualmente pela equipe.' : '\nPagamento pendente, exclusivamente na loja.';
  const filename = `${pickup ? 'Confirmacao-Retirada' : 'Reserva'}-${reservation.code.replace(/[^A-Za-z0-9_-]/g,'-')}.pdf`;
  const attachments:MailAttachment[]=[{filename,bytes}];
  try {
    const saved=JSON.parse(reservation.terms_snapshot||'{}');
    if(saved.care_guide)attachments.push({filename:'Guia-Cuidados-T1-CaloriMob.pdf',bytes:await createCareGuidePdf(fontBytes,parseCareGuide(saved.care_guide))});
  } catch {return {status:'failed',reason:'document_generation_failed'};}
  const careText=attachments.length>1?'\nO guia de cuidados da sua reserva também está anexo.':'';
  if (config.provider === 'gmail') return sendGmail(config,{recipient:recipient.email,subject,text:message+payment+careText+'\n\nCaloriMob',attachments,idempotencyKey},request);
  try {
    const response = await request('https://api.resend.com/emails', {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: {'Authorization': 'Bearer ' + config.key, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey}, body: JSON.stringify({from: config.from, to: [recipient.email], subject, text: message + payment + careText + '\n\nCaloriMob', attachments: attachments.map(item=>({filename:item.filename,content:base64(item.bytes)}))})});
    if (!response.ok) return {status: 'failed', reason: response.status>=500||response.status===408?'email_delivery_uncertain':'email_provider_rejected'};
    const result = await readBoundedDeliveryJson(response);
    if (!result || typeof result.id !== 'string' || !/^[-A-Za-z0-9_]{1,120}$/.test(result.id)) return {status: 'failed', reason: 'email_delivery_uncertain'};
    return {status: 'submitted', provider_id: result.id};
  } catch { return {status: 'failed', reason: 'email_delivery_uncertain'}; }
}
