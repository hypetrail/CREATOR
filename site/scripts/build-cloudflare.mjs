import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {cloudflareProductionConfig} from './cloudflare-config.mjs';
import './sites-env.mjs';

try { cloudflareProductionConfig(JSON.parse(readFileSync('wrangler.json','utf8'))); }
catch(error) { console.error(error.message); process.exit(1); }
const result=spawnSync(process.execPath,[fileURLToPath(new URL('../node_modules/vinext/dist/cli.js',import.meta.url)),'build'],{stdio:'inherit',env:{...process.env,CALORI_DEPLOY_TARGET:'cloudflare'}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
