import type {DocumentPolicy} from './document-policy';
import type {Insurance} from './rental';

export interface FleetColor {
  id: string;
  name: string;
  hex: string;
  photos: string[];
  quantity?: number;
  available?: number;
}
export interface FleetModel {
  id: string;
  name: string;
  brand: string;
  daily_cents: number | null;
  active: number | boolean;
  quantity: number;
  available?: number;
  photos: string[];
  colors: FleetColor[];
  spec: {
    color_selection?: boolean;
    power?: number | null;
    range?: number | null;
    speed?: number | null;
    capacity?: number | null;
    capacity_exclusive?: boolean;
    manufacturer_capacity?: number | null;
    commercial_minimum_age?: number | null;
    commercial_passengers?: number | null;
    passengers?: number | null;
    battery?: string;
    charge?: string;
    brakes?: string;
    line?: string;
    source?: string;
    notes?: string[];
    features?: string[];
    pricing?: unknown;
  };
}
export interface FleetSettings {
  address: string;
  whatsapp: string;
  protection_enabled: boolean;
  coverage: string;
  rentals_enabled: boolean;
  min_days: number;
}
export interface FleetCatalog {
  models: FleetModel[];
  settings: FleetSettings;
  days?: number;
}
export interface FleetQuote {
  model_id: string;
  model_name: string;
  color: string;
  days: number;
  daily_cents: number;
  rental_cents: number;
  protection_daily_cents: number;
  protection_cents: number;
  total_cents: number;
  insurance: Insurance;
  insurance_included?: boolean;
  base_daily_cents?: number;
  document_policy?: DocumentPolicy;
  terms_token: string;
  settings: FleetSettings;
}
export interface FleetBooking extends Omit<FleetQuote, 'terms_token'> {
  id: string;
  code: string;
  delivery_token?: string;
  account_linked?: boolean;
  unit_label: string;
  start_ms: number;
  end_ms: number;
  status: string;
  payment_status: string;
  payment_method: string;
  terms_version?: string;
  terms_snapshot?: string;
}
export async function fleetApi<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch('/api/fleet/' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: data === undefined ? undefined : {'Content-Type': 'application/json'},
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: 'no-store',
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : 'Não foi possível concluir. Tente novamente.';
    throw new Error(message);
  }
  return payload as T;
}
export const formatMoney = (cents: number) => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
export const formatPeriod = (time: number) => new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
}).format(time);
