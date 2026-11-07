import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloudflareProductionConfig} from '../scripts/cloudflare-config.mjs';
const base=JSON.parse(readFileSync('wrangler.json','utf8'));
const freshId='11111111-1111-4111-8111-111111111111';

test('a new installation refuses deployment before its D1 has been configured',()=>{
 const unconfigured={...base,d1_databases:[{...base.d1_databases[0],database_id:'00000000-0000-4000-8000-000000000000'}]};
 assert.throws(()=>cloudflareProductionConfig(unconfigured,{}),/CALORI_D1_DATABASE_ID/);
 for(const value of ['invalid','00000000-0000-4000-8000-000000000000']){
  assert.throws(()=>cloudflareProductionConfig(base,{CALORI_D1_DATABASE_ID:value}),/CALORI_D1_DATABASE_ID/);
 }
});

test('the new database can be configured in the repository without build variables',()=>{
 const configured={...base,d1_databases:[{...base.d1_databases[0],database_id:freshId}]};
 const config=cloudflareProductionConfig(configured,{});
 assert.equal(config.d1_databases[0].database_id,freshId);
 assert.equal(config.d1_databases.length,1);
 assert.equal(config.d1_databases[0].binding,'DB');
});

test('a build override selects the database and retains runtime settings across updates',()=>{
 const config=cloudflareProductionConfig(base,{CALORI_D1_DATABASE_ID:freshId});
 assert.equal(config.d1_databases[0].database_id,freshId);
 assert.equal(config.vars.CALORI_AUTH_MODE,'password');
 assert.equal(config.keep_vars,true);
 assert.equal(config.assets.binding,'ASSETS');
 assert.equal(config.r2_buckets,undefined);
 assert.throws(()=>cloudflareProductionConfig(base,{CALORI_D1_DATABASE_ID:freshId,CALORI_WORKER_NAME:'../bad'}));
});
