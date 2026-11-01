'use client';

import {useState} from 'react';
import {fleetApi,formatPeriod} from '../lib/fleet-client';
import AdminCustomerData from './admin-customer-data';

interface PrivateDocument {id:string;kind:string;created_ms:number;document_version?:string}
const fields=[['name','Nome'],['cpf','CPF'],['birth','Nascimento'],['phone','WhatsApp'],['email','E-mail'],['street','Endereço'],['number','Número'],['complement','Complemento'],['district','Bairro'],['city','Cidade'],['state','UF'],['cep','CEP'],['guardian','Responsável'],['guardianCPF','CPF do responsável'],['guardianPhone','WhatsApp do responsável']] as const;

export default function AdminReservationPrivate({reservationId}:{reservationId:string}){
 const [customer,setCustomer]=useState<Record<string,string>|null>(null),[documents,setDocuments]=useState<PrivateDocument[]>([]);
 const [customerReady,setCustomerReady]=useState(false),[documentsReady,setDocumentsReady]=useState(false);
 const [notice,setNotice]=useState('');
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[errors,setErrors]=useState<string[]>([]);
 const load=async()=>{
  if(busy)return;setBusy(true);setErrors([]);
  const responses=await Promise.allSettled([
   fleetApi<{customer:Record<string,string>|null}>(`admin/customer-data?reservation_id=${encodeURIComponent(reservationId)}`),
   fleetApi<{documents:PrivateDocument[]}>(`admin/private-documents?reservation_id=${encodeURIComponent(reservationId)}`),
  ]);
  const failures:string[]=[];
  setCustomerReady(responses[0].status==='fulfilled');setDocumentsReady(responses[1].status==='fulfilled');
  if(responses[0].status==='fulfilled')setCustomer(responses[0].value.customer);else{setCustomer(null);failures.push(responses[0].reason instanceof Error?responses[0].reason.message:'Não foi possível consultar o cadastro protegido.');}
  if(responses[1].status==='fulfilled')setDocuments(responses[1].value.documents);else{setDocuments([]);failures.push(responses[1].reason instanceof Error?responses[1].reason.message:'Não foi possível consultar os documentos protegidos.');}
  setErrors([...new Set(failures)]);setLoaded(true);setBusy(false);
 };
 return <section className="fa-private-customer" aria-label="Cadastro e documentos protegidos da reserva">
  <h4>Cadastro e documentos protegidos</h4>
  <p className="fa-note">Consulta exclusiva do administrador. A identificação completa e os arquivos preservados ficam em área privada e não são incluídos em links de WhatsApp.</p>
  <div className="fa-row"><button type="button" className="fa-button fa-secondary" disabled={busy} onClick={()=>void load()}>{busy?'Consultando dados protegidos…':loaded?'Atualizar cadastro e documentos':'Consultar cadastro e documentos'}</button>{loaded&&<button type="button" className="fa-text" onClick={()=>{setCustomer(null);setDocuments([]);setLoaded(false);setNotice('');setCustomerReady(false);setDocumentsReady(false);setErrors([]);}}>Ocultar dados pessoais</button>}</div>
  {notice&&<p className="fa-info" role="status">{notice}</p>}
  {errors.map(message=><p key={message} className="fa-alert" role="alert">{message}</p>)}
  {loaded&&customer&&<dl className="fa-booking-details fa-private-fields">{fields.map(([key,label])=>customer[key]?<div key={key}><dt>{label}</dt><dd>{customer[key]}</dd></div>:null)}</dl>}
  {loaded&&customerReady&&!customer&&<><p>Nenhum cadastro completo foi preservado para esta reserva.</p><AdminCustomerData reservationId={reservationId} onSaved={async()=>{await load();setNotice('Cadastro preservado em área protegida. O PDF só é armazenado quando solicitado; confira os envios no painel de Avisos.');}}/></>}
  {loaded&&<div className="fa-private-documents"><h4>Arquivos preservados</h4>{documentsReady&&documents.length?<ul>{documents.map(document=><li key={document.id}><a href={`/api/fleet/admin/private-documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">{document.kind==='pickup_confirmation'?'PDF de confirmação de retirada':'PDF da reserva'}</a><span>{formatPeriod(document.created_ms)}{document.document_version?' · '+document.document_version:''}</span></li>)}</ul>:documentsReady?<p>Nenhum PDF preservado foi encontrado. A via operacional abaixo continua disponível para conferência.</p>:<p>A consulta dos arquivos não foi concluída.</p>}</div>}
 </section>;
}
