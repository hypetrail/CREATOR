'use client';

import {useState} from 'react';
import {fleetApi} from '../lib/fleet-client';
import {ageAt} from '../lib/intake';

const fields=[['name','Nome completo','text'],['cpf','CPF','text'],['phone','WhatsApp com DDD','tel'],['email','E-mail (opcional)','email'],['birth','Nascimento','date'],['cep','CEP','text'],['street','Rua ou avenida','text'],['number','Número ou S/N','text'],['district','Bairro','text'],['city','Cidade','text'],['state','UF','text'],['complement','Complemento (opcional)','text']] as const;
const guardianFields=[['guardian','Nome completo do pai ou da mãe'],['guardianCPF','CPF do pai ou da mãe'],['guardianPhone','WhatsApp do pai ou da mãe']] as const;
interface Props {reservationId:string;onSaved:()=>Promise<void>}

export default function AdminCustomerData({reservationId,onSaved}:Props){
 const [values,setValues]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reviewed,setReviewed]=useState(false),[generatePdf,setGeneratePdf]=useState(false);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let age:number|null=null;try{if(values.birth)age=ageAt(values.birth,today);}catch{/* The server validates incomplete or impossible dates. */}
 const set=(key:string,value:string)=>{setValues(previous=>({...previous,[key]:value}));setReviewed(false);};
 return <form className="fa-admin-customer" aria-label="Identificação do cliente da reserva" onSubmit={async event=>{
  event.preventDefault();if(busy)return;setError('');
  if(!reviewed){setError('Confira os dados e a autorização para o registro antes de salvar.');return;}
  setBusy(true);
  try{
   const customer={...values};
   if(age!==null&&age>=18){delete customer.guardian;delete customer.guardianCPF;delete customer.guardianPhone;delete customer.accompanied;}
   const result=await fleetApi<{customer_stored:boolean;document_saved:boolean}>('admin/customer-data',{reservation_id:reservationId,customer,generate_pdf:generatePdf,whatsapp_consent:true});
   if(!result.customer_stored||(generatePdf&&!result.document_saved))throw new Error('A operação não confirmou a preservação do cadastro e do PDF. Atualize a consulta antes de repetir.');
   await onSaved();
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível preservar a identificação.');}finally{setBusy(false);}
 }}><fieldset disabled={busy}><h4>Preencher identificação deste contrato</h4>
  <p>Registre os dados conferidos no atendimento de balcão. O primeiro cadastro preservado pertence a esta reserva; alterações posteriores do perfil não reescrevem o documento aceito.</p>
  <div className="fa-form-grid">{fields.map(([key,label,type])=><label key={key}>{label}<input name={key} type={type} required={!['complement','email'].includes(key)} value={values[key]||''} onChange={event=>set(key,event.target.value)} max={key==='birth'?today:undefined} maxLength={key==='email'?254:key==='state'?2:key==='cpf'?14:key==='cep'?9:160} autoComplete="off" inputMode={['cpf','cep'].includes(key)?'numeric':undefined}/></label>)}</div>
  {age!==null&&age<16&&<p className="fa-alert" role="alert">A política comercial não recebe solicitações de menores de 16 anos. Confira a data e os requisitos da unidade.</p>}
  {age!==null&&age>=16&&age<18&&<div className="fa-subsection"><h4>Pais na retirada</h4><p>Para 16 e 17 anos, registre os dados dos pais presentes e a assinatura prevista. A presença de um responsável não substitui os requisitos legais para conduzir a unidade.</p><div className="fa-form-grid">{guardianFields.map(([key,label])=><label key={key}>{label}<input name={key} required value={values[key]||''} onChange={event=>set(key,event.target.value)} maxLength={key==='guardianCPF'?14:160} autoComplete="off" inputMode={key==='guardianCPF'?'numeric':undefined}/></label>)}</div><label className="fa-check"><input type="checkbox" required checked={!!values.accompanied} onChange={event=>set('accompanied',event.target.checked?'on':'')}/>Os pais estarão presentes para conferência e assinatura na retirada.</label></div>}
  <label className="fa-check"><input type="checkbox" required checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>Conferi os dados com o cliente e tenho autorização para registrá-los e enviar as informações desta locação ao WhatsApp informado.</label>
  <label className="fa-check"><input type="checkbox" checked={generatePdf} onChange={event=>setGeneratePdf(event.target.checked)}/>Também gerar e guardar PDF protegido (opcional; exige armazenamento).</label>
  {error&&<p className="fa-alert" role="alert">{error}</p>}
  <button type="submit" className="fa-button" disabled={busy||!reviewed||(age!==null&&age<16)}>{busy?'Salvando cadastro…':'Salvar cadastro da reserva'}</button>
  <p className="fa-note">Esta ação preserva a identificação e prepara o WhatsApp autorizado. O PDF só será guardado se você marcar a opção. Ela não envia e-mail, não confirma pagamento e não substitui a assinatura ou a liberação da moto.</p>
 </fieldset></form>;
}
