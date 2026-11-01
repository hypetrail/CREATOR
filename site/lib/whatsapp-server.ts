import {phone} from './rental';

/** Configure only in the hosting secret manager; never accept these in requests. */
export interface WhatsAppEnvironment {
 WHATSAPP_ACCESS_TOKEN?:string;
 WHATSAPP_PHONE_NUMBER_ID?:string;
 WHATSAPP_API_VERSION?:string;
 WHATSAPP_TEMPLATE_LANGUAGE?:string;
 WHATSAPP_TEMPLATE_READY?:string;
 WHATSAPP_TEMPLATE_PREPARING?:string;
 WHATSAPP_TEMPLATE_RETURN_REMINDER?:string;
 WHATSAPP_TEMPLATE_AVAILABILITY?:string;
 WHATSAPP_TEMPLATE_CARE?:string;
 WHATSAPP_TEMPLATE_RENTAL?:string;
 WHATSAPP_TEMPLATE_AUTH?:string;
 WHATSAPP_TEMPLATE_INSPECTION?:string;
 INSPECTION_ARCHIVE_PHONE?:string;
 WHATSAPP_SITE_URL?:string;
 APP_PUBLIC_URL?:string;
 NOTIFY_CRON_SECRET?:string;
 RETURN_REMINDER_MINUTES?:string;
}
export type WhatsAppKind='preparing'|'ready'|'return_reminder'|'availability'|'care'|'rental';
export type WhatsAppResult={status:'submitted';provider_id:string}|{status:'not_configured'|'failed'|'uncertain';reason:string};
type Requester=typeof fetch;
const templateKeys:Record<WhatsAppKind,keyof WhatsAppEnvironment>={preparing:'WHATSAPP_TEMPLATE_PREPARING',ready:'WHATSAPP_TEMPLATE_READY',return_reminder:'WHATSAPP_TEMPLATE_RETURN_REMINDER',availability:'WHATSAPP_TEMPLATE_AVAILABILITY',care:'WHATSAPP_TEMPLATE_CARE',rental:'WHATSAPP_TEMPLATE_RENTAL'};
const safeTemplate=(value:unknown)=>typeof value==='string'&&/^[a-z][a-z0-9_]{0,99}$/.test(value);
function baseConfiguration(environment:WhatsAppEnvironment){
 const token=environment.WHATSAPP_ACCESS_TOKEN?.trim(),number=environment.WHATSAPP_PHONE_NUMBER_ID?.trim(),version=environment.WHATSAPP_API_VERSION?.trim(),language=environment.WHATSAPP_TEMPLATE_LANGUAGE?.trim()||'pt_BR';
 if(!token||token.length>4096||/[\x00-\x20\x7f]/.test(token)||!number||!/^\d{5,40}$/.test(number)||!version||!/^v\d{1,3}\.\d{1,2}$/.test(version)||!/^[-a-zA-Z_]{2,20}$/.test(language))return null;
 return {token,number,version,language};
}
export function whatsappConfiguration(environment:WhatsAppEnvironment){
 const ready=!!baseConfiguration(environment);
 return {provider:ready?'configured':'not_configured',templates:Object.fromEntries(Object.entries(templateKeys).map(([kind,key])=>[kind,ready&&safeTemplate(environment[key])?'configured':'not_configured'])),phone_verification:whatsappAuthConfigured(environment)?'configured':'not_configured',inspection_archive:inspectionArchiveConfigured(environment)?'configured':'not_configured'};
}
export function whatsappAuthConfigured(environment:WhatsAppEnvironment){return !!baseConfiguration(environment)&&safeTemplate(environment.WHATSAPP_TEMPLATE_AUTH);}
export function inspectionArchiveConfigured(environment:WhatsAppEnvironment){
 if(!baseConfiguration(environment)||!safeTemplate(environment.WHATSAPP_TEMPLATE_INSPECTION))return false;
 try{phone(environment.INSPECTION_ARCHIVE_PHONE);return true;}catch{return false;}
}
async function jsonResponse(response:Response){
 if(Number(response.headers.get('content-length')||0)>32_768)return null;
 const reader=response.body?.getReader();if(!reader)return null;
 let size=0;const parts:Uint8Array[]=[];
 while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>32_768){await reader.cancel();return null;}parts.push(next.value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{const value:unknown=JSON.parse(new TextDecoder().decode(bytes));return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:null;}catch{return null;}
}
async function submit(environment:WhatsAppEnvironment,to:string,template:string,components:unknown[],request:Requester):Promise<WhatsAppResult>{
 const config=baseConfiguration(environment);if(!config||!safeTemplate(template))return {status:'not_configured',reason:'whatsapp_not_configured'};
 let recipient:string;try{recipient=phone(to);}catch{return {status:'failed',reason:'whatsapp_phone_invalid'};}
 try{
  const response=await request(`https://graph.facebook.com/${config.version}/${config.number}/messages`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(20_000),headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'template',template:{name:template,language:{code:config.language},components}})});
  if(!response.ok)return response.status>=500||response.status===408?{status:'uncertain',reason:'whatsapp_delivery_uncertain'}:{status:'failed',reason:'whatsapp_provider_rejected'};
  const result=await jsonResponse(response),messages=result?.messages;
  const first=Array.isArray(messages)?messages[0] as Record<string,unknown>|undefined:undefined;
  if(!first||typeof first.id!=='string'||!/^[-A-Za-z0-9_.:=+/]{1,256}$/.test(first.id))return {status:'uncertain',reason:'whatsapp_delivery_uncertain'};
  return {status:'submitted',provider_id:first.id};
 }catch{return {status:'uncertain',reason:'whatsapp_delivery_uncertain'};}
}
/** Always use pre-approved templates; acceptance is not a delivery receipt. */
export async function sendWhatsAppTemplate({environment,to,kind,parameters}:{environment:WhatsAppEnvironment;to:string;kind:WhatsAppKind;parameters:string[]},request:Requester=fetch):Promise<WhatsAppResult>{
 const key=templateKeys[kind];if(!key)return {status:'failed',reason:'whatsapp_kind_invalid'};
 const template=environment[key];if(!baseConfiguration(environment)||!safeTemplate(template))return {status:'not_configured',reason:'whatsapp_not_configured'};
 if(!Array.isArray(parameters)||parameters.length>10||parameters.some(value=>typeof value!=='string'||value.length>1024||/[\x00-\x1f\x7f]/.test(value)))return {status:'failed',reason:'whatsapp_parameters_invalid'};
 return submit(environment,to,String(template),[{type:'body',parameters:parameters.map(value=>({type:'text',text:value}))}],request);
}
/** Code storage, expiry, authentication and attempt limits belong to the caller. */
export async function sendWhatsAppAuthCode({environment,to,code}:{environment:WhatsAppEnvironment;to:string;code:string},request:Requester=fetch):Promise<WhatsAppResult>{
 if(!whatsappAuthConfigured(environment))return {status:'not_configured',reason:'whatsapp_verification_not_configured'};
 if(!/^\d{6}$/.test(code))return {status:'failed',reason:'whatsapp_code_invalid'};
 return submit(environment,to,String(environment.WHATSAPP_TEMPLATE_AUTH),[{type:'body',parameters:[{type:'text',text:code}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]}],request);
}

/**
 * Upload a private inspection PDF and send an approved utility template with a
 * document header. The configured archive number is the only allowed recipient.
 * Uploads are not messages; an upload failure can be retried without sending.
 */
export async function sendInspectionArchivePDF({environment,to,documentBytes,filename,parameters}:{environment:WhatsAppEnvironment;to?:string;documentBytes:Uint8Array;filename:string;parameters:string[]},request:Requester=fetch):Promise<WhatsAppResult>{
 const config=baseConfiguration(environment);
 if(!config||!inspectionArchiveConfigured(environment))return {status:'not_configured',reason:'inspection_archive_not_configured'};
 let recipient:string;try{recipient=phone(environment.INSPECTION_ARCHIVE_PHONE);if(to&&phone(to)!==recipient)return {status:'failed',reason:'inspection_archive_recipient_invalid'};}catch{return {status:'failed',reason:'inspection_archive_recipient_invalid'};}
 if(!(documentBytes instanceof Uint8Array)||documentBytes.byteLength<5||documentBytes.byteLength>20*1024*1024||new TextDecoder().decode(documentBytes.subarray(0,5))!=='%PDF-'||!/^[-A-Za-z0-9_.]{1,100}\.pdf$/.test(filename))return {status:'failed',reason:'inspection_archive_document_invalid'};
 if(!Array.isArray(parameters)||parameters.length>10||parameters.some(value=>typeof value!=='string'||value.length>1024||/[\x00-\x1f\x7f]/.test(value)))return {status:'failed',reason:'whatsapp_parameters_invalid'};
 let mediaId:string;
 try{
  const body=new FormData();body.set('messaging_product','whatsapp');body.set('type','application/pdf');body.set('file',new File([new Uint8Array(documentBytes)],filename,{type:'application/pdf'}));
  const response=await request(`https://graph.facebook.com/${config.version}/${config.number}/media`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(30_000),headers:{Authorization:'Bearer '+config.token},body});
  if(!response.ok)return {status:'failed',reason:'inspection_archive_upload_rejected'};
  const result=await jsonResponse(response);
  if(!result||typeof result.id!=='string'||!/^\d{1,100}$/.test(result.id))return {status:'failed',reason:'inspection_archive_upload_invalid'};
  mediaId=result.id;
 }catch{return {status:'failed',reason:'inspection_archive_upload_unavailable'};}
 return submit(environment,recipient,String(environment.WHATSAPP_TEMPLATE_INSPECTION),[{type:'header',parameters:[{type:'document',document:{id:mediaId,filename}}]},{type:'body',parameters:parameters.map(value=>({type:'text',text:value}))}],request);
}
