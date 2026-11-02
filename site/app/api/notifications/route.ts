import {env} from 'cloudflare:workers';
import {processOperationalNotifications} from '../../../lib/notification-server';
import type {WhatsAppEnvironment} from '../../../lib/whatsapp-server';
export const dynamic='force-dynamic';
async function equalSecret(a:string,b:string){
 const digest=(value:string)=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 const [left,right]=await Promise.all([digest(a),digest(b)]);const x=new Uint8Array(left),y=new Uint8Array(right);let diff=0;for(let i=0;i<x.length;i++)diff|=x[i]^y[i];return diff===0;
}
export async function POST(request:Request){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const secret=(env as Cloudflare.Env&WhatsAppEnvironment).NOTIFY_CRON_SECRET;
 if(!secret||secret.length<32)return Response.json({error:'Agendamento de notificações não configurado.'},{status:503,headers});
 const authorization=request.headers.get('authorization')||'';
 if(authorization.length>1024||!authorization.startsWith('Bearer ')||!await equalSecret(authorization.slice(7),secret))return Response.json({error:'Acesso não autorizado.'},{status:401,headers});
 try{return Response.json(await processOperationalNotifications({limit:20}),{headers});}
 catch{return Response.json({error:'Não foi possível processar as notificações. Consulte o painel.'},{status:503,headers});}
}
