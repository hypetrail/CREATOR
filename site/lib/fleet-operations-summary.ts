export type OperationFilter = 'pickups' | 'returns' | 'overdue' | 'preparing';

interface OperationalReservation {
  status: string;
  start_ms: number;
  end_ms: number;
  pickup_ms?: number | null;
  due_ms?: number | null;
  actual_start_ms?: number | null;
  actual_end_ms?: number | null;
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const localDay = (value: number) => Number.isFinite(value) ? dayFormatter.format(value) : null;
const pickupTime = (reservation: OperationalReservation) => reservation.status === 'ready'
  ? reservation.pickup_ms ?? reservation.start_ms
  : reservation.start_ms;
const returnTime = (reservation: OperationalReservation) => reservation.due_ms ?? reservation.end_ms;

/** Operational queues only: an overdue rental needs attention even during the
 * grace period. This helper never calculates or applies a late charge. */
export function getOperationalReservations<T extends OperationalReservation>(
  reservations: readonly T[], filter: OperationFilter, now: number,
): T[] {
  const today = localDay(now);
  if (!today) return [];

  const timestamp = filter === 'pickups' ? pickupTime
    : filter === 'preparing' ? (reservation: OperationalReservation) => reservation.start_ms
    : returnTime;

  return reservations.filter(reservation => {
    switch (filter) {
      case 'pickups':
        return ['reserved', 'preparing', 'ready'].includes(reservation.status)
          && localDay(pickupTime(reservation)) === today;
      case 'returns':
        return reservation.status === 'rented' && localDay(returnTime(reservation)) === today;
      case 'overdue':
        return reservation.status === 'rented' && Number.isFinite(returnTime(reservation))
          && returnTime(reservation) < now;
      case 'preparing':
        return reservation.status === 'preparing';
    }
  }).sort((a, b) => {
    const first = timestamp(a), second = timestamp(b);
    return (Number.isFinite(first) ? first : Infinity) - (Number.isFinite(second) ? second : Infinity);
  });
}
