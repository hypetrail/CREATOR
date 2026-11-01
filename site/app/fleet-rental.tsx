'use client';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import {type Insurance} from '../lib/rental';
import {fleetPeriod, pricingPolicy} from '../lib/fleet-pricing';
import {fleetApi, formatMoney, formatPeriod, type FleetCatalog, type FleetColor, type FleetModel, type FleetQuote} from '../lib/fleet-client';
import {officialWhatsApp, pickupAddress} from '../lib/packages';
import FleetIntake from './fleet-intake';
import RentalGuide from './rental-guide';
import './fleet-rental.css';

const dateDay = (offset: number) => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(Date.now() + offset * 86400000));
interface Selection {model: FleetModel; color: FleetColor}
function ModelPhoto({model, color}: {model: FleetModel; color?: FleetColor}) {
  const photos = color?.photos.length ? color.photos : model.photos;
  const [index, setIndex] = useState(0);
  const image = photos[index] || photos[0];
  return <div className="go-gallery"><div className="go-model-photo">{image ? <img src={image} alt={`${model.brand} ${model.name}${color?.photos.length && model.spec.color_selection !== false ? ` · ${color.name}` : ' · imagem ilustrativa do modelo'}`}/> : <div className="go-no-photo"><strong>{model.name}</strong><span>Foto a cadastrar pela loja</span></div>}</div>
    {image && !color?.photos.length && <small className="go-photo-note">Imagem ilustrativa do modelo · confira a unidade na retirada</small>}
    {photos.length > 1 && <div className="go-thumbnails">{photos.map((src, item) => <button type="button" key={src} aria-label={`Foto ${item + 1}`} aria-pressed={item === index} onClick={() => setIndex(item)}><img src={src} alt=""/></button>)}</div>}
  </div>;
}

export default function FleetRental() {
  const [catalog, setCatalog] = useState<FleetCatalog | null>(null);
  const [startDate, setStartDate] = useState(() => dateDay(1));
  const [endDate, setEndDate] = useState(() => dateDay(3));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:00');
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [insurance, setInsurance] = useState<Insurance>('none');
  const [quote, setQuote] = useState<FleetQuote | null>(null);
  const [reserved, setReserved] = useState(false);
  const [activeColors, setActiveColors] = useState<Record<string, string>>({});
  const searchVersion = useRef(0);
  const quoteVersion = useRef(0);
  const checkout = useRef<HTMLElement>(null);
  const start = `${startDate}T${startTime}:00-03:00`, end = `${endDate}T${endTime}:00-03:00`;
  const settings = catalog?.settings;
  const contact = settings?.whatsapp || officialWhatsApp;
  const minimumDays = catalog?.models.length ? Math.min(...catalog.models.map(model => {const policy = pricingPolicy(model); return policy.single_day_enabled ? 1 : policy.minimum_days;})) : 2;
  let days = minimumDays, periodError = '';
  try { days = fleetPeriod({daily_cents: 1, spec: {pricing: {minimum_days: minimumDays}}}, start, end).days; } catch (cause) { periodError = (cause as Error).message; }

  useEffect(() => {
    let current = true;
    fleetApi<FleetCatalog>('catalog').then(result => {if (current) setCatalog(result);}).catch(cause => {if (current) setError(cause.message);});
    return () => {current = false;};
  }, []);

  const changePeriod = (setter: (value: string) => void, value: string) => {
    searchVersion.current++; quoteVersion.current++;
    setter(value); setSearched(false); setSelection(null); setQuote(null); setReserved(false); setError('');
  };
  const search = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (periodError) {setError(periodError); return;}
    const version = ++searchVersion.current;
    setBusy(true);
    try {
      const result = await fleetApi<FleetCatalog>(`availability?${new URLSearchParams({start, end})}`);
      if (version !== searchVersion.current) return;
      setCatalog(result); setSearched(true); setSelection(null); setQuote(null); setReserved(false);
      document.getElementById('go-fleet')?.scrollIntoView({behavior: 'smooth', block: 'start'});
    } catch (cause) {if (version === searchVersion.current) setError((cause as Error).message);}
    finally {setBusy(false);}
  };
  const choose = async (model: FleetModel, color: FleetColor) => {
    if (periodError) {setError(periodError); return;}
    setBusy(true); setError('');
    const version = ++quoteVersion.current;
    try {
      const result = await fleetApi<FleetQuote>('quote', {model_id: model.id, color: color.id, start, end, insurance: 'none'});
      if (version !== quoteVersion.current) return;
      setSelection({model, color}); setInsurance(result.insurance); setQuote(result); setReserved(false);
      requestAnimationFrame(() => checkout.current?.scrollIntoView({behavior: 'smooth'}));
    } catch (cause) {setError((cause as Error).message);}
    finally {setBusy(false);}
  };
  const changeInsurance = async (value: Insurance) => {
    if (!selection || busy || reserved) return;
    const version = ++quoteVersion.current;
    setBusy(true); setError('');
    try {
      const result = await fleetApi<FleetQuote>('quote', {model_id: selection.model.id, color: selection.color.id, start, end, insurance: value});
      if (version !== quoteVersion.current) return;
      setInsurance(value); setQuote(result);
    } catch (cause) {setError((cause as Error).message);}
    finally {setBusy(false);}
  };
  const afterReservation = () => {
    setReserved(true);
    const version = searchVersion.current;
    fleetApi<FleetCatalog>(`availability?${new URLSearchParams({start, end})}`)
      .then(result => {if (version === searchVersion.current) setCatalog(result);})
      .catch(() => { /* The receipt stays valid if refreshing the catalog fails. */ });
  };

  const models = catalog?.models.filter(model => model.active && `${model.brand} ${model.name}`.toLowerCase().includes(query.toLowerCase())) || [];
  return <div className="go-public">
    <a className="go-skip" href="#go-content">Ir para o conteúdo</a>
    <header className="go-header"><Link href="/" className="go-brand" aria-label="Calori Go, início"><span className="go-brand-mark" role="img" aria-label="Calori Go — Mobilidade Elétrica"><span className="go-brand-go" aria-hidden="true">Go</span></span></Link><nav aria-label="Navegação principal"><a href="#go-fleet">Nossas motos</a><Link href="/minha-conta">Minhas reservas</Link><a href={`https://wa.me/${contact}`} target="_blank" rel="noreferrer">Fale com a loja ↗</a></nav></header>
    <main id="go-content">
      <section className="go-hero go-wrap"><span className="go-eyebrow">SEU CAMINHO, AGORA ELÉTRICO</span><h1>Alugue uma<br/>moto elétrica.<br/><span className="go-hero-tagline">Escolha. Converse. Ande.</span></h1><p>Encontre sua elétrica, escolha o período e reserve.<br/>Você paga só na retirada, na Calori Go.</p><a className="go-button go-primary" href="#go-period">Escolher meu período ↗</a><div className="go-hero-notes"><span>Diárias de 24 horas</span><span>Períodos e tarifas por modelo</span><span>Pagamento na loja</span></div></section>
      <section className="go-wrap" id="go-period" aria-label="Período da locação"><form className="go-period" onSubmit={search}>
        <fieldset><legend>Retirada</legend><div><label><span>Data</span><input type="date" required min={dateDay(0)} value={startDate} onChange={event => changePeriod(setStartDate, event.target.value)}/></label><label><span>Horário</span><input type="time" required value={startTime} onChange={event => changePeriod(setStartTime, event.target.value)}/></label></div></fieldset>
        <fieldset><legend>Devolução</legend><div><label><span>Data</span><input type="date" required min={startDate} value={endDate} onChange={event => changePeriod(setEndDate, event.target.value)}/></label><label><span>Horário</span><input type="time" required value={endTime} onChange={event => changePeriod(setEndTime, event.target.value)}/></label></div></fieldset>
        <button className="go-button go-primary" disabled={busy || !catalog}>{busy ? 'Consultando…' : 'Consultar disponibilidade ↗'}</button>
        <p>{periodError || `${days} diárias · horários de Brasília`}</p>
      </form></section>
      <div className="go-wrap">{error && <div role="alert" className="go-error">{error}</div>}</div>
      <section className="go-wrap go-fleet" id="go-fleet"><div className="go-section-heading"><div><span className="go-eyebrow">UMA ELÉTRICA PARA VOCÊ</span><h2>{searched ? 'Sua moto, no seu período.' : 'Conheça nossa frota.'}</h2><p>{searched ? 'Disponibilidade consultada no calendário. A unidade é separada ao confirmar a reserva.' : 'Escolha as datas para consultar as motos disponíveis.'}</p></div><label className="go-search"><span>Buscar modelo</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome ou marca"/></label></div>
        {!catalog && !error && <p role="status">Carregando as motos…</p>}
        {settings && !settings.rentals_enabled && <div className="go-notice"><strong>Reservas ainda não liberadas.</strong><span>Conheça a frota e converse com a loja para combinar sua locação.</span></div>}
        {catalog && !models.length && <div className="go-empty"><h3>Nenhum modelo encontrado.</h3><p>{query ? 'Tente outro nome ou marca.' : 'A loja está preparando os modelos para locação. Fale com nossa equipe.'}</p></div>}
        <div className="go-fleet-grid">{models.map(model => {
          const pricing = pricingPolicy(model);
          const customerDaily = (model.daily_cents || 0) + (pricing.insurance_included ? pricing.insurance_daily_cents : 0);
          const color = model.colors.find(item => item.id === activeColors[model.id]) || model.colors[0];
          const amount = searched ? color?.available || 0 : undefined;
          const canChoose = searched && !!model.daily_cents && !!amount && !!settings?.rentals_enabled;
          return <article className="go-model" key={model.id}><ModelPhoto key={model.id + (color?.id || '')} model={model} color={color}/><div className="go-model-body"><div className="go-model-heading"><div><span className="go-eyebrow">{model.brand}</span><h3>{model.name}</h3></div><div className="go-price">{model.daily_cents ? <><strong>{formatMoney(customerDaily)}</strong><span>/diária{pricing.insurance_included ? ' com seguro' : ''}</span></> : <span>Diária a definir</span>}</div></div><p>{model.spec.line}</p>
            {model.daily_cents && <p className="go-tariff">{pricing.insurance_included ? `${formatMoney(model.daily_cents)} de aluguel + ${formatMoney(pricing.insurance_daily_cents)} de seguro incluído. ` : ''}Tarifa para {pricing.minimum_days} ou mais {pricing.minimum_days === 1 ? 'diária' : 'diárias'}.{pricing.single_day_enabled && pricing.single_day_rental_cents ? ` Uma diária: ${formatMoney(pricing.single_day_rental_cents + (pricing.insurance_included ? pricing.insurance_daily_cents : 0))}.` : ''}</p>}
            <dl className="go-model-specs"><div><dt>Autonomia estimada</dt><dd>{model.spec.range ? `Até ${model.spec.range} km` : 'A confirmar'}</dd></div><div><dt>Motor</dt><dd>{model.spec.power ? `${model.spec.power.toLocaleString('pt-BR')} W` : 'A confirmar'}</dd></div><div><dt>{model.spec.capacity_exclusive ? 'Limite operacional' : 'Carga máxima'}</dt><dd>{model.spec.capacity ? `${model.spec.capacity_exclusive ? 'Abaixo de ' : ''}${model.spec.capacity} kg` : 'A confirmar'}</dd></div></dl>
            {model.spec.color_selection !== false && <fieldset className="go-colors"><legend>Cor{color ? ` · ${color.name}` : ''}</legend>{model.colors.map(item => <button key={item.id} type="button" aria-pressed={color?.id === item.id} title={item.name} aria-label={`${model.name}, ${item.name}${searched ? `, ${item.available || 0} disponíveis no período` : ''}`} onClick={() => setActiveColors(previous => ({...previous, [model.id]: item.id}))} className={searched && !item.available ? 'go-color-unavailable' : ''}><i style={{backgroundColor: item.hex}}/><span>{item.name}</span></button>)}</fieldset>}
            <p className="go-stock" role="status">{!model.daily_cents ? 'Preço de locação em preparação' : !searched ? `${model.quantity} ${model.quantity === 1 ? 'unidade cadastrada' : 'unidades cadastradas'} · consulte seu período` : amount ? `${amount} ${amount === 1 ? 'unidade disponível' : 'unidades disponíveis'}${model.spec.color_selection !== false ? ' nesta cor' : ''}` : model.spec.color_selection === false ? 'Modelo indisponível no período' : 'Esta cor não está disponível no período'}</p>
            <button className="go-button go-primary" disabled={busy || !canChoose} onClick={() => color && choose(model, color)}>{canChoose ? model.spec.color_selection===false?'Reservar T1 ↗':'Reservar esta cor ↗' : !model.daily_cents ? 'Tarifa em preparação' : !searched ? 'Consulte seu período acima' : 'Indisponível para reserva'}</button>
            <details className="go-details"><summary>Ficha técnica e cuidados</summary><dl className="go-specs">{[['Bateria', model.spec.battery], ['Recarga', model.spec.charge], ['Freios', model.spec.brakes], ['Velocidade informada no manual', model.spec.speed ? `${model.spec.speed} km/h` : 'A confirmar']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'A confirmar'}</dd></div>)}</dl><ul>{model.spec.notes?.map(note => <li key={note}>{note}</li>)}</ul><p className="go-fine">Autonomia varia com peso, relevo e uso. A loja confere documentação e elegibilidade antes da retirada. Fonte: {model.spec.source || 'Cadastro da loja.'}</p>{model.id === 't1' && <><a href="/manuals/t1.pdf" target="_blank" rel="noreferrer">Consultar manual da T1 ↗</a><p><a href="/api/fleet/care-guide" target="_blank" rel="noreferrer">Baixar guia de cuidados da locação ↗</a></p></>}</details>
          </div></article>;
        })}</div>
      </section>
      {selection && quote && <section ref={checkout} className="go-wrap go-checkout" aria-label="Concluir reserva"><div className="go-section-heading"><div><span className="go-eyebrow">{reserved ? 'RESERVA REGISTRADA' : 'SEU PRÓXIMO CAMINHO'}</span><h2>{selection.model.name}{selection.model.spec.color_selection !== false ? ` · ${selection.color.name}` : ''}</h2><p>{formatPeriod(Date.parse(start))} → {formatPeriod(Date.parse(end))}</p></div></div><div className="go-checkout-grid"><div>
        {!reserved && <fieldset className="go-insurance"><legend>{quote.insurance_included ? 'Seguro incluído na diária' : 'Escolha sua proteção'}</legend>{quote.insurance_included ? <p>O total já inclui {formatMoney(quote.protection_daily_cents)} de seguro por diária. {quote.settings.coverage}</p> : <>{([['none', 'Somente aluguel', 'Sem seguro adicional'], ['basic', 'Seguro básico', '+ R$ 15 por diária'], ['full', 'Seguro completo', '+ R$ 30 por diária']] as const).map(([id, label, description]) => <label key={id}><input type="radio" name="insurance" checked={insurance === id} disabled={busy || (id !== 'none' && !quote.settings.protection_enabled)} onChange={() => changeInsurance(id)}/><span><strong>{label}</strong><small>{description}{id !== 'none' && !quote.settings.protection_enabled ? ' · não disponível' : ''}</small></span></label>)}{insurance !== 'none' && <p>{quote.settings.coverage}</p>}</>}</fieldset>}
        <FleetIntake key={selection.model.id + selection.color.id + start + end} model={selection.model} color={selection.color} start={start} end={end} quote={quote} disabled={busy} onReserved={afterReservation}/>
      </div><aside className="go-summary"><span className="go-eyebrow">RESUMO</span><ModelPhoto model={selection.model} color={selection.color}/><h3>{selection.model.name}{selection.model.spec.color_selection !== false ? ` · ${selection.color.name}` : ''}</h3><dl><div><dt>{quote.days} diárias × {formatMoney(quote.daily_cents)}</dt><dd>{formatMoney(quote.rental_cents)}</dd></div><div><dt>{quote.insurance_included ? 'Seguro incluído' : insurance === 'none' ? 'Sem seguro adicional' : `Seguro ${insurance === 'basic' ? 'básico' : 'completo'}`}</dt><dd>{formatMoney(quote.protection_cents)}</dd></div><div className="go-total"><dt>Total</dt><dd>{formatMoney(quote.total_cents)}</dd></div></dl><p>Pagamento exclusivamente na loja.</p><p className="go-fine">Retirada após liberação da equipe. {quote.settings.address}</p></aside></div></section>}
      {!!catalog?.models.length && <div className="go-guide"><RentalGuide models={catalog.models} fleetAnchor="#go-fleet"/></div>}
      <section className="go-how"><div className="go-wrap"><span className="go-eyebrow">SIMPLES, DO INÍCIO AO CAMINHO</span><h2>Escolha. Reserve. Retire.</h2><div><article><b>01</b><h3>Encontre sua moto</h3><p>Escolha as datas e o modelo disponível.</p></article><article><b>02</b><h3>Registre sua reserva</h3><p>Informe seu WhatsApp e guarde o número da reserva. As orientações serão enviadas pelo atendimento.</p></article><article><b>03</b><h3>Pague na retirada</h3><p>Aguarde a liberação da equipe. A conferência e o pagamento são presenciais.</p></article></div></div></section>
    </main><footer className="go-footer go-wrap"><div><strong>Calori Go</strong><p>{settings?.address || pickupAddress}</p><a href={`https://wa.me/${contact}`} target="_blank" rel="noreferrer">Conversar com a loja ↗</a><p><Link href="/minha-conta">Minhas reservas</Link></p></div><a href="/admin">Área da empresa</a></footer>
  </div>;
}
