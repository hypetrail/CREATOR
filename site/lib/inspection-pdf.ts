import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';

export interface InspectionPdfInput {
 id:string;code:string;model:string;color:string;unit:string;kind:'departure'|'return';created_ms:number;created_by:string;
 checks:Record<string,boolean>;notes:string;maintenance_required:boolean;
 photos:{id:string;mime:string;bytes:Uint8Array;sha256:string;uploaded_ms:number}[];fontBytes:Uint8Array;
}
const labels:Record<string,string>={brakes:'Freios',tires:'Pneus',lights:'Iluminação e setas',battery:'Bateria e recarga',charger:'Carregador',key:'Chave e acessórios',condition:'Conservação e avarias'};
const date=(value:number)=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(value);
export async function createInspectionPdf(input:InspectionPdfInput){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(input.fontBytes,{subset:true}),W=595.28,H=841.89,M=42;
 pdf.setTitle(`Vistoria ${input.kind==='departure'?'de saída':'de devolução'} — ${input.code}`);
 pdf.setAuthor('CaloriMob / Calori Go');
 let page=pdf.addPage([W,H]),y=H-55;
 const newPage=()=>{page=pdf.addPage([W,H]);y=H-55;};
 const text=(value:string,size=10)=>{
  for(const paragraph of value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').split('\n')){
   let line='';
   for(const word of paragraph.split(/\s+/)){
    if(!word)continue;
    for(const char of (line?' ':'')+word){
     if(font.widthOfTextAtSize(line+char,size)>W-M*2){if(y<55)newPage();page.drawText(line,{x:M,y,font,size});y-=15;line='';}
     line+=char;
    }
   }
   if(y<55)newPage();if(line)page.drawText(line,{x:M,y,font,size});y-=16;
  }
 };
 text('CALORI GO — REGISTRO DE VISTORIA',16);y-=8;
 text(input.kind==='departure'?'SAÍDA / ENTREGA AO CLIENTE':'RETORNO / DEVOLUÇÃO',12);
 text(`Reserva: ${input.code}\nModelo: ${input.model} · Cor: ${input.color}\nUnidade: ${input.unit}\nRegistro: ${input.id}\nRegistrado em: ${date(input.created_ms)} — horário de Brasília\nAdministrador responsável: ${input.created_by}`);
 y-=10;text('CONFERÊNCIAS REALIZADAS',11);
 for(const [key,label]of Object.entries(labels))text(`${input.checks[key]?'Conferido':'Não conferido'} — ${label}`);
 y-=10;text('OBSERVAÇÕES E IDENTIFICAÇÃO DOS EQUIPAMENTOS',11);text(input.notes||'Sem observações adicionais.');
 if(input.maintenance_required){y-=8;text('AVARIA OU FALHA: unidade bloqueada por segurança até revisão.',11);}
 y-=8;text('As marcações registram conferências realizadas; não declaram ausência de avarias. Horários das fotos abaixo são de envio ao sistema, sem atestar a data original da captura. Este registro não constitui assinatura do cliente.');
 y-=8;text('Ciência do cliente / responsável: ______________________________\nAdministrador: ______________________________________________');
 for(let index=0;index<input.photos.length;index++){
  const photo=input.photos[index];newPage();
  text(`FOTO ${index+1} DE ${input.photos.length} — ${input.code}`,13);
  text(`Arquivo: ${photo.id}\nEnviado em: ${date(photo.uploaded_ms)}\nSHA-256: ${photo.sha256}`,8);
  let embedded;
  if(photo.mime==='image/jpeg')embedded=await pdf.embedJpg(photo.bytes);
  else if(photo.mime==='image/png')embedded=await pdf.embedPng(photo.bytes);
  else throw new Error('O relatório exige fotos JPG ou PNG.');
  const scale=Math.min((W-2*M)/embedded.width,(y-75)/embedded.height);
  const width=embedded.width*scale,height=embedded.height*scale;
  page.drawImage(embedded,{x:(W-width)/2,y:y-height-8,width,height});
 }
 const pages=pdf.getPages();pages.forEach((p,index)=>p.drawText(`${input.code} · ${input.id} · ${index+1}/${pages.length}`,{x:M,y:25,font,size:8,color:rgb(.4,.4,.4)}));
 return pdf.save();
}
