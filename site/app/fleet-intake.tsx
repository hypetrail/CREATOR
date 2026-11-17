'use client';

import {useEffect, useRef, useState} from 'react';
import {ArrowUpRight, Check, Copy, MessageCircle, ShieldCheck} from 'lucide-react';
import './fleet-checkout.css';
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
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const receiptTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => {if (error) errorMessage.current?.focus();}, [error]);
  useEffect(() => {if (booking) receiptTitle.current?.focus({preventScroll: true});}, [booking]);

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
    const deliveryMessage = delivery?.status === 'not_configured'
      ? 'Seu contato foi registrado. O envio automático ainda não está disponível. Guarde seu número de reserva e fale com a loja pelo botão abaixo.'
      : delivery?.status === 'queued'
        ? 'Seu contato foi registrado. As mensagens estão aguardando envio pelo WhatsApp; este aviso ainda não confirma a entrega.'
        : delivery?.message || 'Sua reserva foi criada. Confira o contato abaixo para concluir o atendimento.';
    return <section className="go-receipt" aria-live="polite">
      <span className="go-receipt-check" aria-hidden="true"><Check size={24}/></span>
      <span className="go-eyebrow">RESERVA REGISTRADA</span><h2 ref={receiptTitle} tabIndex={-1}>Sua moto está reservada.</h2>
      <p className="go-pickup-pending"><strong>Agora, aguarde a liberação da loja.</strong> A equipe vai confirmar quando a moto estiver pronta para retirada.</p>
      <div className="go-code"><small>APRESENTE ESTE NÚMERO NA LOJA</small><strong>{booking.code}</strong>
        <button type="button" className="go-button go-secondary" onClick={async () => {
          try {await navigator.clipboard.writeText(booking.code); setCopied(true);} catch {setError('Copie o número exibido acima.');}
        }}>{copied ? <Check size={16} aria-hidden="true"/> : <Copy size={16} aria-hidden="true"/>}{copied ? 'Número copiado' : 'Copiar número'}</button>
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
      <div className="go-delivery-status"><MessageCircle size={20} aria-hidden="true"/><div><strong>Acompanhamento pelo WhatsApp</strong><p>{deliveryMessage}</p></div></div>
      {!contactSaved && <form className="go-intake" onSubmit={submit}>
        <label>WhatsApp com DDD<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(19) 99999-9999" required maxLength={30} disabled={busy} value={phone} onChange={event => setPhone(event.target.value)}/></label>
        <p className="go-fine">Seu número de reserva permanece o mesmo. Esta ação apenas confere o contato e os avisos autorizados.</p>
        <button className="go-button go-secondary" disabled={busy}>{busy ? 'Conferindo contato…' : 'Concluir contato da reserva'}</button>
      </form>}
      <div className="go-actions"><a className="go-button go-primary" href={`https://wa.me/${quote.settings.whatsapp || officialWhatsApp}?text=${encodeURIComponent(summary)}`} target="_blank" rel="noreferrer">Falar com a loja no WhatsApp <ArrowUpRight size={18} aria-hidden="true"/></a></div>
      <details className="go-terms"><summary>Conferir reserva, regras e cuidados</summary>{parts.map((part, index) => <section key={index}><strong>{part.title}</strong><p>{part.text}</p></section>)}</details>
      {model.id === 't1' && <p><a className="go-button go-secondary" href="/api/fleet/care-guide" target="_blank" rel="noreferrer">Consultar guia de cuidados da T1</a></p>}
      <p className="go-fine">A identificação, os documentos e a assinatura serão conferidos na loja. A reserva não comprova pagamento. O prazo efetivo de devolução começa na retirada registrada pela equipe.</p>
      {error && <p ref={errorMessage} tabIndex={-1} className="go-error" role="alert">{error}</p>}
    </section>;
  }

  return <form className="go-intake" onSubmit={submit} aria-busy={busy}>
    <div className="go-intake-heading"><span className="go-contact-icon" aria-hidden="true"><MessageCircle size={22}/></span><div><h2>Seu contato para a reserva</h2><p>Sem criar conta. A documentação fica para a retirada.</p></div></div>
    <div className="go-field-grid">
      <label>WhatsApp com DDD<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(19) 99999-9999" required maxLength={30} disabled={busy || disabled} value={phone} onChange={event => setPhone(event.target.value)}/></label>
      <label>Seu nome <span className="go-optional">(opcional)</span><input name="name" autoComplete="given-name" placeholder="Como podemos chamar você?" maxLength={100} disabled={busy || disabled} value={name} onChange={event => setName(event.target.value)}/></label>
    </div>
    {quote.document_policy && <details className="go-terms"><summary>Condições completas da reserva</summary><p className="go-fine">{quote.document_policy.approved ? `Versão ${quote.document_policy.version}` : 'Condições para conferência na loja.'}</p>{documentSections.map(([key, title]) => <section key={key}><strong>{title}</strong><p>{quote.document_policy!.clauses[key]}</p></section>)}</details>}
    <div className="go-consents">
      <label className="go-check"><input name="consent" type="checkbox" required disabled={busy || disabled} checked={consent} onChange={event => setConsent(event.target.checked)}/><span><strong>Autorizo o contato sobre esta reserva.</strong><small>Permito guardar meu WhatsApp e nome, quando informado, para confirmação, pendências, orientações, aviso de retirada e lembrete de devolução. Sem mensagens de ofertas.</small></span></label>
      <label className="go-check"><input name="terms" type="checkbox" required disabled={busy || disabled} checked={terms} onChange={event => setTerms(event.target.checked)}/><span><strong>Li as condições e pagarei na loja.</strong><small>Aguardarei a liberação da equipe. A retirada depende de documentação, elegibilidade, vistoria e assinatura. {model.spec.capacity_exclusive && model.spec.capacity ? `Respeitarei o peso total abaixo de ${model.spec.capacity} kg, incluindo condutor, eventual passageiro e bagagem.` : ''}</small></span></label>
    </div>
    {error && <p ref={errorMessage} tabIndex={-1} className="go-error" role="alert">{error}</p>}
    <div className="go-confirm-total"><span>Total da reserva<strong>{formatMoney(quote.total_cents)}</strong></span><span><ShieldCheck size={17} aria-hidden="true"/>Pagamento na loja</span></div>
    <button className="go-button go-primary" disabled={busy || disabled}>{busy ? 'Registrando sua reserva…' : 'Confirmar reserva'}{!busy && <ArrowUpRight size={18} aria-hidden="true"/>}</button>
    <p className="go-checkout-footnote">Ao confirmar, guarde o número da reserva. Aguarde o aviso da loja antes de retirar a moto.</p>
  </form>;
}
