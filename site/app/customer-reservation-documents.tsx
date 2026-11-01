'use client';

import {useState} from 'react';
import {customerApi,type CustomerPrivateDocument} from '../lib/customer-client';
import {formatPeriod} from '../lib/fleet-client';

export default function CustomerReservationDocuments({reservationId,showCareGuide=false}:{reservationId:string;showCareGuide?:boolean}){
  const [documents,setDocuments]=useState<CustomerPrivateDocument[]|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{const result=await customerApi<{documents:CustomerPrivateDocument[]}>(`documents?reservation_id=${encodeURIComponent(reservationId)}`);setDocuments(result.documents);}
    catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível consultar seus documentos.');}
    finally{setBusy(false);}
  };
  return <section className="ca-reservation-documents" aria-label="Documentos desta reserva"><h4>Seus documentos</h4><button type="button" className="ca-button ca-secondary" disabled={busy} onClick={()=>void load()}>{busy?'Consultando documentos…':documents?'Atualizar documentos':'Consultar documentos protegidos'}</button>
    {error&&<p className="ca-error" role="alert">{error}</p>}
    {documents&&(!documents.length?<p className="ca-help">Nenhum documento está disponível para consulta nesta reserva. Fale com a loja se precisar de uma via.</p>:<ul>{documents.map(document=><li key={document.id}><a href={`/api/customer/documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">{document.kind==='pickup_confirmation'?'Confirmação de retirada':'Documento da reserva'} · {formatPeriod(document.created_ms)}</a></li>)}</ul>)}
    {showCareGuide&&<p className="ca-help"><a href="/api/fleet/care-guide" target="_blank" rel="noreferrer">Baixar guia de cuidados da T1</a></p>}
  </section>;
}
