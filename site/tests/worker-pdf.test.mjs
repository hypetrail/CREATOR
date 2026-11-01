import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare,Log,LogLevel} from 'miniflare';
import {PDFDocument} from 'pdf-lib';

test('the actual Workers runtime fetches the bundled font without following redirects and produces a Unicode care PDF',async()=>{
 const compiled=await build({stdin:{contents:"import {loadPdfFont} from './lib/font-server'; import {createCareGuidePdf} from './lib/care-pdf'; export default {async fetch(request){try{const bytes=await createCareGuidePdf(await loadPdfFont(request.url));return new Response(bytes,{headers:{'Content-Type':'application/pdf'}});}catch(error){return new Response(error instanceof Error?error.message:'worker error',{status:503});}}}",resolveDir:process.cwd(),sourcefile:'worker-pdf-regression.ts'},bundle:true,platform:'browser',format:'esm',target:'es2022',write:false,external:['cloudflare:workers']});
 const font=readFileSync('public/fonts/DejaVuSans.ttf');let requests=0;
 const worker=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],log:new Log(LogLevel.NONE),serviceBindings:{ASSETS:async request=>{requests++;assert.equal(new URL(request.url).pathname,'/fonts/DejaVuSans.ttf');return new Response(font);}}});
 try{
  const response=await worker.dispatchFetch('https://calori.test/api/fleet/care-guide');assert.equal(response.status,200,response.status===200?'':await response.text());assert.equal(response.headers.get('Content-Type'),'application/pdf');
  const bytes=new Uint8Array(await response.arrayBuffer());assert.equal(Buffer.from(bytes.subarray(0,5)).toString(),'%PDF-');assert.equal((await PDFDocument.load(bytes)).getPageCount(),2);assert.equal(requests,1);
  assert.equal((await worker.dispatchFetch('https://calori.test/api/fleet/care-guide')).status,200);assert.equal(requests,1);
 }finally{await worker.dispose();}
 let redirects=0;
 const redirecting=new Miniflare({modules:true,script:compiled.outputFiles[0].text,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],log:new Log(LogLevel.NONE),serviceBindings:{ASSETS:async()=>{redirects++;return new Response(null,{status:302,headers:{Location:'https://not-followed.invalid/font.ttf'}});}}});
 try{const rejected=await redirecting.dispatchFetch('https://calori.test/api/fleet/care-guide');assert.equal(rejected.status,503);assert.equal(redirects,1);assert.match(await rejected.text(),/fonte.*indisponível/);}finally{await redirecting.dispose();}
});
