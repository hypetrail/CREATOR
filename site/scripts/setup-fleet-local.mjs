import './sites-env.mjs';
import {mkdirSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {projectRoot} from './sites-env.mjs';

const localRoot = path.join(projectRoot, '.sites-runtime');
mkdirSync(localRoot, {recursive: true});
const config = path.join(localRoot, 'fleet-local.json');
writeFileSync(config, JSON.stringify({
  name: 'calori-go-local', compatibility_date: '2026-05-15',
  d1_databases: [{binding: 'DB', database_name: 'site-creator-d1',
    database_id: '00000000-0000-4000-8000-000000000000',
    migrations_dir: '../drizzle'}],
}, null, 2));
const result = spawnSync(process.execPath, [
  'node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB',
  '--local', '--config', config, '--persist-to', path.resolve(projectRoot, process.env.CALORI_LOCAL_STATE_PATH || '.wrangler/state'),
], {cwd: projectRoot, stdio: 'inherit', env: {...process.env, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || path.join(localRoot, 'config')}});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
