import {hashCustomerPassword,verifyCustomerPassword} from './customer-auth';
import {whatsappConfiguration,type WhatsAppEnvironment} from './whatsapp-server';
import {siteOwnerId} from './site-owner';

export interface AdminEnvironment {DB?:D1Database;ADMIN_SETUP_KEY?:string;CUSTOMER_DATA_KEY?:string;CALORI_AUTH_MODE?:string}
interface Credential {password_hash:string;version:string}
const COOKIE='__Host-calori_admin',SESSION_MS=8*3_600_000;
const encoder=new TextEncoder();
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const digest=async(value:string)=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'};
const cookie=(token:string,maxAge=SESSION_MS/1000)=>`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
class AdminError extends Error {constructor(public status:number,message:string){super(message);}}
const credential=(db:D1Database)=>db.prepare("SELECT password_hash,version FROM admin_credentials WHERE id='owner'").first<Credential>();
function token(req:Request){const values=(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(COOKIE+'='));if(values.length!==1)return '';const t=values[0].slice(COOKIE.length+1);return /^[a-f0-9]{64}$/.test(t)?t:'';}
async function validSession(req:Request,db:D1Database){const t=token(req);if(!t)return false;return !!await db.prepare("SELECT s.token_hash FROM admin_sessions s JOIN admin_credentials c ON c.id='owner' AND c.version=s.credential_version WHERE s.token_hash=? AND s.expires_ms>?").bind(await digest(t),Date.now()).first();}
function redirect(location:string,setCookie?:string){return new Response(null,{status:303,headers:{...headers,Location:location,...(setCookie?{'Set-Cookie':setCookie}:{})}});}
function page(title:string,body:string,status=200,script=''){
 const nonce=random();
 return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · CaloriMob</title><style>body{margin:0;background:#f5f3ef;color:#27251f;font:16px system-ui;line-height:1.6}main{max-width:580px;margin:6vh auto;padding:28px;background:white;border-radius:20px}h1{line-height:1.2}label{display:block;margin:18px 0}input{box-sizing:border-box;display:block;width:100%;padding:12px;margin-top:6px;border:1px solid #aaa;border-radius:8px;font:inherit}button,.button{display:inline-block;background:#b94708;color:white;border:0;border-radius:8px;padding:12px 18px;font:inherit;cursor:pointer}a{color:#8c390e}small{display:block}.error{color:#a11}.note{background:#f5f3ef;padding:14px;border-radius:10px}code{overflow-wrap:anywhere}</style><main><a href="/">Calori Go</a><h1>${escape(title)}</h1>${body}</main>${script?`<script nonce="${nonce}">${script}</script>`:''}</html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`}});
}
function form(kind:'entrar'|'primeiro-acesso'|'recuperar',error=''){
 const title=kind==='entrar'?'Entrar na administração':kind==='primeiro-acesso'?'Criar acesso do administrador':'Recuperar acesso do administrador';
 return page(title,`${error?`<p role="alert" class="error">${escape(error)}</p>`:''}<p>${kind==='entrar'?'Use a senha do administrador da loja.':kind==='primeiro-acesso'?'Use a chave provisória cadastrada como segredo ADMIN_SETUP_KEY no painel Cloudflare. Ela só serve para autorizar a criação deste acesso.':'Cadastre uma nova chave provisória ADMIN_SETUP_KEY no painel do Worker antes de recuperar o acesso. Todos os acessos anteriores serão encerrados.'}</p><form method="post" action="/admin/${kind}">${kind!=='entrar'?'<label>Chave provisória de configuração<input name="setup_key" type="password" required maxlength="512" autocomplete="off"></label>':''}<label>${kind==='entrar'?'Senha':'Nova senha'}<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="${kind==='entrar'?'current-password':'new-password'}"></label>${kind!=='entrar'?'<label>Repita a nova senha<input name="confirmation" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label>':''}<button>${kind==='entrar'?'Entrar':kind==='primeiro-acesso'?'Criar acesso':'Redefinir senha'}</button></form>${kind==='entrar'?'<p><a href="/admin/recuperar">Esqueci minha senha</a></p>':'<p>Use uma senha de pelo menos 12 caracteres, sem sequências ou palavras comuns.</p>'}`);
}
async function readForm(req:Request){
 const url=new URL(req.url);
 if(req.headers.get('origin')!==url.origin||req.headers.get('sec-fetch-site')==='cross-site')throw new AdminError(403,'Origem da solicitação inválida.');
 if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))throw new AdminError(415,'Envie os dados pelo formulário.');
 const reader=req.body?.getReader();if(!reader)throw new AdminError(400,'Preencha o formulário.');let size=0;const parts:Uint8Array[]=[];
 while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>4096){await reader.cancel();throw new AdminError(413,'Formulário muito grande.');}parts.push(next.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new URLSearchParams(new TextDecoder().decode(bytes));
}
async function limit(req:Request,db:D1Database){
 const now=Date.now(),ip=req.headers.get('cf-connecting-ip')||'unknown';
 for(const [key,max]of [[await digest('admin:ip:'+ip),8],[await digest('admin:global'),64]] as const){
  const row=await db.prepare('INSERT INTO customer_auth_limits (key_hash,window_ms,count) VALUES (?,?,1) ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN window_ms<=? THEN 1 ELSE count+1 END,window_ms=CASE WHEN window_ms<=? THEN excluded.window_ms ELSE window_ms END RETURNING count').bind(key,now,now-900000,now-900000).first<{count:number}>();
  if(!row||row.count>max)throw new AdminError(429,'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
 }
}
async function setupAllowed(supplied:string,environment:AdminEnvironment){
 const expected=environment.ADMIN_SETUP_KEY;
 if(!expected||expected.length<32||expected.length>512)throw new AdminError(503,'Cadastre uma chave provisória de pelo menos 32 caracteres no segredo ADMIN_SETUP_KEY do Worker.');
 const a=await digest(supplied),b=await digest(expected);let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);if(diff)throw new AdminError(401,'Chave de configuração inválida.');
}
async function createSession(db:D1Database,expected:Credential){
 const t=random(),now=Date.now();
 const saved=await db.prepare("INSERT INTO admin_sessions (token_hash,credential_version,created_ms,expires_ms) SELECT ?,version,?,? FROM admin_credentials WHERE id='owner' AND password_hash=? AND version=? RETURNING token_hash").bind(await digest(t),now,now+SESSION_MS,expected.password_hash,expected.version).first();
 if(!saved)throw new AdminError(409,'O acesso mudou. Entre novamente com a senha atual.');
 await db.prepare('DELETE FROM admin_sessions WHERE expires_ms<=?').bind(now).run();return cookie(t);
}
/** Only enabled by the production build. Always discard caller identity headers. */
export async function adminPasswordBoundary(req:Request,environment:AdminEnvironment):Promise<Request|Response>{
 const cleanHeaders=new Headers(req.headers);for(const name of [...cleanHeaders.keys()])if(name.toLowerCase().startsWith('oai-authenticated-user-'))cleanHeaders.delete(name);
 const url=new URL(req.url),path=url.pathname;
 const protectedPath=path==='/admin'||path.startsWith('/admin/')||path==='/api/fleet/admin'||path.startsWith('/api/fleet/admin/')||path==='/api/rental'||path.startsWith('/api/rental/');
 if(path==='/signin-with-chatgpt')return redirect('/admin/entrar');
 if(path==='/signout-with-chatgpt')return redirect('/admin/sair');
 if(!protectedPath)return new Request(req,{headers:cleanHeaders});
 if(url.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))return page('Conexão segura necessária','<p>Abra o site usando HTTPS.</p>',503);
 const db=environment.DB;if(!db)return page('Banco ainda não configurado','<p>Conecte o banco D1 e aplique as migrações antes de acessar a administração.</p>',503);
 try{
  const existing=await credential(db),authenticated=await validSession(req,db);
  const kind=path==='/admin/primeiro-acesso'?'primeiro-acesso':path==='/admin/recuperar'?'recuperar':path==='/admin/entrar'?'entrar':null;
  if(kind){
   if(req.method==='GET'){
    if(kind==='primeiro-acesso'&&existing)return redirect('/admin/entrar');
    if(kind==='entrar'&&!existing)return redirect('/admin/primeiro-acesso');
    if(kind==='entrar'&&authenticated)return redirect('/admin');
    return form(kind);
   }
   if(req.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});
   const input=await readForm(req);await limit(req,db);
   const value=input.get('password')||'';
   if(encoder.encode(value).length>512||Array.from(value).length>128)throw new AdminError(400,'Confira a senha informada.');
   if(kind==='entrar'){
    if(!existing||!await verifyCustomerPassword(value,existing.password_hash))return form(kind,'Senha inválida.');
    return redirect('/admin',await createSession(db,existing));
   }
   if(kind==='primeiro-acesso'&&existing)throw new AdminError(409,'O acesso já foi criado. Entre com a senha cadastrada.');
   await setupAllowed(input.get('setup_key')||'',environment);
   if(value!==input.get('confirmation'))throw new AdminError(400,'As duas senhas precisam ser iguais.');
   let hash:string;try{hash=await hashCustomerPassword(value);}catch{throw new AdminError(400,'Use uma senha de 12 a 128 caracteres, evitando sequências e senhas comuns.');}
   const version=crypto.randomUUID(),now=Date.now();
   const saved=kind==='primeiro-acesso'
    ?await db.prepare("INSERT OR IGNORE INTO admin_credentials (id,password_hash,version,created_ms,updated_ms) VALUES ('owner',?,?,?,?) RETURNING version").bind(hash,version,now,now).first()
    :await db.prepare("UPDATE admin_credentials SET password_hash=?,version=?,updated_ms=? WHERE id='owner' AND version=? RETURNING version").bind(hash,version,now,existing?.version||'').first();
   if(!saved)throw new AdminError(409,'O acesso mudou. Atualize a página antes de continuar.');
   await db.prepare('DELETE FROM admin_sessions WHERE credential_version<>?').bind(version).run();
   return redirect('/admin/configuracao',await createSession(db,{password_hash:hash,version}));
  }
  if(path==='/admin/sair'){
   if(req.method==='GET')return page('Sair da administração','<form method="post"><button>Sair da conta</button></form>');
   if(req.method!=='POST')return new Response(null,{status:405,headers:{...headers,Allow:'GET, POST'}});
   await readForm(req);const t=token(req);if(t)await db.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(await digest(t)).run();return redirect('/admin/entrar',cookie('',0));
  }
  if(!authenticated){
   if(path.startsWith('/api/'))return Response.json({error:'Entre na administração para continuar.'},{status:401,headers});
   return redirect(existing?'/admin/entrar':'/admin/primeiro-acesso');
  }
  if(path==='/admin/configuracao'){
   if(req.method!=='GET')return new Response(null,{status:405,headers:{...headers,Allow:'GET'}});
   const preserved=await db.prepare('SELECT COUNT(*) n FROM reservation_customer_data').first<{n:number}>();
   const connection=whatsappConfiguration(environment as AdminEnvironment&WhatsAppEnvironment);
   const legacy=preserved?.n?`<p class="note">Há registros completos de versões anteriores. Preserve a chave CUSTOMER_DATA_KEY original para consultar esses arquivos. Ela não é exigida para novas reservas e uma chave nova não abre o histórico.</p>`:'';
   return page('Configuração da loja',`<p>O administrador usa senha própria. Clientes reservam sem conta, informando apenas WhatsApp e nome opcional.</p><p class="note">Depois do primeiro acesso, remova ADMIN_SETUP_KEY dos segredos do Worker. Para recuperar a senha administrativa, cadastre uma nova chave provisória e use /admin/recuperar.</p><h2>WhatsApp no servidor</h2><p>Conexão: <strong>${connection.provider==='configured'?'configurada':'pendente'}</strong>. Modelo de mensagem da locação: <strong>${connection.templates.rental==='configured'?'configurado':'pendente'}</strong>.</p><p>No Cloudflare, abra este Worker → Settings → Variables and Secrets. Cadastre WHATSAPP_ACCESS_TOKEN como Secret. Configure também WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION e WHATSAPP_TEMPLATE_RENTAL, além do idioma pt_BR quando aplicável. Use a conta WhatsApp Business da loja e um template utilitário aprovado. O token nunca deve ficar no código do site ou ser enviado pelo chat.</p><p>O painel Avisos acompanha confirmação, preparação, retirada, pendências e lembretes de devolução. O Worker processa a fila a cada cinco minutos depois de publicado.</p>${legacy}<p>As reservas usam somente o contato autorizado e dados da locação no D1 privado. Não é necessário criar uma nova chave de cadastro, conta de cliente, e-mail ou armazenamento R2 para esse fluxo. Documentação e assinatura serão conferidas na loja.</p><p><a class="button" href="/admin">Abrir painel da frota</a></p>`);

  }
  cleanHeaders.set('oai-authenticated-user-id',siteOwnerId);cleanHeaders.set('oai-authenticated-user-email','administrador@calorimob.local');cleanHeaders.set('oai-authenticated-user-full-name',encodeURIComponent('Administração CaloriMob'));cleanHeaders.set('oai-authenticated-user-full-name-encoding','percent-encoded-utf-8');
  return new Request(req,{headers:cleanHeaders});
 }catch(error){
  const status=error instanceof AdminError?error.status:503;
  const message=error instanceof AdminError?error.message:'Não foi possível acessar a administração. Confira a conexão D1 e as migrações da publicação.';
  return page('Acesso administrativo',`<p role="alert" class="error">${escape(message)}</p><p><a href="/admin/entrar">Voltar ao acesso</a></p>`,status);
 }
}
