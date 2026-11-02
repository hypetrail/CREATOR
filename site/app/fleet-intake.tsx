'use client';

import {useRef, useState} from 'react';
import {phone as normalizePhone} from '../lib/rental';
import {fleetApi, formatMoney, formatPeriod, type FleetBooking, type FleetColor, type FleetModel, type FleetQuote} from '../lib/fleet-client';
import {documentSections} from '../lib/document-policy';
import {reservationWhatsAppParts, type WhatsAppPart} from '../lib/reservation-whatsapp';
import {reservationLabels, type ReservationState} from '../lib/reservation-workflow';
import {officialWhatsApp} from '../lib/packages';

interface Props {
  model: FleetModel;
  color: FleetColor;
  start: string;
  end: string;
  quote: FleetQuote;
  onReserved: () => void;
  disabled?: boolean;
}
interface ContactDelivery {
  status: string;
  message: string;
  contact_saved?: boolean;
  parts?: WhatsAppPart[];
}
type MinimalBooking = FleetBooking & {delivery?: ContactDelivery; contact_saved?: boolean};

export default function FleetIntake({model, color, start, end, quote, onReserved, disabled = false}: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<MinimalBooking | null>(null);
  const [delivery, setDelivery] = useState<ContactDelivery | null>(null);
  const [copied, setCopied] = useState(false);
  const request = useRef<{signature: string; key: string} | null>(null);

  const contact = () => {
    const normalized = normalizePhone(phone);
    const shortName = name.trim();
    if (shortName.length > 100 || /[\x00-\x1f\x7f]/.test(shortName)) throw new Error('Confira o nome informado.');
    return {phone: normalized, ...(shortName ? {name: shortName} : {})};
  };
  const saveContact = async (result: MinimalBooking) => {
    if (!result.delivery_token) throw new Error('A reserva está registrada. Fale com a loja para conferir seu contato.');
    const saved = await fleetApi<ContactDelivery>('contact', {
      reservation_id: result.id,
      delivery_token: result.delivery_token,
      contact: contact(),
      whatsapp_consent: true,
    });
    setDelivery(saved);
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || disabled) return;
    setBusy(true); setError('');
    try {
      const recipient = contact();
      if (!consent || !terms) throw new Error('Leia as condições e autorize as mensagens desta reserva.');
      if (booking) {
        await saveContact(booking);
        return;
      }
      const payload = {
        model_id: model.id, color: color.id, start, end, insurance: quote.insurance,
        expected_daily_cents: quote.daily_cents, expected_total_cents: quote.total_cents,
        terms_accepted: true, terms_version: 'rental-v1', expected_terms_token: quote.terms_token,
        contact: recipient, whatsapp_consent: true,
      };
      // Keep a retry tied to the same commercial request even if a contact field
      // is corrected after a lost response; the server decides whether it can replay.
      const signature = JSON.stringify({...payload, contact: undefined});
      if (request.current?.signature !== signature) request.current = {signature, key: crypto.randomUUID()};
      const result = await fleetApi<MinimalBooking>('reservations', {...payload, request_key: request.current.key});
      setBooking(result);
      onReserved();
      if (result.delivery) setDelivery(result.delivery);
      else await saveContact(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a solicitação. Confira sua reserva antes de repetir.');
    } finally {setBusy(false);}
  };

  if (booking) {
    const displayName = model.name + (model.spec.color_selection !== false ? ` · ${color.name}` : '');
    const parts = delivery?.parts || reservationWhatsAppParts(booking as Parameters<typeof reservationWhatsAppParts>[0], 'reservation');
    const contactSaved = delivery?.contact_saved === true || booking.contact_saved === true || !!delivery && ['queued', 'submitted', 'sent', 'already_sent', 'not_configured'].includes(delivery.status);
    const summary = `Olá, Calori Go! Quero falar sobre a reserva ${booking.code}. Modelo: ${model.name}. Retirada prevista: ${formatPeriod(booking.start_ms)}. Devolução prevista: ${formatPeriod(booking.end_ms)}. Total: ${formatMoney(booking.total_cents)}, com pagamento na loja. Aguardo a liberação para retirada.`;
    return <section className="go-receipt" aria-live="polite">
      <span className="go-eyebrow">RESERVA REGISTRADA</span><h2>Sua moto está reservada.</h2>
      <p>Guarde seu número. <strong>Aguarde a loja confirmar que a moto está pronta antes de ir retirar.</strong></p>
      <div className="go-code"><small>APRESENTE ESTE NÚMERO NA LOJA</small><strong>{booking.code}</strong>
        <button type="button" className="go-button go-secondary" onClick={async () => {
          try {await navigator.clipboard.writeText(booking.code); setCopied(true);} catch {setError('Copie o número exibido acima.');}
        }}>{copied ? 'Número copiado' : 'Copiar número'}</button>
      </div>
      <dl className="go-specs">
        <div><dt>Moto</dt><dd>{displayName}</dd></div>
        <div><dt>Retirada prevista</dt><dd>{formatPeriod(booking.start_ms)}</dd></div>
        <div><dt>Devolução prevista</dt><dd>{formatPeriod(booking.end_ms)}</dd></div>
        <div><dt>Período</dt><dd>{booking.days} {booking.days === 1 ? 'diária' : 'diárias'}</dd></div>
        <div><dt>Total</dt><dd>{formatMoney(booking.total_cents)}</dd></div>
        <div><dt>Pagamento</dt><dd>Pendente · na loja</dd></div>
        <div><dt>Situação</dt><dd>{reservationLabels[booking.status as ReservationState] || 'Em atendimento'}</dd></div>
      </dl>
      <div className="go-terms"><strong>Acompanhamento pelo WhatsApp</strong>
        <p>{delivery?.message || 'A reserva acima já foi criada. Falta confirmar o registro do contato para preparar seus avisos.'}</p>
        <p>A confirmação, as orientações e os avisos de retirada e devolução serão tratados pelo WhatsApp informado, conforme a situação da reserva e a conexão da loja.</p>
      </div>
      {!contactSaved && <form className="go-intake" onSubmit={submit}>
        <label>WhatsApp com DDD<input name="phone" type="tel" autoComplete="tel" required maxLength={30} value={phone} onChange={event => setPhone(event.target.value)}/></label>
        <p className="go-fine">Seu número de reserva permanece o mesmo. Esta ação apenas confere o contato e os avisos autorizados.</p>
        <button className="go-button go-secondary" disabled={busy}>{busy ? 'Conferindo contato…' : 'Concluir contato da reserva'}</button>
      </form>}
      <div className="go-actions"><a className="go-button go-primary" href={`https://wa.me/${quote.settings.whatsapp || officialWhatsApp}?text=${encodeURIComponent(summary)}`} target="_blank" rel="noreferrer">Falar com a loja no WhatsApp ↗</a></div>
      <details className="go-terms"><summary>Conferir reserva, regras e cuidados</summary>{parts.map((part, index) => <section key={index}><strong>{part.title}</strong><p>{part.text}</p></section>)}</details>
      {model.id === 't1' && <p><a className="go-button go-secondary" href="/api/fleet/care-guide" target="_blank" rel="noreferrer">Consultar guia de cuidados da T1</a></p>}
      <p className="go-fine">A identificação, os documentos e a assinatura serão conferidos na loja. A reserva não comprova pagamento. O prazo efetivo de devolução começa na retirada registrada pela equipe.</p>
      {error && <p className="go-error" role="alert">{error}</p>}
    </section>;
  }

  return <form className="go-intake" onSubmit={submit}>
    <h2>Receba sua reserva no WhatsApp</h2>
    <p>Informe seu contato para receber as informações da locação. Você reserva sem criar conta. A documentação será conferida na loja.</p>
    <div className="go-field-grid">
      <label>WhatsApp com DDD<input name="phone" type="tel" autoComplete="tel" required maxLength={30} value={phone} onChange={event => setPhone(event.target.value)}/></label>
      <label>Como podemos chamar você? (opcional)<input name="name" autoComplete="given-name" maxLength={100} value={name} onChange={event => setName(event.target.value)}/></label>
    </div>
    <p className="go-fine">Modelo, período e valores já correspondem à sua escolha. O pagamento será feito exclusivamente na loja.</p>
    {quote.document_policy && <details className="go-terms"><summary>Condições da reserva · {quote.document_policy.approved ? quote.document_policy.version : 'para conferência na loja'}</summary>{documentSections.map(([key, title]) => <section key={key}><strong>{title}</strong><p>{quote.document_policy!.clauses[key]}</p></section>)}</details>}
    <label className="go-check"><input name="consent" type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)}/>Autorizo guardar meu nome, quando informado, e WhatsApp para atender esta reserva e enviar confirmação, pendências, orientações, aviso de retirada e lembrete de devolução. Esta autorização não inclui ofertas.</label>
    <label className="go-check"><input name="terms" type="checkbox" required checked={terms} onChange={event => setTerms(event.target.checked)}/>Li as condições, pagarei na loja e aguardarei a liberação da equipe. A retirada depende da documentação, elegibilidade, vistoria e assinatura. {model.spec.capacity_exclusive && model.spec.capacity ? `Respeitarei o peso total abaixo de ${model.spec.capacity} kg, somando condutor, eventual passageiro e bagagem.` : ''}</label>
    {error && <p className="go-error" role="alert">{error}</p>}
    <button className="go-button go-primary" disabled={busy || disabled}>{busy ? 'Registrando sua reserva…' : 'Confirmar reserva · pagar na loja'}</button>
    <p className="go-fine">O envio automático depende da conexão da API oficial do WhatsApp da loja. Nenhum e-mail ou conta de cliente é necessário.</p>
  </form>;
}
