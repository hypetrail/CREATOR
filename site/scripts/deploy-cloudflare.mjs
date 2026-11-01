import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import './sites-env.mjs';

const config='dist/server/wrangler.json';
if(!existsSync(config))throw new Error('Execute npm run build:cloudflare antes de publicar.');
const built=JSON.parse(readFileSync(config,'utf8'));
const databases=built.d1_databases?.filter(d=>d.binding==='DB')||[];
if(built.vars?.CALORI_AUTH_MODE!=='password'||databases.length!==1||databases[0].database_id==='00000000-0000-4000-8000-000000000000')throw new Error('O build não contém configuração de produção válida. Use npm run build:cloudflare.');
if(built.vars?.FLEET_OWNER_ID||built.vars?.ADMIN_SETUP_KEY||built.vars?.CUSTOMER_DATA_KEY)throw new Error('Segredos e identidade local não devem fazer parte do arquivo compilado. Cadastre os segredos nas configurações do Worker.');
const dryRun=process.argv.includes('--dry-run');
if(process.argv.slice(2).some(a=>a!=='--dry-run'))throw new Error('Argumento de publicação inválido.');
const run=(args)=>{
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js',...args],{stdio:'inherit',env:process.env});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
};
if(!dryRun){
 // Keep schema changes separate from the compiled asset location. Wrangler
 // records applied migrations; existing reservations are never reseeded here.
 const migrationConfig={name:built.name,compatibility_date:built.compatibility_date,d1_databases:built.d1_databases.map(d=>({...d,migrations_dir:resolve('drizzle')}))};
 const {mkdirSync,writeFileSync}=await import('node:fs');
 mkdirSync('.sites-runtime/cloudflare',{recursive:true});
 writeFileSync('.sites-runtime/cloudflare/migrations.json',JSON.stringify(migrationConfig));
 run(['d1','migrations','apply','DB','--remote','--config','.sites-runtime/cloudflare/migrations.json']);
}
run(['deploy','--config',config,...(dryRun?['--dry-run']:[])]);
