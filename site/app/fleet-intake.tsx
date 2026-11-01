'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
import {ageAt, prepareIntake} from '../lib/intake';
import {fleetApi, formatMoney, formatPeriod, type FleetBooking, type FleetColor, type FleetModel, type FleetQuote} from '../lib/fleet-client';
import {reservationWhatsAppParts,type WhatsAppPart} from '../lib/reservation-whatsapp';
import ReservationDocument from './reservation-document';
import {pricingPolicy} from '../lib/fleet-pricing';
import {documentSections} from '../lib/document-policy';
import CustomerAccess from './customer-access';
import {customerApi, type CustomerProfile} from '../lib/customer-client';
import './customer-portal.css';

type FormValues = Record<string, string>;
type LinkedFleetBooking = FleetBooking;
type DocumentDelivery = {status:'submitted'|'sent'|'not_configured'|'failed'|'already_sent'|'processing'|'uncertain'|'queued';message:string;customer_linked?:boolean;customer_stored?:boolean;contact_saved?:boolean;document_saved?:boolean;parts?:WhatsAppPart[]};
const successfulDelivery = (delivery:DocumentDelivery|null) => !!delivery && ['submitted','sent','already_sent','queued'].includes(delivery.status);
interface Props {
  model: FleetModel;
  color: FleetColor;
  start: string;
  end: string;
  quote: FleetQuote;
  onReserved: () => void;
  disabled?: boolean;
}
const fields = [
  ['name', 'Nome completo', 'text', 'name'], ['cpf', 'CPF', 'text', 'off'],
  ['phone', 'WhatsApp com DDD', 'tel', 'tel'], ['email', 'E-mail (opcional)', 'email', 'email'], ['birth', 'Nascimento', 'date', 'bday'],
  ['cep', 'CEP', 'text', 'postal-code'], ['street', 'Rua ou avenida', 'text', 'address-line1'],
  ['number', 'Número (ou S/N)', 'text', 'off'], ['district', 'Bairro', 'text', 'off'],
  ['city', 'Cidade', 'text', 'address-level2'], ['state', 'UF', 'text', 'address-level1'],
  ['complement', 'Complemento (opcional)', 'text', 'address-line2'],
];

export default function FleetIntake({model, color, start, end, quote, onReserved, disabled = false}: Props) {
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<LinkedFleetBooking | null>(null);
  const [packet, setPacket] = useState<ReturnType<typeof prepareIntake> | null>(null);
  const request = useRef<{signature: string; key: string} | null>(null);
  const [copied, setCopied] = useState(false),[showPdf,setShowPdf]=useState(false);
  const [delivery, setDelivery] = useState<DocumentDelivery|null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [account, setAccount] = useState<CustomerProfile | null>(null), [accountLoading, setAccountLoading] = useState(true);
  const [profileNotice,setProfileNotice]=useState('');
  const [accessNotice,setAccessNotice]=useState('');
  const policy = pricingPolicy(model);
  const minimumHours = 24 * (policy.single_day_enabled ? 1 : policy.minimum_days);
  let age: number | null = null;
  try { age = ageAt(values.birth || '', new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date())); } catch { /* An incomplete field has no age. */ }
  const documentCustomer = useMemo(() => age !== null && age < 18 ? values : {...values, guardian: '', guardianCPF: '', guardianPhone: ''}, [values, age]);
  const set = (name: string, value: string) => setValues(previous => ({...previous, [name]: value}));
  useEffect(() => {
    let active = true;
    customerApi<{customer:CustomerProfile | null}>('me').then(result => {if (active) setAccount(result.customer);})
      .catch(() => { /* Access remains optional when the account service is unavailable. */ })
      .finally(() => {if (active) setAccountLoading(false);});
    return () => {active = false;};
  }, []);
  const accountId=account?.id;
  useEffect(()=>{
    if(!accountId)return;
    let active=true;
    customerApi<{profile:Record<string,string>|null;account_phone?:string;storage_configured:boolean}>('profile').then(result=>{
      if(!active)return;
      const saved=result.profile||{};
      setValues(previous=>{
        const next={...previous};
        for(const key of [...fields.map(field=>field[0]),'guardian','guardianCPF','guardianPhone']){
          if(!next[key]&&typeof saved[key]==='string')next[key]=saved[key];
        }
        if(!next.phone&&result.account_phone)next.phone=result.account_phone;
        return next;
      });
      setProfileNotice(result.profile?'Seus dados salvos foram preenchidos nos campos que estavam vazios. Confira antes de confirmar.':'');
    }).catch(()=>{if(active)setProfileNotice('Não foi possível recuperar seus dados salvos. Você pode preencher a ficha abaixo.');});
    return()=>{active=false;};
  },[accountId]);
  const connected = (customer:CustomerProfile, phone:string, notice?:string) => {
    setAccessNotice(notice||'');
    setAccount(customer);
    setValues(previous => previous.phone ? previous : {...previous, phone});
  };

  const buildPacket = (raw: FormValues, result: FleetBooking) => {
    const draft = prepareIntake(raw, {...model, name: model.name+(model.spec.color_selection!==false?` · ${color.name}`:'')}, start, end, quote.insurance, {requireEmail:false});
    let snapshot: {address?: string; coverage?: string; minimum_hours?: number;document?:{clauses?:{delay?:string}}} = {};
    try {snapshot = JSON.parse(result.terms_snapshot || '{}');} catch { /* Preserve the quoted conditions for older records. */ }
    const address = snapshot.address || quote.settings.address;
    const coverage = snapshot.coverage || quote.settings.coverage;
    const acceptedMinimum = snapshot.minimum_hours || minimumHours;
    const summary = draft.summary.replaceAll(draft.code, result.code).replace(/Local de retirada: .*/, `Local de retirada: ${address}`);
    const delay = snapshot.document?.clauses?.delay || quote.document_policy?.clauses.delay || 'Atrasos e prorrogações: consulte as condições preservadas da reserva e fale com a loja antes do prazo de devolução.';
    const conditions = `Número da reserva: ${result.code}\nUnidade: ${result.unit_label}${model.spec.color_selection!==false?`\nCor: ${color.name}`:''}\nSituação: reservada, aguardando preparação\nPagamento: PENDENTE — exclusivamente na loja\nCondições aceitas: ${result.terms_version || 'rental-v1'}\n\nREGRAS DA RESERVA\nDiárias de 24 horas, mínimo de ${acceptedMinimum} horas; frações adicionais contam uma nova diária.\nAguarde a liberação da loja antes de se deslocar para retirar a moto.\nA loja conferirá documentação, elegibilidade, vistoria e condições contratuais na retirada.\n${quote.insurance === 'none' ? 'Seguro adicional não contratado.' : coverage}\n${delay}\nCancelamento e devolução antecipada: consulte a loja antes da retirada. Não há cobrança antecipada por este site.\nEste comprovante não comprova pagamento nem substitui contrato, vistoria ou apólice.\n`;
    const message = `Olá, Calori Go! Registrei minha reserva no site.\n\nReserva: ${result.code}\nMoto: ${model.brand} ${model.name}${model.spec.color_selection!==false?' · '+color.name:''}\nUnidade: ${result.unit_label}\nRetirada prevista: ${formatPeriod(result.start_ms)}\nDevolução prevista: ${formatPeriod(result.end_ms)}\nTotal: ${formatMoney(result.total_cents)}\nPagamento: pendente, exclusivamente na loja.\n\nAguardo a liberação da moto para retirada. A identificação completa está no cadastro protegido da reserva.`;
    const term = `CALORI GO — COMPROVANTE DE RESERVA\n\n${summary}\n\n${conditions}\nOs dados desta ficha foram preenchidos pelo cliente e serão conferidos pela loja.\n\nCliente: __________________________\nResponsável, quando aplicável: __________________________\nCalori Go: __________________________`;
    return {...draft, code: result.code, summary, message, term};
  };

  const sendDocument = async (result:FleetBooking,customer:Record<string,string>) => {
    if(deliveryBusy || delivery?.customer_stored)return;
    setDeliveryBusy(true);
    try {
      const response=await fleetApi<DocumentDelivery>('contact',{reservation_id:result.id,delivery_token:result.delivery_token,customer,whatsapp_consent:true});
      setDelivery({...response,customer_stored:response.customer_stored===true||response.contact_saved===true});
    } catch (cause) {
      setDelivery({status:'failed',message:cause instanceof Error?cause.message:'A reserva foi registrada, mas falta salvar a identificação. Confira os dados e tente novamente.'});
    } finally {setDeliveryBusy(false);}
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (busy || deliveryBusy) return;
    try {
      // The stock service receives only commercial data. Identification is
      // sent separately for protected storage and generation of documents.
      const prepared=prepareIntake(values, {...model, name: model.name+(model.spec.color_selection!==false?` · ${color.name}`:'')}, start, end, quote.insurance, {requireEmail:false});
      if (booking) {
        setPacket(buildPacket(values, booking));
        if(!successfulDelivery(delivery))await sendDocument(booking,prepared.customer);
        return;
      }
      setBusy(true);
      const payload = {model_id: model.id, color: color.id, start, end, insurance: quote.insurance,
        expected_daily_cents: quote.daily_cents, expected_total_cents: quote.total_cents,
        terms_accepted: true, terms_version: 'rental-v1', expected_terms_token: quote.terms_token};
      const signature = JSON.stringify(payload);
      if (request.current?.signature !== signature) request.current = {signature, key: crypto.randomUUID()};
      const result = await fleetApi<LinkedFleetBooking>('reservations', {...payload, request_key: request.current.key});
      setBooking(result);
      setPacket(buildPacket(values, result));
      onReserved();
      await sendDocument(result,prepared.customer);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Confira os dados da reserva.'); }
    finally { setBusy(false); }
  };

  if (packet && booking) return <section className="go-receipt" aria-live="polite">
    <span className="go-eyebrow">RESERVA REGISTRADA</span><h2>Seu próximo caminho está reservado.</h2>
    <p>A moto foi separada para o período. <strong>Aguarde a liberação da loja antes de ir retirar.</strong></p>
    {booking.account_linked && <div className="ca-intake-account"><strong>Sua reserva está vinculada à sua conta.</strong><p>Depois da retirada, acompanhe o tempo da locação em <a href="/minha-conta">Minhas reservas</a>.</p></div>}
    <div className="go-code"><small>APRESENTE ESTE NÚMERO NA LOJA</small><strong>{booking.code}</strong>
      <button type="button" className="go-button go-secondary" onClick={async () => {try {await navigator.clipboard.writeText(booking.code); setCopied(true);} catch {setError('Copie o número exibido acima.');}}}>{copied ? 'Número copiado' : 'Copiar número'}</button></div>
    <dl className="go-specs"><div><dt>Moto</dt><dd>{model.name}{model.spec.color_selection!==false?` · ${color.name}`:''}</dd></div><div><dt>Retirada prevista</dt><dd>{formatPeriod(booking.start_ms)}</dd></div><div><dt>Devolução</dt><dd>{formatPeriod(booking.end_ms)}</dd></div><div><dt>Total</dt><dd>{formatMoney(booking.total_cents)}</dd></div><div><dt>Pagamento</dt><dd>Pendente · na loja</dd></div></dl>
    <div className="go-terms" aria-live="polite"><strong>Reserva e orientações pelo WhatsApp</strong>
      <p>{deliveryBusy?'Registrando cadastro e preparando as mensagens…':delivery?.message||'Aguardando registro do cadastro.'}</p>
      <p>Não é necessário e-mail. As informações da locação, as regras, as especificações e os cuidados podem ser enviados em mensagens de texto. O envio automático depende da API do WhatsApp da loja.</p>
      {!delivery?.customer_stored&&!deliveryBusy&&<button type="button" className="go-button go-secondary" onClick={async()=>{
        try {const prepared=prepareIntake(values,model,start,end,quote.insurance,{requireEmail:false});await sendDocument(booking,prepared.customer);}catch(cause){setError(cause instanceof Error?cause.message:'Confira os dados da ficha.');}
      }}>Salvar cadastro e preparar WhatsApp</button>}
    </div>
    <details className="go-terms"><summary>Conferir textos da reserva, regras e cuidados</summary>{(delivery?.parts||reservationWhatsAppParts(booking as Parameters<typeof reservationWhatsAppParts>[0],'reservation')).map((part,index)=><section key={index}><strong>{part.title}</strong><p>{part.text}</p></section>)}</details>
    {delivery?.customer_stored&&<p className="go-fine" role="status">Seu cadastro completo foi registrado em área protegida e vinculado ao código da reserva.{delivery.document_saved?' O documento também foi salvo para consulta autorizada.':''} Correções posteriores devem ser conferidas com a loja.</p>}
    <p>Você também pode abrir um resumo da reserva no WhatsApp para falar com a equipe. Esse resumo contém o número da reserva e os dados da locação. CPF e endereço completo ficam fora da mensagem.</p>
    <div className="go-actions"><a className="go-button go-primary" target="_blank" rel="noreferrer" href={`https://wa.me/${quote.settings.whatsapp}?text=${encodeURIComponent(packet.message)}`}>Enviar resumo pelo WhatsApp ↗</a>
      <button type="button" className="go-button go-text" onClick={() => setPacket(null)}>Corrigir dados da ficha</button></div>
    <button type="button" className="go-button go-secondary" onClick={()=>setShowPdf(previous=>!previous)}>Gerar uma via em PDF (opcional)</button>{showPdf&&<ReservationDocument reservation={booking} customer={documentCustomer}/>}
    {model.id==='t1'&&<p><a className="go-button go-secondary" href="/api/fleet/care-guide" target="_blank" rel="noreferrer">Baixar guia de cuidados da T1</a></p>}
    <details><summary>Conferir resumo para WhatsApp</summary><pre>{packet.message}</pre></details>
    <p className="go-fine">A reserva, a identificação e os documentos são destinados ao atendimento da locação, com acesso protegido para a empresa e, nas reservas vinculadas, para sua conta. O envio pelo WhatsApp depende da conexão da loja e da situação informada acima. O documento não comprova pagamento.</p>
    {error && <p className="go-error" role="alert">{error}</p>}
  </section>;

  return <>{accountLoading ? <p className="go-fine" role="status">Conferindo seu acesso para acompanhar reservas…</p> : account ? <div className="ca-intake-account"><strong>Você está conectado: {account.phone_masked}</strong><p>As novas reservas feitas neste acesso poderão ser acompanhadas em <a href="/minha-conta" target="_blank" rel="noreferrer">Minhas reservas</a>, inclusive o tempo restante após a retirada.</p>{accessNotice&&<p role="status">{accessNotice}</p>}{profileNotice&&<p role="status">{profileNotice}</p>}</div> : <details className="ca-intake-access"><summary>Entrar ou criar conta para acompanhar a reserva (opcional)</summary><CustomerAccess compact onAuthenticated={connected}/><p className="go-fine">Você também pode continuar sem conta. Uma reserva feita sem acesso não é vinculada automaticamente ao criar uma conta depois.</p></details>}
  <form className="go-intake" onSubmit={submit}>
    <h2>{booking ? 'Corrigir a ficha' : 'Seus dados para a retirada'}</h2>
    <p>{booking ? 'Seu número e o período reservado continuam iguais. Corrija sua ficha para a loja.' : 'Preencha sua identificação e confirme a reserva. A moto e os valores já correspondem à sua escolha. O pagamento será feito apenas na loja.'}</p>
    {booking&&(successfulDelivery(delivery)||delivery?.customer_stored)&&<p>Os dados e documentos já registrados mantêm a identificação original desta reserva. As correções abaixo atualizam a ficha nesta página; peça à loja a conferência da alteração.</p>}
    <div className="go-field-grid">{fields.map(([name, label, type, autoComplete]) => <label key={name}>{label}<input name={name} type={type} autoComplete={autoComplete}
      required={!['complement','email'].includes(name)} value={values[name] || ''} onChange={event => set(name, event.target.value)}
      maxLength={name === 'state' ? 2 : name === 'cpf' ? 14 : name === 'cep' ? 9 : name === 'email' ? 254 : 160} inputMode={['cpf', 'cep'].includes(name) ? 'numeric' : undefined}/></label>)}</div>
    {age !== null && age < 16 && <p className="go-error">A locação não está disponível para menores de 16 anos.</p>}
    {age !== null && age >= 16 && age < 18 && <fieldset><legend>Pais ou responsável legal na retirada</legend><p>Clientes de 16 e 17 anos precisam estar acompanhados dos pais ou responsável legal para conferência e assinatura. A condução e a liberação dependem da confirmação dos requisitos legais para o modelo.</p><div className="go-field-grid">{[['guardian', 'Nome completo do responsável'], ['guardianCPF', 'CPF do responsável'], ['guardianPhone', 'WhatsApp do responsável']].map(([name, label]) => <label key={name}>{label}<input name={name} value={values[name] || ''} required onChange={event => set(name, event.target.value)}/></label>)}</div><label className="go-check"><input type="checkbox" required checked={!!values.accompanied} onChange={event => set('accompanied', event.target.checked ? 'on' : '')}/>Meu pai, minha mãe ou responsável legal estará presente para conferência e assinatura.</label></fieldset>}
    <details className="go-terms"><summary>Regras da reserva · rental-v1</summary><p>Mínimo de {minimumHours} horas. Diárias de 24 horas; frações adicionais contam uma nova diária. Pagamento exclusivamente na loja. A retirada depende da liberação operacional e da conferência de documentos, elegibilidade, vistoria e condições contratuais.</p><p>{quote.insurance === 'none' ? 'Sem seguro adicional.' : quote.settings.coverage}</p><p style={{whiteSpace:'pre-line'}}>{quote.document_policy?.clauses.delay || 'Atrasos e prorrogações: consulte a loja antes do horário previsto de devolução.'}</p><p>Para cancelamento ou devolução antecipada, entre em contato com a loja. Não há pagamento antecipado neste site. Este registro não substitui contrato, vistoria ou apólice.</p></details>
    {quote.document_policy&&<details className="go-terms"><summary>Cláusulas do documento · {quote.document_policy.approved?quote.document_policy.version:'rascunho pendente de revisão'}</summary>{documentSections.map(([key,title])=><section key={key}><strong>{title}</strong><p>{quote.document_policy!.clauses[key]}</p></section>)}</details>}
    <label className="go-check"><input name="consent" type="checkbox" required checked={!!values.consent} onChange={event => set('consent', event.target.checked ? 'on' : '')}/>Autorizo o uso e o registro protegido dos dados informados para o cadastro, documentos e atendimento desta locação, incluindo o envio da documentação, regras e cuidados para o WhatsApp informado. Esta autorização não inclui ofertas. Tenho autorização para informar os dados do responsável, quando aplicável.</label>
    <label className="go-check"><input name="terms" type="checkbox" required checked={!!values.terms} onChange={event => set('terms', event.target.checked ? 'on' : '')}/>Li as regras e as cláusulas acima e entendo que devo aguardar a liberação da loja antes da retirada. {model.spec.capacity_exclusive && model.spec.capacity ? `Respeitarei o peso total abaixo de ${model.spec.capacity} kg, somando condutor, passageiro e bagagem, com passageiro somente quando autorizado para o modelo. ` : ''}Pagarei no local.</label>
    <p className="go-fine">Seu contato será usado nos avisos desta reserva conforme sua autorização. Para gerenciar avisos da conta e ofertas, acesse <a href="/minha-conta" target="_blank" rel="noreferrer">Minhas reservas</a>. A autorização para ofertas é separada e opcional.</p>
    {error && <p className="go-error" role="alert">{error}</p>}
    <button className="go-button go-primary" disabled={busy || deliveryBusy || disabled || (age !== null && age < 16)}>{busy ? 'Separando sua moto…' : booking ? 'Atualizar ficha' : 'Confirmar reserva · pagar na loja'}</button>
    <p className="go-fine">Seus dados completos serão registrados em área protegida para a locação. O PDF é opcional e não é armazenado automaticamente neste fluxo. Ao criar uma conta, você também poderá acompanhar as reservas vinculadas e consultar os documentos disponíveis. A confirmação do horário de retirada ocorre depois da liberação da equipe.</p>
  </form></>;
}
