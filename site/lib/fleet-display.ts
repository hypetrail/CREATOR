import {fleetCharges, fleetPeriod, type PricedModel} from './fleet-pricing';

export interface DisplayPrice {
  days: number;
  /** Customer-facing daily price, including mandatory protection when present. */
  daily_cents: number;
  total_cents: number;
  rental_daily_cents: number;
  insurance_included: boolean;
  protection_daily_cents: number;
}

/** A display estimate using the same period and price rules as the server.
 * Availability and the final amount still require the server quote. Invalid
 * periods deliberately have no estimate, rather than showing a stale tariff.
 */
export function displayPrice(model: PricedModel, start: string, end: string, now = Date.now()): DisplayPrice | null {
  if (!Number.isInteger(model.daily_cents) || (model.daily_cents ?? 0) <= 0) return null;
  try {
    const period = fleetPeriod(model, start, end, now);
    const charge = fleetCharges(model, period.days, 'none');
    return {
      days: charge.days,
      daily_cents: charge.daily_cents + charge.protection_daily_cents,
      total_cents: charge.total_cents,
      rental_daily_cents: charge.daily_cents,
      insurance_included: charge.insurance_included,
      protection_daily_cents: charge.protection_daily_cents,
    };
  } catch {
    return null;
  }
}
