import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const built = await build({entryPoints:['lib/customer-clock.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const compiled = {exports:{}};
new Function('module','exports','require',built.outputFiles[0].text)(compiled,compiled.exports,require);
const {rentalClock,formatRentalDuration,serverClockOffset} = compiled.exports;
const start = Date.parse('2030-10-15T09:00:00-03:00'), due = start + 2 * 86400000;
test('customer clock starts only after actual handover and never from the planned reservation date',()=>{
  for (const status of ['reserved','preparing','ready']) assert.equal(rentalClock({status,actual_start_ms:null,due_ms:null},due + 60000).state,'not_started');
  assert.equal(rentalClock({status:'rented',actual_start_ms:null,due_ms:due},start).state,'unavailable');
  assert.equal(rentalClock({status:'rented',actual_start_ms:start,due_ms:null},start).state,'unavailable');
  assert.equal(rentalClock({status:'rented',actual_start_ms:start + 1,due_ms:due},start).state,'unavailable');
  assert.deepEqual(rentalClock({status:'rented',actual_start_ms:start,due_ms:due},start),{state:'running',due_ms:due,milliseconds:172800000});
});
test('customer clock shows authoritative remaining time, overdue time and stops for terminal states',()=>{
  const r = {status:'rented',actual_start_ms:start,due_ms:due};
  assert.equal(rentalClock(r,due-1000).milliseconds,1000);
  assert.equal(rentalClock(r,due).state,'running');
  assert.deepEqual(rentalClock(r,due+3600000),{state:'overdue',due_ms:due,milliseconds:3600000});
  assert.equal(rentalClock({...r,status:'returned'},due+3600000).state,'returned');
  assert.equal(rentalClock({...r,status:'cancelled'},due+3600000).state,'cancelled');
  assert.equal(formatRentalDuration(172800000),'2 dias · 00:00:00');
  assert.equal(formatRentalDuration(90061000),'1 dia · 01:01:01');
  assert.equal(formatRentalDuration(999),'00:00:01');
  assert.equal(formatRentalDuration(-1),'00:00:00');
});
test('server time offset compensates for an incorrect device clock and rejects invalid samples',()=>{
  assert.equal(serverClockOffset(100000,5000,7000),94000);
  assert.equal(serverClockOffset(100000,7000,5000),0);
  assert.equal(serverClockOffset(NaN,5000,7000),0);
});
