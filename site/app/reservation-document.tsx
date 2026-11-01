'use client';
import {useEffect,useState} from 'react';
import type {PdfReservation} from '../lib/reservation-pdf';
const emptyCustomer:Record<string,string>={};
export default function ReservationDocument({reservation,customer=emptyCustomer,admin=false,kind='reservation'}:{reservation:PdfReservation;customer?:Record<string,string>;admin?:boolean;kind?:'reservation'|'pickup_confirmation'}){
 const [url,setUrl]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let active=true,localUrl='';
  Promise.all([import('../lib/reservation-pdf'),fetch('/fonts/DejaVuSans.ttf').then(response=>{if(!response.ok)throw new Error('Fonte do PDF indisponível.');return response.arrayBuffer();})])
   .then(async([generator,font])=>{const bytes=await generator.createReservationPdf({reservation,customer,kind,fontBytes:new Uint8Array(font)});localUrl=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/pdf'}));if(active)setUrl(localUrl);else URL.revokeObjectURL(localUrl);})
   .catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Não foi possível gerar o PDF.');});
  return()=>{active=false;if(localUrl)URL.revokeObjectURL(localUrl);};
 },[reservation,customer,kind]);
 return <div className={admin?'fa-info':'go-terms'}><strong>{kind==='pickup_confirmation'?'Confirmação de retirada':'Documento da reserva'}</strong><p>Baixe uma via do PDF. Cláusulas ainda não aprovadas aparecem como rascunho. O resultado do envio por e-mail é informado separadamente.</p>{url?<a className={admin?'fa-button fa-secondary':'go-button go-secondary'} href={url} download={`${kind==='pickup_confirmation'?'Retirada':'Reserva'}-${reservation.code}.pdf`}>{kind==='pickup_confirmation'?'Baixar PDF da retirada':'Baixar PDF da reserva'}</a>:error?<p role="alert">{error}</p>:<p role="status">Gerando PDF…</p>}{url&&<p><a href={url} target="_blank" rel="noreferrer">Abrir PDF para imprimir</a></p>}{admin&&<p>Esta via contém os dados operacionais. Os dados do cliente devem vir do cadastro externo autorizado.</p>}</div>;
}
