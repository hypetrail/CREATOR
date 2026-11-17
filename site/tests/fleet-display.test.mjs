import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
async function compile(path) {
  const result = await build({entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false});
  const compiled = {exports: {}};
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(compiled, compiled.exports, require);
  return compiled.exports;
}
const {displayPrice} = await compile('lib/fleet-display.ts');
const {t1Model} = await compile('lib/t1.ts');
const day = 86_400_000;
const now = Date.parse('2030-01-01T09:00:00-03:00');
const start = '2030-01-02T09:00:00-03:00';
const end = days => new Date(Date.parse(start) + days * day).toISOString();

test('the T1 card displays R$60 for one day and R$45/day for two days, with protection counted once', () => {
  assert.deepEqual(displayPrice(t1Model, start, end(1), now), {
    days: 1, daily_cents: 6000, total_cents: 6000,
    rental_daily_cents: 4500, insurance_included: true, protection_daily_cents: 1500,
  });
  assert.deepEqual(displayPrice(t1Model, start, end(2), now), {
    days: 2, daily_cents: 4500, total_cents: 9000,
    rental_daily_cents: 3000, insurance_included: true, protection_daily_cents: 1500,
  });
});

test('an extra minute follows the server daily rounding and changes the one-day tariff', () => {
  const price = displayPrice(t1Model, start, end(1 + 1 / 1440), now);
  assert.equal(price.days, 2);
  assert.equal(price.daily_cents, 4500);
  assert.equal(price.total_cents, 9000);
  assert.equal(displayPrice(t1Model, start, end(2 + 1 / 1440), now).total_cents, 13500);
});

test('other models keep their own minimum period and optional protection is not silently added', () => {
  const model = {daily_cents: 4200, spec: {pricing: {minimum_days: 3}}};
  assert.equal(displayPrice(model, start, end(2), now), null);
  assert.deepEqual(displayPrice(model, start, end(3), now), {
    days: 3, daily_cents: 4200, total_cents: 12600,
    rental_daily_cents: 4200, insurance_included: false, protection_daily_cents: 0,
  });
});

test('display prices use the configured protection amount and do not hard-code T1 values', () => {
  const model = {daily_cents: 2200, spec: {pricing: {
    minimum_days: 2, insurance_included: true, insurance_daily_cents: 2500,
    single_day_enabled: true, single_day_rental_cents: 3500,
  }}};
  assert.equal(displayPrice(model, start, end(1), now).daily_cents, 6000);
  assert.equal(displayPrice(model, start, end(2), now).daily_cents, 4700);
  assert.equal(displayPrice(model, start, end(2), now).total_cents, 9400);
});

test('invalid or past periods and missing prices clear the estimate', () => {
  for (const [a, b, clock] of [
    ['', end(2), now], [start, '', now], [start, 'not-a-date', now],
    [start, end(-1), now], [start, end(0.99), now],
    [start, end(2), Date.parse(start) + 1],
  ]) assert.equal(displayPrice(t1Model, a, b, clock), null);
  for (const daily_cents of [null, 0, -1, 20.5]) {
    assert.equal(displayPrice({...t1Model, daily_cents}, start, end(2), now), null);
  }
  assert.equal(displayPrice({daily_cents: 3000, spec: {pricing: {minimum_days: 0}}}, start, end(2), now), null);
});
