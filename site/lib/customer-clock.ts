import type {CustomerReservation} from './customer-client';

export type RentalClock =
  | {state: 'not_started' | 'unavailable' | 'returned' | 'cancelled'; due_ms: null; milliseconds: 0}
  | {state: 'running' | 'overdue'; due_ms: number; milliseconds: number};

/** Display only the actual handover and the server's agreed return deadline. */
export function rentalClock(reservation: Pick<CustomerReservation, 'status' | 'actual_start_ms' | 'due_ms'>, now: number): RentalClock {
  if (reservation.status === 'cancelled') return {state: 'cancelled', due_ms: null, milliseconds: 0};
  if (reservation.status === 'returned') return {state: 'returned', due_ms: null, milliseconds: 0};
  if (reservation.status !== 'rented') return {state: 'not_started', due_ms: null, milliseconds: 0};
  const started = reservation.actual_start_ms, due = reservation.due_ms;
  if (!Number.isFinite(now) || typeof started !== 'number' || !Number.isFinite(started) || typeof due !== 'number' || !Number.isFinite(due) || due <= started || started > now) {
    return {state: 'unavailable', due_ms: null, milliseconds: 0};
  }
  const remaining = due - now;
  return {state: remaining >= 0 ? 'running' : 'overdue', due_ms: due, milliseconds: Math.abs(remaining)};
}

export function formatRentalDuration(milliseconds: number): string {
  const seconds = Math.ceil(Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000);
  const days = Math.floor(seconds / 86_400);
  const time = [Math.floor(seconds % 86_400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60]
    .map(value => String(value).padStart(2, '0')).join(':');
  return days ? `${days} ${days === 1 ? 'dia' : 'dias'} · ${time}` : time;
}

/** The countdown remains based on server time if the device clock is wrong. */
export function serverClockOffset(serverNow: number, requestStarted: number, responseReceived: number): number {
  if (![serverNow, requestStarted, responseReceived].every(Number.isFinite) || responseReceived < requestStarted) return 0;
  return serverNow - (requestStarted + responseReceived) / 2;
}
