export interface CustomerProfile {
  id: string;
  phone_masked: string;
  phone_verified: boolean;
  created_ms: number;
  operational_whatsapp: boolean;
  marketing_whatsapp: boolean;
}

export interface CustomerReservation {
  id: string;
  code: string;
  model_id?: string;
  model_name: string;
  color_name?: string;
  unit_label?: string;
  status: string;
  start_ms: number;
  end_ms: number;
  actual_start_ms?: number | null;
  actual_end_ms?: number | null;
  due_ms?: number | null;
  pickup_ms?: number | null;
  days: number;
  total_cents: number;
  payment_status?: string;
}

export interface CustomerOffer {
  id: string;
  name: string;
  description: string;
  conditions?: string;
  price_label?: string;
}

export interface CustomerDashboard {
  reservations: CustomerReservation[];
  server_now_ms: number;
  offers?: CustomerOffer[];
  integrations?: {whatsapp?: 'configured' | 'not_configured'};
}

export type CustomerIdentification=Record<string,string>;
export interface CustomerPrivateDocument {
  id:string;
  reservation_id:string;
  kind:string;
  created_ms:number;
  document_version:string;
  url?:string;
}

export class CustomerApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function customerApi<T>(path: string, data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/customer/' + path, {
      method: data === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: data === undefined ? undefined : {'Content-Type': 'application/json'},
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  } catch { throw new CustomerApiError(0, 'Não foi possível conectar ao serviço de acesso. Tente novamente.'); }
  let payload: unknown;
  try {payload = await response.json();}
  catch {throw new CustomerApiError(response.status, 'O serviço de acesso está indisponível. Tente novamente.');}
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String(payload.error) : 'Não foi possível concluir. Tente novamente.';
    throw new CustomerApiError(response.status, message);
  }
  return payload as T;
}
