import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
async function compile(path) {
  const result = await build({entryPoints: [path], bundle: true, platform: 'node', format: 'cjs', write: false});
  const module = {exports: {}};
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, require);
  return module.exports;
}
const {prepareIntake} = await compile('lib/intake.ts');
const {fleetPeriod, fleetCharges} = await compile('lib/fleet-pricing.ts');
const {t1Model} = await compile('lib/t1.ts');
const day = 86_400_000;
const start = new Date(Date.now() + 10 * day).toISOString();
const end = days => new Date(Date.parse(start) + days * day).toISOString();
const raw = {name: 'Cliente de Teste', cpf: '52998224725', phone: '19999999999', birth: '2000-01-01',
  cep: '13720146', street: 'Rua de Teste', number: '1', district: 'Centro', city: 'Cidade Teste', state: 'SP', consent: 'on', terms: 'on'};

test('T1 one-day intake includes its mandatory insurance once and prints the correct minimum', () => {
  const intake = prepareIntake(raw, t1Model, start, end(1), 'none');
  assert.match(intake.message, /Total: R\$\s*60,00/);
  assert.match(intake.message, /Aluguel: R\$\s*45,00/);
  assert.match(intake.message, /Seguro: R\$\s*15,00/);
  assert.doesNotMatch(intake.message, /lavagem incluída|pneu furado|seguro básico/);
  assert.match(intake.term, /mínimo é de 24 horas/);
  assert.doesNotMatch(intake.term, /Não foi selecionado seguro adicional/);
});
test('T1 rounds excess time into the next ordinary daily tier and rejects less than 24 hours', () => {
  assert.throws(() => fleetPeriod(t1Model, start, end(.99)), /24 horas/);
  const partial = fleetPeriod(t1Model, start, end(1 + 1 / 1440));
  assert.equal(partial.days, 2);
  assert.equal(fleetCharges(t1Model, partial.days).total_cents, 9000);
  const three = fleetPeriod(t1Model, start, end(2 + 1 / 1440));
  assert.equal(fleetCharges(t1Model, three.days).total_cents, 13500);
  assert.throws(() => fleetCharges(t1Model, 2, 'full'), /já inclui/);
});
