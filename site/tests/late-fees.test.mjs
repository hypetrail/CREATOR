import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const result=await build({entryPoints:['lib/late-fees.ts'],bundle:true,platform:'node',format:'cjs',write:false});
const compiled={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(compiled,compiled.exports,require);
const {assessLateFee,legacyLateFeePolicy:defaultLateFeePolicy,lateFeePolicyText}=compiled.exports;
const due=Date.parse('2030-10-15T09:00:00-03:00');
const base={end_ms:due,daily_cents:3000,protection_daily_cents:1500};
const row=(policy=defaultLateFeePolicy)=>({...base,terms_snapshot:JSON.stringify({delay_daily_cents:4500,late_fee_policy:policy})});
test('same-day return grants two hours and charges half the saved all-in daily after grace',()=>{
 assert.deepEqual([0,60,120].map(minutes=>assessLateFee(row(),due+minutes*60_000).cents),[0,0,0]);
 const fee=assessLateFee(row(),due+120*60_000+1);assert.equal(fee.cents,2250);assert.equal(fee.status,'calculated');assert.equal(fee.daily_cents,4500);
 const oneDay={...row(),daily_cents:4500,terms_snapshot:JSON.stringify({delay_daily_cents:6000,late_fee_policy:defaultLateFeePolicy})};
 assert.equal(assessLateFee(oneDay,due+3*3_600_000).cents,3000);
});
test('confirmed next-day fee replaces the half daily and further calendar days remain for review',()=>{
 const fee=assessLateFee(row(),Date.parse('2030-10-16T01:00:00-03:00'));
 assert.equal(fee.status,'calculated');assert.equal(fee.cents,4500);assert.equal(fee.calendar_days,1);
 const longer=assessLateFee(row(),Date.parse('2030-10-17T01:00:00-03:00'));
 assert.equal(longer.status,'pending_review');assert.equal(longer.cents,null);assert.equal(longer.calendar_days,2);
 assert.match(lateFeePolicyText(defaultLateFeePolicy),/substitui a metade/);
 assert.match(lateFeePolicyText(defaultLateFeePolicy),/as duas cobranças não são somadas/);
 assert.match(lateFeePolicyText(defaultLateFeePolicy),/dois ou mais dias posteriores/);
});
test('two-hour grace remains valid across midnight and one-day rental uses its saved all-in R$60 rate',()=>{
 const nearMidnight={...row(),end_ms:Date.parse('2030-10-15T23:00:00-03:00')};
 assert.equal(assessLateFee(nearMidnight,Date.parse('2030-10-16T00:00:00-03:00')).cents,0);
 assert.equal(assessLateFee(nearMidnight,Date.parse('2030-10-16T01:00:00-03:00')).cents,0);
 assert.equal(assessLateFee(nearMidnight,Date.parse('2030-10-16T01:00:00.001-03:00')).cents,4500);
 const oneDay={...row(),daily_cents:4500,terms_snapshot:JSON.stringify({delay_daily_cents:6000,late_fee_policy:defaultLateFeePolicy})};
 assert.equal(assessLateFee(oneDay,due+121*60_000).cents,3000);
 assert.equal(assessLateFee(oneDay,Date.parse('2030-10-16T01:00:00-03:00')).cents,6000);
});
test('saved unconfirmed policies remain pending rather than acquiring the new replacement rule',()=>{
 const pending={...defaultLateFeePolicy,version:'late-v2-pending',overnight_mode:'pending'};
 const fee=assessLateFee(row(pending),Date.parse('2030-10-16T01:00:00-03:00'));
 assert.equal(fee.status,'pending_review');assert.equal(fee.cents,null);
 const nearMidnight={...row(pending),end_ms:Date.parse('2030-10-15T23:00:00-03:00')};
 assert.equal(assessLateFee(nearMidnight,Date.parse('2030-10-16T00:00:00-03:00')).status,'pending_review');
});
test('calendar policies calculate in Brazil and never add insurance twice',()=>{
 const additive={...defaultLateFeePolicy,overnight_mode:'additive_calendar',additional_daily_per_new_day:true,multi_day_review:false};
 assert.equal(assessLateFee(row(additive),Date.parse('2030-10-16T01:00:00-03:00')).cents,6750);
 assert.equal(assessLateFee(row(additive),Date.parse('2030-10-17T01:00:00-03:00')).cents,11250);
 const replacement={...additive,overnight_mode:'replace_calendar'};
 assert.equal(assessLateFee(row(replacement),Date.parse('2030-10-16T01:00:00-03:00')).cents,4500);
 const nearMidnight={...row(additive),end_ms:Date.parse('2030-10-15T22:00:00-03:00')};
 assert.equal(assessLateFee(nearMidnight,Date.parse('2030-10-16T00:00:00-03:00')).cents,0);
 assert.equal(assessLateFee(nearMidnight,Date.parse('2030-10-16T00:00:01-03:00')).cents,6750);
});
test('actual pickup due date governs return instead of the originally planned end',()=>{
 const operational={...row(),due_ms:due+24*3_600_000};
 assert.equal(assessLateFee(operational,due+24*3_600_000+60*60_000).cents,0);
});
test('older contracts preserve their saved one-daily rule and unknown histories stay pending',()=>{
 const historical={...base,terms_snapshot:JSON.stringify({delay_daily_cents:4500,document:{clauses:{delay:'Será cobrado o valor de 1 diária adicional.'}}})};
 assert.equal(assessLateFee(historical,due+1).cents,4500);assert.equal(assessLateFee(historical,due+24*3_600_000+1).cents,9000);
 assert.equal(assessLateFee({...base,terms_snapshot:'{}'},due+1).status,'pending_review');
});

const hourly=compiled.exports.defaultLateFeePolicy;
test('hourly late fee discounts two hours, rounds started hours, and rounds cents only once',()=>{
 const current=row(hourly);
 for(const [minutes,expected]of [[0,0],[120,0],[121,188],[180,188],[181,375],[240,375],[1440,4125],[1560,4500],[3000,9000]])assert.equal(assessLateFee(current,due+minutes*60_000).cents,expected,String(minutes));
 const oneDay={...current,daily_cents:4500,terms_snapshot:JSON.stringify({delay_daily_cents:6000,late_fee_policy:hourly})};
 assert.equal(assessLateFee(oneDay,due+121*60_000).cents,250);
 const midnight={...current,end_ms:Date.parse('2030-10-15T23:00:00-03:00')};
 assert.equal(assessLateFee(midnight,midnight.end_ms+180*60_000).cents,188);
 assert.match(lateFeePolicyText(hourly),/Cada hora iniciada/);assert.doesNotMatch(lateFeePolicyText(hourly),/metade da diária/);
});
