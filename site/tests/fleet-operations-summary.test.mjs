import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const built = await build({entryPoints:['lib/fleet-operations-summary.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const compiled = {exports:{}};
new Function('module','exports','require',built.outputFiles[0].text)(compiled,compiled.exports,require);
const {getOperationalReservations} = compiled.exports;
const ms = value => Date.parse(value);
const now = ms('2030-11-15T12:00:00-03:00');
const reservation = (id, changes = {}) => ({id,status:'reserved',start_ms:ms('2030-11-15T09:00:00-03:00'),end_ms:ms('2030-11-17T09:00:00-03:00'),...changes});
const ids = (rows, filter, instant = now) => getOperationalReservations(rows,filter,instant).map(row => row.id);

test('today follows Brasília midnight, not UTC or the device timezone', () => {
  const beforeMidnight = ms('2030-11-15T02:59:59Z');
  const midnight = ms('2030-11-15T03:00:00Z');
  const rows = [reservation('previous-day',{start_ms:beforeMidnight}),reservation('next-day',{start_ms:midnight})];
  assert.deepEqual(ids(rows,'pickups',ms('2030-11-15T01:00:00Z')),['previous-day']);
  assert.deepEqual(ids(rows,'pickups',midnight),['next-day']);
});

test('ready pickups use the confirmed pickup time and pending pickups use the planned start', () => {
  const yesterday = ms('2030-11-14T09:00:00-03:00');
  const tomorrow = ms('2030-11-16T09:00:00-03:00');
  const rows = [
    reservation('moved-out',{status:'ready',pickup_ms:tomorrow}),
    reservation('moved-in',{status:'ready',start_ms:yesterday,pickup_ms:ms('2030-11-15T10:00:00-03:00')}),
    reservation('planned'),
    reservation('ready-legacy',{status:'ready',pickup_ms:null,start_ms:ms('2030-11-15T11:00:00-03:00')}),
    reservation('preparing',{status:'preparing',pickup_ms:tomorrow,start_ms:ms('2030-11-15T08:00:00-03:00')}),
  ];
  assert.deepEqual(ids(rows,'pickups'),['preparing','planned','moved-in','ready-legacy']);
});

test('returns use the effective due date after handover and include overdue returns still due today', () => {
  const rows = [
    reservation('due-later',{status:'rented',due_ms:ms('2030-11-15T18:00:00-03:00')}),
    reservation('extended',{status:'rented',end_ms:ms('2030-11-15T08:00:00-03:00'),due_ms:ms('2030-11-16T08:00:00-03:00')}),
    reservation('late-today',{status:'rented',due_ms:ms('2030-11-15T10:00:00-03:00')}),
    reservation('legacy',{status:'rented',due_ms:null,end_ms:ms('2030-11-15T09:00:00-03:00')}),
    reservation('due-yesterday',{status:'rented',due_ms:ms('2030-11-14T18:00:00-03:00')}),
  ];
  assert.deepEqual(ids(rows,'returns'),['legacy','late-today','due-later']);
  assert.deepEqual(ids(rows,'overdue'),['due-yesterday','legacy','late-today']);
});

test('operational overdue starts strictly after the due instant without applying grace or charging a fee', () => {
  const rows = [
    reservation('at-deadline',{status:'rented',due_ms:now}),
    reservation('one-millisecond-late',{status:'rented',due_ms:now-1}),
    reservation('future',{status:'rented',due_ms:now+1}),
  ];
  assert.deepEqual(ids(rows,'overdue'),['one-millisecond-late']);
  assert.deepEqual(ids(rows,'overdue',now+1),['one-millisecond-late','at-deadline']);
  assert.equal('late_fee_cents' in rows[1],false);
});

test('closed or not-yet-rented reservations never become outstanding returns or overdue rentals', () => {
  const due = now-3600000;
  const rows = ['returned','cancelled','reserved','preparing','ready'].map(status => reservation(status,{status,end_ms:due,due_ms:due}));
  assert.deepEqual(ids(rows,'returns'),[]);
  assert.deepEqual(ids(rows,'overdue'),[]);
  assert.deepEqual(ids(rows,'pickups'),['reserved','preparing','ready']);
});

test('preparation includes pending work across dates and chronological sorting leaves input untouched', () => {
  const first = reservation('later',{status:'preparing',start_ms:now+86400000});
  const second = reservation('earlier',{status:'preparing',start_ms:now-86400000});
  const rows = [first,reservation('reserved'),second,reservation('returned',{status:'returned'})];
  const before = JSON.stringify(rows);
  const result = getOperationalReservations(rows,'preparing',now);
  assert.deepEqual(result.map(row=>row.id),['earlier','later']);
  assert.equal(result[0],second);
  assert.equal(JSON.stringify(rows),before);
});

test('an invalid clock does not invent a today queue and malformed dates do not match dated queues', () => {
  const rows = [reservation('bad',{status:'rented',due_ms:NaN})];
  for(const filter of ['pickups','returns','overdue','preparing'])assert.deepEqual(ids(rows,filter,NaN),[]);
  assert.deepEqual(ids(rows,'returns'),[]);
  assert.deepEqual(ids(rows,'overdue'),[]);
});
