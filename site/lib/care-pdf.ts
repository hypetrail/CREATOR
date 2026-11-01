import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {defaultCareGuide,parseCareGuide,type CareGuide} from './care-guide';

/** Creates a real, Unicode PDF. The caller can supply the reservation's guide. */
export async function createCareGuidePdf(fontBytes:Uint8Array,guide:CareGuide=defaultCareGuide){
 const saved=parseCareGuide(guide),pdf=await PDFDocument.create();
 pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(fontBytes,{subset:true});
 pdf.setTitle(saved.title);pdf.setAuthor('CaloriMob / Calori Go');
 pdf.setSubject('Orientações básicas de conservação, recarga e devolução da T1');
 const W=595.28,H=841.89,M=44,body=10,lineHeight=15;
 let page=pdf.addPage([W,H]),y=H-76;
 const newPage=()=>{page=pdf.addPage([W,H]);y=H-76;};
 const write=(value:string,size=body,color=rgb(.12,.17,.14))=>{
  const clean=value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');
  const fits=(text:string)=>font.widthOfTextAtSize(text,size)<=W-2*M;
  const line=(text:string)=>{if(y<65)newPage();page.drawText(text,{x:M,y,font,size,color});y-=lineHeight;};
  for(const paragraph of clean.split('\n')){
   let pending='';
   for(const word of paragraph.split(/\s+/)){
    if(!word)continue;
    if(!fits(word)){
     if(pending){line(pending);pending='';}
     let chunk='';
     for(const character of word){if(chunk&&!fits(chunk+character)){line(chunk);chunk='';}chunk+=character;}
     pending=chunk;
    }else if(fits(pending?pending+' '+word:word)){pending=pending?pending+' '+word:word;}
    else{line(pending);pending=word;}
   }
   if(pending)line(pending);else y-=8;
  }
 };
 const section=(title:string,text:string)=>{
  if(y<125)newPage();y-=10;write(title.toUpperCase(),11,rgb(.08,.4,.21));y-=3;write(text);
 };
 write('GUIA DE CUIDADOS',18);y-=8;write(saved.title,12);y-=7;
 write(saved.contact);write('Leia antes de utilizar e mantenha estas orientações acessíveis durante a locação.');
 for(const [index,item] of saved.sections.entries())section(`${index+1}. ${item.title}`,item.text);
 section('Fontes e condições de utilização',saved.source_notes.join('\n\n'));
 pdf.getPages().forEach((item,index)=>{
  item.drawText('CALORI GO — CUIDADOS COM A T1',{x:M,y:H-36,font,size:9,color:rgb(.12,.36,.23)});
  item.drawText(`${saved.version}  |  ${index+1}/${pdf.getPageCount()}`,{x:M,y:32,font,size:9,color:rgb(.4,.4,.4)});
 });
 return pdf.save();
}
