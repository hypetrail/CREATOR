import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloudflareProductionConfig} from '../scripts/cloudflare-config.mjs';
const base=JSON.parse(readFileSync('wrangler.json','utf8'));
test('production build refuses placeholder databases and validates Cloudflare build variables',()=>{assert.throws(()=>cloudflareProductionConfig(base,{}),/CALORI_D1_DATABASE_ID/);assert.throws(()=>cloudflareProductionConfig(base,{CALORI_D1_DATABASE_ID:'invalid'}));const config=cloudflareProductionConfig(base,{CALORI_D1_DATABASE_ID:'11111111-1111-4111-8111-111111111111'});assert.equal(config.d1_databases[0].binding,'DB');assert.equal(config.vars.CALORI_AUTH_MODE,'password');assert.equal(config.assets.binding,'ASSETS');assert.equal(config.r2_buckets,undefined);assert.notEqual(config.d1_databases[0].database_id,base.d1_databases[0].database_id);assert.throws(()=>cloudflareProductionConfig(base,{CALORI_D1_DATABASE_ID:'11111111-1111-4111-8111-111111111111',CALORI_WORKER_NAME:'../bad'}));});
