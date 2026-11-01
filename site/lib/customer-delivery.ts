import {ageAt, validCPF} from './intake';
import {phone} from './rental';

/** These settings are server secrets, never editable in a public request. */
export interface DeliveryEnvironment {
  RESEND_API_KEY?: string;
  RESERVATION_EMAIL_PROVIDER?: string;
  RESERVATION_EMAIL_FROM?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  CUSTOMER_API_URL?: string;
  CUSTOMER_API_TOKEN?: string;
  CUSTOMER_SYSTEM_NAME?: string;
}
export type DeliveryCustomer = Record<string, string>;
export type DeliveryFetch = typeof fetch;
export type ExternalCustomerResult =
  | {status: 'linked'; system: string; reference: string}
  | {status: 'not_configured' | 'failed'; reason: string};
export class DeliveryInputError extends Error {}

const customerFields = ['name', 'cpf', 'phone', 'email', 'birth', 'cep', 'street', 'number', 'district', 'city', 'state', 'complement', 'guardian', 'guardianCPF', 'guardianPhone', 'accompanied'] as const;
const emailPattern = /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/;
export function validDeliveryEmail(value: string) {
  return value.length <= 254 && emailPattern.test(value) && !/[\x00-\x1f\x7f]/.test(value);
}
export function validateDeliveryCustomer(value: unknown, referenceMs = Date.now(), options:{requireEmail?:boolean} = {}): DeliveryCustomer {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DeliveryInputError('Preencha os dados de identificação do cliente.');
  const raw = value as Record<string, unknown>;
  const customer: DeliveryCustomer = {};
  for (const key of customerFields) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') throw new DeliveryInputError('Confira os campos da identificação do cliente.');
    const field = String(raw[key] || '').trim();
    if (/[\x00-\x1f\x7f]/.test(field) || field.length > (key === 'email' ? 254 : 160)) throw new DeliveryInputError('Confira os campos da identificação do cliente.');
    customer[key] = field;
  }
  if (customer.name.length < 5 || customer.name.split(/\s+/).length < 2) throw new DeliveryInputError('Informe o nome completo do cliente.');
  if (!validCPF(customer.cpf)) throw new DeliveryInputError('Confira o CPF do cliente.');
  if ((customer.email || options.requireEmail!==false) && !validDeliveryEmail(customer.email)) throw new DeliveryInputError('Informe um e-mail válido para receber os documentos da locação.');
  try { customer.phone = phone(customer.phone); } catch { throw new DeliveryInputError('Confira o WhatsApp do cliente.'); }
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(Number.isFinite(referenceMs)?referenceMs:Date.now()));
  let age: number;
  try { age = ageAt(customer.birth, today); } catch { throw new DeliveryInputError('Confira o nascimento do cliente.'); }
  if (age < 16) throw new DeliveryInputError('A locação não está disponível para menores de 16 anos.');
  if (!/^\d{8}$/.test(customer.cep.replace(/\D/g, '')) || ['street', 'number', 'district', 'city', 'state'].some(key => !customer[key]) || !/^[A-Za-z]{2}$/.test(customer.state)) throw new DeliveryInputError('Preencha o endereço completo do cliente.');
  customer.state = customer.state.toUpperCase();
  if (age < 18) {
    if (customer.guardian.split(/\s+/).length < 2 || !validCPF(customer.guardianCPF) || customer.guardianCPF.replace(/\D/g, '') === customer.cpf.replace(/\D/g, '')) throw new DeliveryInputError('Confira nome e CPF do responsável.');
    try { customer.guardianPhone = phone(customer.guardianPhone); } catch { throw new DeliveryInputError('Confira o WhatsApp do responsável.'); }
    if (!['on', 'true', '1'].includes(customer.accompanied)) throw new DeliveryInputError('Confirme a presença do responsável na retirada.');
  } else {
    delete customer.guardian;
    delete customer.guardianCPF;
    delete customer.guardianPhone;
    delete customer.accompanied;
  }
  return customer;
}

/** An internal record identifier, never a CPF, e-mail address or phone. */
export function validExternalReference(reference: unknown): reference is string {
  return typeof reference === 'string' && /^[-A-Za-z0-9_.:]{1,120}$/.test(reference) && !/^\d{11}$/.test(reference) && !/^55\d{10,11}$/.test(reference);
}
function externalConfiguration(environment: DeliveryEnvironment) {
  const {CUSTOMER_API_URL: endpoint, CUSTOMER_API_TOKEN: token, CUSTOMER_SYSTEM_NAME: system} = environment;
  if (!endpoint || !token?.trim() || !system?.trim() || system.length > 80 || /[\x00-\x1f\x7f]/.test(token + system)) return null;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.startsWith('[') || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return null;
    url.pathname = url.pathname.replace(/\/$/, '') + '/customer-reservations';
    return {url: url.toString(), token, system: system.trim()};
  } catch { return null; }
}
export function externalCustomerConfigured(environment: DeliveryEnvironment) { return !!externalConfiguration(environment); }

// Response bodies may contain personal data. Never include a raw body or error
// in returned errors, logs or operational reservation metadata.
export async function readBoundedDeliveryJson(response: Response): Promise<Record<string, unknown> | null> {
  if (!response.ok || Number(response.headers.get('content-length') || 0) > 32_768) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const result = await reader.read(); if (result.done) break;
    length += result.value.length;
    if (length > 32_768) { await reader.cancel(); return null; }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * Adapter contract: POST {base}/customer-reservations accepts
 * {reservation_id, customer} and returns {reference: opaqueId}. The external
 * implementation must upsert by reservation_id / Idempotency-Key.
 */
export async function saveExternalCustomer({environment, reservationId, customer}: {environment: DeliveryEnvironment; reservationId: string; customer: DeliveryCustomer}, request: DeliveryFetch = fetch): Promise<ExternalCustomerResult> {
  const config = externalConfiguration(environment);
  if (!config) return {status: 'not_configured', reason: 'customer_system_not_configured'};
  if (!/^[A-Za-z0-9-]{1,80}$/.test(reservationId)) throw new DeliveryInputError('Identificador de reserva inválido.');
  const validated = validateDeliveryCustomer(customer);
  try {
    const response = await request(config.url, {method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: {'Authorization': 'Bearer ' + config.token, 'Content-Type': 'application/json', 'Idempotency-Key': 'reservation-' + reservationId}, body: JSON.stringify({reservation_id: reservationId, customer: validated})});
    const body = await readBoundedDeliveryJson(response);
    if (!body || !validExternalReference(body.reference)) return {status: 'failed', reason: 'customer_system_rejected'};
    return {status: 'linked', system: config.system, reference: body.reference};
  } catch { return {status: 'failed', reason: 'customer_system_unavailable'}; }
}

/** GET {base}/customer-reservations/{opaqueId} must return {customer: {...}}. */
export async function readExternalCustomer({environment, reference, system}: {environment: DeliveryEnvironment; reference: string; system?: string}, request: DeliveryFetch = fetch): Promise<{status: 'loaded'; customer: DeliveryCustomer} | {status: 'not_configured' | 'failed'; reason: string}> {
  const config = externalConfiguration(environment);
  if (!config) return {status: 'not_configured', reason: 'customer_system_not_configured'};
  if (!validExternalReference(reference) || (system !== undefined && config.system !== system)) return {status: 'failed', reason: 'customer_reference_invalid'};
  try {
    const response = await request(config.url + '/' + encodeURIComponent(reference), {method: 'GET', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: {'Authorization': 'Bearer ' + config.token, 'Accept': 'application/json'}});
    const body = await readBoundedDeliveryJson(response);
    if (!body) return {status: 'failed', reason: 'customer_system_rejected'};
    return {status: 'loaded', customer: validateDeliveryCustomer(body.customer)};
  } catch { return {status: 'failed', reason: 'customer_system_unavailable'}; }
}
