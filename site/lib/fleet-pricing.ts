import {charges, DAY, period, rentalCharges, type Insurance} from './rental';

export interface PricingPolicy {
  insurance_included: boolean;
  insurance_daily_cents: number;
  minimum_days: number;
  single_day_enabled: boolean;
  single_day_rental_cents: number | null;
}
export interface PricedModel {
  daily_cents: number | null;
  spec?: {pricing?: unknown};
}
export function pricingPolicy(model: PricedModel): PricingPolicy {
  const input = model.spec?.pricing;
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    insurance_included: raw.insurance_included === true,
    insurance_daily_cents: typeof raw.insurance_daily_cents === 'number' ? raw.insurance_daily_cents : 1500,
    minimum_days: typeof raw.minimum_days === 'number' ? raw.minimum_days : 2,
    single_day_enabled: raw.single_day_enabled === true,
    single_day_rental_cents: typeof raw.single_day_rental_cents === 'number' ? raw.single_day_rental_cents : null,
  };
}
export function validatePricing(model: PricedModel): PricingPolicy {
  const policy = pricingPolicy(model);
  if (!Number.isInteger(policy.minimum_days) || policy.minimum_days < 1 || policy.minimum_days > 30) throw new Error('Informe um mínimo de 1 a 30 diárias.');
  if (!Number.isInteger(policy.insurance_daily_cents) || policy.insurance_daily_cents < 0 || policy.insurance_daily_cents > 100000) throw new Error('Valor do seguro incluído inválido.');
  if (policy.single_day_enabled && (!Number.isInteger(policy.single_day_rental_cents) || (policy.single_day_rental_cents ?? 0) <= 0 || (policy.single_day_rental_cents ?? 0) > 1000000)) throw new Error('Informe o aluguel para a diária única.');
  return policy;
}
export function fleetPeriod(model: PricedModel, start: string, end: string, now = Date.now()) {
  const policy = validatePricing(model);
  const minimum = policy.single_day_enabled ? 1 : policy.minimum_days;
  if (minimum === 2) return period(start, end, now);
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('Informe datas e horários válidos.');
  if (a < now) throw new Error('A retirada precisa ser no futuro.');
  if (b - a < minimum * DAY) throw new Error(`A locação deste modelo exige pelo menos ${minimum * 24} horas.`);
  return {start: a, end: b, days: Math.ceil((b - a) / DAY)};
}
export function fleetCharges(model: PricedModel, days: number, insurance: Insurance = 'none') {
  if (!Number.isInteger(days) || days < 1) throw new Error('Informe uma quantidade inteira de diárias.');
  const policy = validatePricing(model);
  if (!model.daily_cents) throw new Error('Este modelo ainda não tem uma diária definida.');
  const daily = days === 1 && policy.single_day_enabled ? policy.single_day_rental_cents! : model.daily_cents;
  if (days < policy.minimum_days && !(days === 1 && policy.single_day_enabled)) throw new Error('Período inferior ao mínimo do modelo.');
  if (policy.insurance_included) {
    if (!['none', 'basic'].includes(insurance)) throw new Error('Este modelo já inclui o seguro informado na diária.');
    // charges() keeps the original two-day minimum; the one-day price is
    // computed below with the same integer-cent arithmetic and validation.
    const validated = charges(Math.max(2, days), daily, policy.insurance_daily_cents, true);
    return {...validated, days, daily_cents: daily, rental_cents: days * daily,
      protection_daily_cents: policy.insurance_daily_cents, protection_cents: days * policy.insurance_daily_cents,
      total_cents: days * (daily + policy.insurance_daily_cents), insurance: 'basic' as Insurance,
      insurance_included: true, base_daily_cents: model.daily_cents, cleaning_prepaid_cents: 0, return_cleaning_cents: 0};
  }
  if (days === 1) {
    const validated = rentalCharges(2, daily, insurance);
    return {...validated, days, rental_cents: daily, protection_cents: validated.protection_daily_cents,
      total_cents: daily + validated.protection_daily_cents, base_daily_cents: model.daily_cents, insurance_included: false};
  }
  return {...rentalCharges(days, daily, insurance), base_daily_cents: model.daily_cents, insurance_included: false};
}
