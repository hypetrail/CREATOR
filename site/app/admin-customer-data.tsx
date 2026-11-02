'use client';

import {useState} from 'react';
import {fleetApi} from '../lib/fleet-client';

export interface ReservationContact {
 name?:string;
 phone:string;
 whatsapp_consent?:boolean;
 revoked_ms?:number|null;
}
interface Props {reservationId:string;contact?:ReservationContact|null;onSaved:()=>Promise<void>;disabled?:boolean}

export default function AdminCustomerData({reservationId,contact,onSaved,disabled=false}:Props){
 const [name,setName]=useState(contact?.name||''),[phone,setPhone]=useState(contact?.phone||'');
 const [reviewed,setReviewed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <form className="fa-admin-customer" aria-label="Contato da reserva" onSubmit={async event=>{
  event.preventDefault();if(busy||disabled)return;setError('');
  if(!reviewed){setError('Confirme o contato e a autorização para os avisos desta reserva.');return;}
  setBusy(true);
  try{
   await fleetApi('admin/contact',{reservation_id:reservationId,contact:{name,phone},whatsapp_consent:true});
   await onSaved();
  }catch(cause){setError(cause instanceof Error?cause.message:'Não foi possível salvar o contato da reserva.');}
  finally{setBusy(false);}
 }}><fieldset disabled={busy||disabled}><h4>{contact?'Conferir contato da reserva':'Registrar contato da reserva'}</h4>
  <p>Use somente o WhatsApp para o atendimento desta locação. O nome é opcional; a identificação e a assinatura são conferidas na loja.</p>
  <div className="fa-form-grid"><label>WhatsApp com DDD<input name="contact-phone" type="tel" required maxLength={30} autoComplete="tel" value={phone} onChange={event=>{setPhone(event.target.value);setReviewed(false);}}/></label><label>Nome para atendimento (opcional)<input name="contact-name" maxLength={100} autoComplete="name" value={name} onChange={event=>{setName(event.target.value);setReviewed(false);}}/></label></div>
  <label className="fa-check"><input type="checkbox" required checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>Conferi o número com o cliente e tenho autorização para os avisos operacionais desta reserva pelo WhatsApp. Esta autorização não inclui ofertas.</label>
  {error&&<p className="fa-alert" role="alert">{error}</p>}
  <button type="submit" className="fa-button" disabled={busy||disabled||!reviewed}>{busy?'Salvando contato…':'Salvar contato e autorização'}</button>
  <p className="fa-note">Corrigir o contato não reenvia automaticamente mensagens já aceitas ou com resultado incerto. O envio automático depende da API do WhatsApp configurada no servidor. Salvar o contato não confirma pagamento nem libera a retirada.</p>
 </fieldset></form>;
}
