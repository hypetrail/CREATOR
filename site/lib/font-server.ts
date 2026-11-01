import {env} from 'cloudflare:workers';
import {HttpError} from './rental-server';

const MAX_FONT_BYTES=1_500_000;
let cached:Uint8Array|undefined;

/** Static Unicode font only: no customer data or credentials are sent here. */
export async function loadPdfFont(requestUrl:string):Promise<Uint8Array>{
 if(cached)return cached;
 const target=new URL('/fonts/DejaVuSans.ttf',requestUrl);
 if(target.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(target.hostname))throw new HttpError(503,'A geração do documento exige uma origem segura.');
 const assets=(env as Cloudflare.Env&{ASSETS?:{fetch(request:Request):Promise<Response>}}).ASSETS;
 const request=new Request(target,{redirect:'manual',signal:AbortSignal.timeout(10_000)});
 const response=assets?await assets.fetch(request):await fetch(request);
 if(!response.ok||Number(response.headers.get('content-length')||0)>MAX_FONT_BYTES)throw new HttpError(503,'A fonte do documento está indisponível.');
 const reader=response.body?.getReader();
 if(!reader)throw new HttpError(503,'A fonte do documento está indisponível.');
 let size=0;const chunks:Uint8Array[]=[];
 while(true){
  const next=await reader.read();if(next.done)break;
  size+=next.value.byteLength;
  if(size>MAX_FONT_BYTES){await reader.cancel();throw new HttpError(503,'A fonte do documento está indisponível.');}
  chunks.push(next.value);
 }
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 // The packaged font is a TrueType file; HTML or a redirect target is invalid.
 if(size<12||bytes[0]!==0||bytes[1]!==1||bytes[2]!==0||bytes[3]!==0)throw new HttpError(503,'A fonte do documento está indisponível.');
 cached=bytes;
 return bytes;
}
