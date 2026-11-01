import {HttpError} from '../../../../lib/rental-server';
import * as accounts from '../../../../lib/customer-auth';
import * as storage from '../../../../lib/private-customer-store';
export const dynamic='force-dynamic';
async function readBody(req:Request){
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new HttpError(415,'Envie os dados em JSON.');
 if(Number(req.headers.get('content-length')||0)>8192)throw new HttpError(413,'Solicitação muito grande.');
 const reader=req.body?.getReader();if(!reader)throw new HttpError(400,'Dados ausentes.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>8192){await reader.cancel();throw new HttpError(413,'Solicitação muito grande.');}chunks.push(next.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let parsed:unknown;try{parsed=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'Dados inválidos.');}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new HttpError(400,'Dados inválidos.');
 return parsed as Record<string,unknown>;
}
async function handle(req:Request){
 try{
  accounts.requireCustomerOrigin(req);
  const path=new URL(req.url).pathname.replace(/^\/api\/customer\//,''),input=req.method==='POST'?await readBody(req):{};
  let result:Record<string,unknown>;
  if(req.method==='GET'&&path==='me'){
   const identity=await accounts.customerIdentity(req);
   result={customer:identity?accounts.publicCustomer(identity):null,phone_verification_configured:accounts.customerVerificationConfigured()};
  }
  else if(req.method==='GET'&&path==='reservations')result=await accounts.customerReservations(req);
  else if(req.method==='GET'&&path==='profile'){
   const identity=await accounts.requireCustomer(req),configured=storage.privateStorageConfigured();
   result={profile:configured?await storage.readCustomerProfile(identity.id):null,account_phone:identity.phone,storage_configured:configured};
  }
  else if(req.method==='POST'&&path==='profile'){
   const identity=await accounts.requireCustomer(req);
   if(Object.keys(input).some(key=>key!=='profile'))throw new HttpError(400,'Informe somente os campos do perfil.');
   result=await storage.saveCustomerProfile(identity.id,input.profile);
  }
  else if(req.method==='GET'&&path==='documents'){
   const identity=await accounts.requireCustomer(req);
   result=await storage.listPrivateDocumentsForCustomer(new URL(req.url).searchParams.get('reservation_id')||'',identity.id);
  }
  else if(req.method==='GET'&&path.startsWith('documents/')){
   const identity=await accounts.requireCustomer(req);
   return await storage.documentResponseForCustomer(path.slice('documents/'.length),identity.id);
  }
  else if(req.method==='GET'&&path==='offers'){await accounts.requireCustomer(req);result={offers:[]};}
  else if(req.method==='POST'&&path==='register')result=await accounts.registerCustomer(req,input);
  else if(req.method==='POST'&&path==='login')result=await accounts.loginCustomer(req,input);
  else if(req.method==='POST'&&path==='logout')result=await accounts.logoutCustomer(req);
  else if(req.method==='POST'&&path==='preferences')result=await accounts.customerPreferences(req,input);
  else if(req.method==='POST'&&path==='verify/request')result=await accounts.requestCustomerVerification(req,input);
  else if(req.method==='POST'&&path==='verify/confirm')result=await accounts.confirmCustomerVerification(req,input);
  else if(req.method==='POST'&&path==='password/request')result=await accounts.requestCustomerPasswordReset(req,input);
  else if(req.method==='POST'&&path==='password/reset')result=await accounts.resetCustomerPassword(req,input);
  else throw new HttpError(404,'Página não encontrada.');
  const {setCookie,...payload}=result,headers=new Headers(accounts.customerResponseHeaders);
  if(typeof setCookie==='string')headers.set('Set-Cookie',setCookie);
  return Response.json(payload,{headers});
 }catch(error){
  const status=error instanceof HttpError?error.status:400;
  return Response.json({error:error instanceof HttpError?error.message:'Não foi possível concluir. Confira os dados e tente novamente.'},{status,headers:accounts.customerResponseHeaders});
 }
}
export const GET=handle;
export const POST=handle;
