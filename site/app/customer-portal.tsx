'use client';

import Link from 'next/link';
import {useEffect, useState} from 'react';
import CustomerAccess from './customer-access';
import CustomerPersonalData from './customer-personal-data';
import CustomerReservationDocuments from './customer-reservation-documents';
import {CustomerApiError, customerApi, type CustomerDashboard, type CustomerProfile, type CustomerReservation} from '../lib/customer-client';
import {formatRentalDuration, rentalClock, serverClockOffset} from '../lib/customer-clock';
import {formatMoney, formatPeriod} from '../lib/fleet-client';
import {reservationLabels, type ReservationState} from '../lib/reservation-workflow';
import {officialWhatsApp} from '../lib/packages';
import './customer-portal.css';

function ReservationCard({reservation, now}: {reservation: CustomerReservation; now: number}) {
  const clock = rentalClock(reservation, now);
  const due = clock.due_ms || reservation.due_ms || reservation.end_ms;
  return <article className="ca-reservation">
    <div className="ca-card-heading"><div><p className="ca-eyebrow">{reservation.code}</p><h3>{reservation.model_name}{reservation.model_id!=='t1'&&reservation.model_name!=='T1'&&reservation.color_name ? ` · ${reservation.color_name}` : ''}</h3></div><span className={`ca-pill ca-state-${reservation.status}`}>{reservationLabels[reservation.status as ReservationState] || 'Em atendimento'}</span></div>
    <dl className="ca-details"><div><dt>Período contratado</dt><dd>{reservation.days} {reservation.days === 1 ? 'diária' : 'diárias'}</dd></div><div><dt>Total da reserva</dt><dd>{formatMoney(reservation.total_cents)}</dd></div><div><dt>Retirada prevista</dt><dd>{formatPeriod(reservation.start_ms)}</dd></div><div><dt>Devolução prevista</dt><dd>{formatPeriod(due)}</dd></div>{reservation.status === 'ready' && reservation.pickup_ms && <div><dt>Horário liberado para retirada</dt><dd>{formatPeriod(reservation.pickup_ms)}</dd></div>}{reservation.actual_start_ms && <div><dt>Retirada registrada</dt><dd>{formatPeriod(reservation.actual_start_ms)}</dd></div>}{reservation.actual_end_ms && <div><dt>Devolução registrada</dt><dd>{formatPeriod(reservation.actual_end_ms)}</dd></div>}<div><dt>Pagamento presencial</dt><dd>{reservation.payment_status === 'paid' ? 'Registrado pela equipe' : 'Pendente de conferência na loja'}</dd></div></dl>
    {(clock.state === 'running' || clock.state === 'overdue') ? <div className={`ca-clock${clock.state === 'overdue' ? ' ca-clock-overdue' : ''}`}><span>{clock.state === 'overdue' ? 'Prazo de devolução ultrapassado' : 'Tempo restante da sua locação'}</span><strong role="timer" aria-live="off">{formatRentalDuration(clock.milliseconds)}</strong><p>{clock.state === 'overdue' ? 'Entre em contato com a loja para regularizar a devolução.' : 'O tempo começou quando a equipe registrou a retirada da moto.'}</p></div>
      : clock.state === 'not_started' ? <p className="ca-info">{reservation.status === 'ready' ? 'Sua moto está pronta para retirada. ' : ''}O cronômetro começa quando a equipe registrar a retirada. {reservation.status === 'ready' ? 'Compareça no horário confirmado pela loja.' : 'Aguarde a liberação da moto antes de ir à loja.'}</p>
        : clock.state === 'unavailable' ? <p className="ca-info">O horário da locação está sendo conferido pela equipe. Atualize a página ou fale com a loja.</p>
          : <p className="ca-info">{clock.state === 'returned' ? 'Locação encerrada. Obrigado por devolver a moto!' : 'Esta reserva foi cancelada.'}</p>}
    {!['cancelled', 'returned'].includes(reservation.status) && <p className="ca-help">Para pedir prorrogação ou alteração, <a href={`https://wa.me/${officialWhatsApp}?text=${encodeURIComponent(`Olá, Calori Go! Preciso de atendimento sobre minha reserva ${reservation.code}.`)}`} target="_blank" rel="noreferrer">fale com a loja</a>. A prorrogação depende de autorização antes do prazo combinado.</p>}
    <CustomerReservationDocuments reservationId={reservation.id} showCareGuide={reservation.model_id==='t1'||reservation.model_name==='T1'}/>
  </article>;
}

export default function CustomerPortal() {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null), [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<CustomerDashboard | null>(null), [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [refreshing, setRefreshing] = useState(false);
  const [offset, setOffset] = useState(0), [now, setNow] = useState(() => Date.now()), [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [operational, setOperational] = useState(false), [marketing, setMarketing] = useState(false);
  const [verification, setVerification] = useState<{status:string;message:string} | null>(null), [verificationCode, setVerificationCode] = useState(''), [showVerificationCode, setShowVerificationCode] = useState(false);
  const [personalOpen,setPersonalOpen]=useState(false);
  const customerId = customer?.id;
  const authenticated = (value: CustomerProfile, _phone:string, recoveryNotice?:string) => {setCustomer(value); setOperational(value.operational_whatsapp); setMarketing(value.marketing_whatsapp); setError(''); setNotice(recoveryNotice||''); setRefreshKey(previous => previous + 1);};
  useEffect(() => {
    let active = true;
    customerApi<{customer: CustomerProfile | null}>('me').then(value => {
      if (active && value.customer) {setCustomer(value.customer); setOperational(value.customer.operational_whatsapp); setMarketing(value.customer.marketing_whatsapp);}
    }).catch(cause => {if (active && (!(cause instanceof CustomerApiError) || cause.status !== 401)) setError('Não foi possível conferir seu acesso. Tente novamente.');})
      .finally(() => {if (active) setLoading(false);});
    return () => {active = false;};
  }, []);
  useEffect(() => {
    if (!customerId) return;
    let active = true, pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true; setRefreshing(true);
      const started = Date.now();
      try {
        const [reservationResult, offersResult] = await Promise.allSettled([
          customerApi<CustomerDashboard>('reservations').then(value => ({value, received:Date.now()})),
          customerApi<{offers:NonNullable<CustomerDashboard['offers']>}>('offers'),
        ]);
        if (reservationResult.status === 'rejected') throw reservationResult.reason;
        const result = reservationResult.value.value;
        if (active) {setDashboard({...result, offers:offersResult.status === 'fulfilled' ? offersResult.value.offers : result.offers || []}); setOffset(serverClockOffset(result.server_now_ms, started, reservationResult.value.received)); setLastUpdate(result.server_now_ms); setError('');}
      } catch (cause) {
        if (active) {
          if (cause instanceof CustomerApiError && cause.status === 401) {setCustomer(null); setDashboard(null); setError('Seu acesso expirou. Entre novamente para consultar suas reservas.');}
          else setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar suas reservas.');
        }
      } finally {pending = false; if (active) setRefreshing(false);}
    };
    void refresh();
    const interval = window.setInterval(() => {void refresh();}, 30_000);
    return () => {active = false; window.clearInterval(interval);};
  }, [customerId, refreshKey]);
  useEffect(() => {const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval);}, []);
  const logout = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {await customerApi('logout', {}); setCustomer(null); setDashboard(null); setVerification(null); setVerificationCode(''); setShowVerificationCode(false); setPersonalOpen(false); setNotice('Você saiu da sua conta.');}
    catch (cause) {setError(cause instanceof Error ? cause.message : 'Não foi possível sair. Tente novamente.');}
    finally {setBusy(false);}
  };
  const savePreferences = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy || !customer) return;
    setBusy(true); setError('');
    try {
      const result = await customerApi<{customer?: CustomerProfile}>('preferences', {operational_whatsapp: operational, marketing_whatsapp: marketing});
      setCustomer(result.customer || {...customer, operational_whatsapp: operational, marketing_whatsapp: marketing});
      setNotice('Preferências salvas. Você pode alterá-las quando quiser.');
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Não foi possível salvar suas preferências.');}
    finally {setBusy(false);}
  };
  const requestVerification = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await customerApi<{status:string;message:string}>('verify/request', {});
      setVerification(result);
      if (result.status === 'submitted') setShowVerificationCode(true);
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Não foi possível solicitar o código.');}
    finally {setBusy(false);}
  };
  const confirmVerification = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await customerApi<{customer:CustomerProfile}>('verify/confirm', {code:verificationCode});
      setCustomer(result.customer); setVerificationCode(''); setShowVerificationCode(false); setVerification(null); setNotice('Telefone verificado. Suas preferências de mensagens continuam sob seu controle.');
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Confira o código recebido.');}
    finally {setBusy(false);}
  };
  return <div className="ca-page"><a className="ca-skip" href="#ca-content">Ir para o conteúdo</a><header className="ca-header"><Link href="/" className="ca-brand">Calori <span>Go</span></Link><nav aria-label="Navegação do cliente"><Link href="/#go-period">Reservar uma moto</Link><a href={`https://wa.me/${officialWhatsApp}`} target="_blank" rel="noreferrer">Falar com a loja</a></nav></header><main id="ca-content" className="ca-main">
    <div className="ca-heading"><div><p className="ca-eyebrow">ÁREA DO CLIENTE</p><h1>Minhas reservas</h1><p>Acompanhe sua locação e escolha como receber os avisos da Calori Go.</p></div>{customer && <button type="button" className="ca-button ca-secondary" disabled={busy} onClick={() => {void logout();}}>Sair da conta</button>}</div>
    {error && <p className="ca-error" role="alert">{error}</p>}{notice && <p className="ca-info" role="status">{notice}</p>}
    {loading ? <p role="status">Conferindo seu acesso…</p> : !customer ? <CustomerAccess onAuthenticated={authenticated}/> : <>
      <section className="ca-profile" aria-label="Seu perfil"><div><strong>{customer.phone_masked}</strong><p>Cliente desde {new Intl.DateTimeFormat('pt-BR', {timeZone: 'America/Sao_Paulo', dateStyle: 'short'}).format(customer.created_ms)}</p></div><span className="ca-pill">{customer.phone_verified ? 'Telefone verificado' : 'Telefone ainda não verificado'}</span></section>
      <section className="ca-section" aria-labelledby="ca-personal-title"><div className="ca-section-heading"><div><h2 id="ca-personal-title">Dados para o contrato</h2><p>Seu cadastro completo fica disponível para o atendimento autorizado da locação.</p></div><button type="button" className="ca-button ca-secondary" aria-expanded={personalOpen} onClick={()=>setPersonalOpen(previous=>!previous)}>{personalOpen?'Fechar dados do cadastro':'Conferir ou atualizar meus dados'}</button></div>{personalOpen&&<CustomerPersonalData key={customer.id}/>}</section>
      {!customer.phone_verified && <section className="ca-verification" aria-label="Verificar telefone"><h2>Confirme seu WhatsApp</h2><p>Seu número ainda precisa ser verificado para receber avisos automáticos. Solicite um código para o telefone cadastrado.</p><div className="ca-verification-actions"><button type="button" className="ca-button ca-secondary" disabled={busy} onClick={() => {void requestVerification();}}>Receber código pelo WhatsApp</button><button type="button" className="ca-link-button" disabled={busy} onClick={() => setShowVerificationCode(true)}>Já recebi um código</button></div>{verification && <p className="ca-info" role="status">{verification.message}</p>}{showVerificationCode && <form className="ca-code-form" onSubmit={confirmVerification}><label>Código de 6 dígitos<input name="verification-code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={verificationCode} onChange={event => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))}/></label><button type="submit" className="ca-button" disabled={busy}>Confirmar código</button></form>}<p className="ca-help">Se o envio ainda não estiver conectado ou você precisar recuperar o acesso, fale com a loja.</p></section>}
      <section className="ca-section" aria-labelledby="ca-bookings-title"><div className="ca-section-heading"><div><h2 id="ca-bookings-title">Suas locações</h2><p>Horários de Brasília. As reservas são atualizadas automaticamente.</p></div><button type="button" className="ca-button ca-secondary" disabled={refreshing} onClick={() => setRefreshKey(previous => previous + 1)}>{refreshing ? 'Atualizando…' : 'Atualizar reservas'}</button></div>
        {!dashboard ? <p role="status">Carregando suas reservas…</p> : !dashboard.reservations.length ? <div className="ca-empty"><h3>Você ainda não tem reservas vinculadas.</h3><p>Faça sua próxima reserva enquanto estiver conectado para acompanhá-la aqui. Reservas anteriores feitas sem acesso devem ser conferidas com a loja.</p><Link className="ca-button" href="/#go-period">Escolher uma moto</Link></div> : <div className="ca-booking-list">{dashboard.reservations.map(reservation => <ReservationCard key={reservation.id} reservation={reservation} now={now + offset}/>)}</div>}
        {lastUpdate && <p className="ca-help">Última consulta: {formatPeriod(lastUpdate)}. O cronômetro é informativo; o prazo válido é o registrado pela equipe e nas condições da sua locação.</p>}
      </section>
      <section className="ca-section" aria-labelledby="ca-preferences-title"><h2 id="ca-preferences-title">Seus avisos pelo WhatsApp</h2><p>Escolha separadamente os lembretes da locação e as mensagens de ofertas.</p><form onSubmit={savePreferences}><fieldset disabled={busy}><label className="ca-check"><input type="checkbox" checked={operational} onChange={event => setOperational(event.target.checked)}/>Quero receber avisos da minha locação: moto pronta, cuidados e lembrete de devolução.</label><label className="ca-check"><input type="checkbox" checked={marketing} onChange={event => setMarketing(event.target.checked)}/>Quero receber ofertas e avisos de motos disponíveis.</label><button className="ca-button" disabled={busy}>Salvar preferências</button></fieldset></form><p className="ca-help">Os envios dependem da verificação do telefone e da conexão do WhatsApp da loja. A autorização para ofertas é opcional e pode ser retirada aqui.</p></section>
      <section className="ca-section" aria-labelledby="ca-offers-title"><h2 id="ca-offers-title">Planos e benefícios</h2>{dashboard?.offers?.length ? <div className="ca-offers">{dashboard.offers.map(offer => <article key={offer.id}><h3>{offer.name}</h3>{offer.price_label && <strong>{offer.price_label}</strong>}<p>{offer.description}</p>{offer.conditions && <p className="ca-help">{offer.conditions}</p>}<a href={`https://wa.me/${officialWhatsApp}?text=${encodeURIComponent(`Olá, Calori Go! Gostaria de saber as condições do plano ${offer.name} (${offer.id}).`)}`} target="_blank" rel="noreferrer">Consultar condições com a loja</a></article>)}</div> : <p>Nenhum plano ou desconto foi disponibilizado para sua conta no momento. Quando houver uma condição aprovada pela loja, ela aparecerá aqui.</p>}</section>
      <p className="ca-help">Seu acesso, cadastro completo e documentos são destinados à locação e ao atendimento autorizado da empresa. Os documentos das reservas mantêm o registro original mesmo quando você atualiza o perfil. Evite compartilhar sua senha ou abrir sua conta em aparelhos de terceiros.</p>
    </>}
  </main><footer className="ca-footer"><Link href="/">Voltar ao site da Calori Go</Link><span>Pagamento presencial na loja.</span></footer></div>;
}
