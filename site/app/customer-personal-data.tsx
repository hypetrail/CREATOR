'use client';

import {useEffect,useState} from 'react';
import {ageAt} from '../lib/intake';
import {customerApi,type CustomerIdentification} from '../lib/customer-client';

const fields=[
  ['name','Nome completo','text','name'],['cpf','CPF','text','off'],
  ['phone','WhatsApp da conta','tel','tel'],['email','E-mail (opcional)','email','email'],['birth','Nascimento','date','bday'],
  ['cep','CEP','text','postal-code'],['street','Rua ou avenida','text','address-line1'],['number','Número ou S/N','text','off'],
  ['district','Bairro','text','off'],['city','Cidade','text','address-level2'],['state','UF','text','address-level1'],
  ['complement','Complemento (opcional)','text','address-line2'],
];

export default function CustomerPersonalData(){
  const [values,setValues]=useState<CustomerIdentification>({}),[loading,setLoading]=useState(true),[configured,setConfigured]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    customerApi<{profile:CustomerIdentification|null;account_phone:string;storage_configured:boolean}>('profile').then(result=>{
      if(!active)return;
      setValues({...result.profile,phone:result.account_phone});setConfigured(result.storage_configured);
    }).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:'Não foi possível consultar seus dados.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  let age:number|null=null;
  try{age=ageAt(values.birth||'',new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));}catch{/* The incomplete date is validated when saved. */}
  const set=(key:string,value:string)=>{setNotice('');setValues(previous=>({...previous,[key]:value}));};
  if(loading)return <p role="status">Consultando seus dados protegidos…</p>;
  return <div className="ca-personal-data">
    <p>Confira os dados usados para preparar os próximos documentos. Alterar este cadastro não reescreve a identificação e as condições já registradas em reservas anteriores.</p>
    {error&&<p className="ca-error" role="alert">{error}</p>}{notice&&<p className="ca-info" role="status">{notice}</p>}
    {!configured?<p className="ca-info">O cadastro completo ainda não está disponível para consulta ou alteração. Fale com a loja para conferir sua identificação e os documentos.</p>:<form onSubmit={async event=>{
      event.preventDefault();if(busy)return;setBusy(true);setError('');setNotice('');
      try{
        const profile=age!==null&&age<18?values:{...values,guardian:'',guardianCPF:'',guardianPhone:'',accompanied:''};
        const result=await customerApi<{profile?:CustomerIdentification}>('profile',{profile});
        if(result.profile)setValues(result.profile);
        setNotice('Cadastro atualizado. As próximas fichas poderão usar estes dados; documentos de reservas anteriores mantêm seus registros.');
      }catch(cause){setError(cause instanceof Error?cause.message:'Confira seus dados.');}finally{setBusy(false);}
    }}><fieldset disabled={busy}><div className="ca-personal-fields">{fields.map(([key,label,type,autoComplete])=><label key={key}>{label}<input name={`profile-${key}`} type={type} autoComplete={autoComplete} required={!['complement','email'].includes(key)} readOnly={key==='phone'} maxLength={key==='email'?254:key==='state'?2:key==='cpf'?14:key==='cep'?9:160} inputMode={['cpf','cep'].includes(key)?'numeric':undefined} value={values[key]||''} onChange={event=>set(key,event.target.value)}/></label>)}</div>
      {age!==null&&age<18&&<div className="ca-personal-guardian"><h3>Pais ou responsável legal</h3><p>A presença e a assinatura exigidas na retirada não dispensam os requisitos legais de condução do modelo.</p><div className="ca-personal-fields">{[['guardian','Nome completo'],['guardianCPF','CPF'],['guardianPhone','WhatsApp']].map(([key,label])=><label key={key}>{label}<input name={`profile-${key}`} required maxLength={160} value={values[key]||''} onChange={event=>set(key,event.target.value)}/></label>)}</div><label className="ca-check"><input type="checkbox" required checked={!!values.accompanied} onChange={event=>set('accompanied',event.target.checked?'on':'')}/>Confirmo que os pais ou responsável legal estarão presentes para a conferência e assinatura exigidas.</label></div>}
      <button className="ca-button" disabled={busy}>{busy?'Salvando cadastro…':'Salvar dados do cadastro'}</button>
    </fieldset></form>}
  </div>;
}
