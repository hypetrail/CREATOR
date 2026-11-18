'use client';

import {hoursForDate,nextOpenDate,validateStorePeriod,storeHoursText} from '../lib/store-hours';
import {weekendPromotionText} from '../lib/weekend-pricing';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link';
import BrandLogo from '../components/brand-logo';
import {ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2, Clock3, MapPin, ShieldCheck} from 'lucide-react';
import {type Insurance} from '../lib/rental';
import {fleetCharges, fleetPeriod, pricingPolicy} from '../lib/fleet-pricing';
import {displayPrice} from '../lib/fleet-display';
import {fleetApi, formatMoney, formatPeriod, type FleetCatalog, type FleetColor, type FleetModel, type FleetQuote} from '../lib/fleet-client';
import {officialWhatsApp, pickupAddress} from '../lib/packages';
import FleetIntake from './fleet-intake';
import InsuranceDetails from './insurance-details';
import './fleet-rental.css';

const dateDay = (offset: number) => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(Date.now() + offset * 86400000));
interface Selection {model: FleetModel; color: FleetColor}
function scrollToElement(element: HTMLElement | null) {
  element?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'});
}
function ModelPhoto({model, color, priority = false}: {model: FleetModel; color?: FleetColor; priority?: boolean}) {
  const photos = color?.photos.length ? color.photos : model.photos;
  const [index, setIndex] = useState(0);
  const image = photos[index] || photos[0];
  return <div className="go-gallery"><div className="go-model-photo">{image ? <img src={image} width={600} height={450} loading={priority ? 'eager' : 'lazy'} fetchPriority={priority ? 'high' : undefined} decoding="async" alt={`${model.brand} ${model.name}${color?.photos.length && model.spec.color_selection !== false ? ` · ${color.name}` : ' · imagem ilustrativa do modelo'}`}/> : <div className="go-no-photo"><strong>{model.name}</strong><span>Foto a cadastrar pela loja</span></div>}</div>
    {image && !color?.photos.length && <small className="go-photo-note">Imagem ilustrativa · confira a unidade na retirada</small>}
    {photos.length > 1 && <div className="go-thumbnails">{photos.map((src, item) => <button type="button" key={src} aria-label={`Foto ${item + 1} de ${model.name}`} aria-pressed={item === index} onClick={() => setIndex(item)}><img src={src} alt="" loading="lazy"/></button>)}</div>}
  </div>;
}
function TariffOptions({model}: {model: FleetModel}) {
  if (!model.daily_cents) return <p className="go-fine">Tarifa em preparação pela loja.</p>;
  const policy = pricingPolicy(model);
  const ordinaryMinimum = policy.single_day_enabled ? Math.max(2, policy.minimum_days) : policy.minimum_days;
  let ordinary: ReturnType<typeof fleetCharges>;
  let one: ReturnType<typeof fleetCharges> | null;
  try {
    ordinary = fleetCharges(model, ordinaryMinimum);
    one = policy.single_day_enabled ? fleetCharges(model, 1) : null;
  } catch {return <p className="go-fine">Consulte a tarifa com a loja.</p>;}
  return <div className="go-tariff-options" aria-label={`Tarifas de ${model.name}`}>
      {one && <div><span>1 diária</span><strong>{formatMoney(one.total_cents)}</strong><small>por 24 horas</small></div>}
      <div><span>{ordinaryMinimum === 1 ? 'Por diária' : `${ordinaryMinimum} ou mais diárias`}</span><strong>{formatMoney(ordinary.total_cents / ordinary.days)}<small>/dia</small></strong><small>{policy.insurance_included ? 'Proteção incluída' : 'Somente aluguel'}</small></div>
    </div>;
}

export default function FleetRental() {
  const [catalog, setCatalog] = useState<FleetCatalog | null>(null);
  const [startDate, setStartDate] = useState(() => nextOpenDate(dateDay(1)));
  const [endDate, setEndDate] = useState(() => nextOpenDate(new Date(Date.parse(nextOpenDate(dateDay(1))+'T12:00:00Z')+2*86400000).toISOString().slice(0,10)));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:00');
  const [searched, setSearched] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
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
  const startInput = useRef<HTMLInputElement>(null);
  const start = `${startDate}T${startTime}:00-03:00`, end = `${endDate}T${endTime}:00-03:00`;
  const settings = catalog?.settings;
  const contact = settings?.whatsapp || officialWhatsApp;
  const minimumDays = catalog?.models.length ? Math.min(...catalog.models.map(model => {const policy = pricingPolicy(model); return policy.single_day_enabled ? 1 : policy.minimum_days;})) : 2;
  let days = minimumDays, periodError = '';
  try { validateStorePeriod(start,end); days = fleetPeriod({daily_cents: 1, spec: {pricing: {minimum_days: minimumDays}}}, start, end).days; } catch (cause) { periodError = (cause as Error).message; }

  useEffect(() => {
    let current = true;
    fleetApi<FleetCatalog>('catalog').then(result => {if (current) setCatalog(result);}).catch(cause => {if (current) setError(cause.message);});
    return () => {current = false;};
  }, []);

  const chooseDates = () => {
    setDatesOpen(true);
    requestAnimationFrame(() => {
      scrollToElement(document.getElementById('go-period'));
      startInput.current?.focus({preventScroll: true});
    });
  };
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
      scrollToElement(document.getElementById('go-fleet'));
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
      requestAnimationFrame(() => scrollToElement(checkout.current));
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

  const activeModels = catalog?.models.filter(model => model.active) || [];
  const models = activeModels.filter(model => `${model.brand} ${model.name}`.toLowerCase().includes(query.toLowerCase()));
  const step = reserved ? 4 : selection ? 3 : datesOpen ? 2 : 1;
  return <div className="go-public go-simple">
    <a className="go-skip" href="#go-content">Ir para o conteúdo</a>
    <header className="go-header">
      <Link href="/" className="go-brand" aria-label="Calori Go, início"><BrandLogo/></Link>

    </header>
    <main id="go-content">
      <section className="go-intro go-wrap"><h1>Alugue uma experiência do futuro.</h1><p>Reserve sua moto logo abaixo.</p></section>
      <div className="go-wrap">{error && <div role="alert" className="go-error">{error}</div>}</div>
      <section className="go-wrap go-fleet" id="go-fleet">
        <div className="go-section-heading"><div><span className="go-eyebrow">SUA PRÓXIMA COMPANHIA DE CAMINHO</span><h2>{searched ? 'Sua moto, no seu período.' : activeModels.length === 1 ? 'Conheça a nossa '+activeModels[0].name+'.' : 'Conheça nossa frota.'}</h2><p>{searched ? `${formatPeriod(Date.parse(start))} a ${formatPeriod(Date.parse(end))}. A unidade é separada ao confirmar.` : 'Veja as tarifas e consulte as datas para escolher sua moto.'}</p></div>{activeModels.length > 1 && <label className="go-search"><span>Buscar modelo</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome ou marca"/></label>}{searched && <button type="button" className="go-button go-secondary" onClick={chooseDates}>Alterar datas</button>}</div>
        {!catalog && !error && <p role="status">Carregando as motos…</p>}
        {settings && !settings.rentals_enabled && <div className="go-notice"><strong>Reservas ainda não liberadas.</strong><span>Conheça a frota e converse com a loja para combinar sua locação.</span><a href={`https://wa.me/${contact}`} target="_blank" rel="noreferrer">Conversar com a loja <ArrowUpRight size={15} aria-hidden="true"/></a></div>}
        {catalog && !models.length && <div className="go-empty"><h3>Nenhum modelo encontrado.</h3><p>{query ? 'Tente outro nome ou marca.' : 'A loja está preparando os modelos para locação. Fale com nossa equipe.'}</p></div>}
        <div className={'go-fleet-grid'+(activeModels.length === 1 ? ' go-fleet-grid-single' : '')}>{models.map((model, modelIndex) => {
          const pricing = pricingPolicy(model);
          const price = searched ? displayPrice(model, start, end) : null;
          const color = model.colors.find(item => item.id === activeColors[model.id]) || model.colors[0];
          const amount = searched ? color?.available || 0 : undefined;
          const canChoose = searched && !!price && !!amount && !!settings?.rentals_enabled;
          return <article className="go-model" key={model.id}>
            <ModelPhoto key={model.id + (color?.id || '')} model={model} color={color} priority={modelIndex === 0}/>
            <div className="go-model-body"><div className="go-model-heading"><div><span className="go-eyebrow">{model.brand}</span><h3>{model.name}</h3></div><span className="go-model-badge">100% elétrica</span></div><p className="go-model-description">{model.spec.line}</p>
              {price ? <div className="go-price" aria-live="polite"><div><span>Total para {price.days} {price.days === 1 ? 'diária' : 'diárias'}</span><strong>{formatMoney(price.total_cents)}</strong></div><span>{price.discount_cents ? 'Desconto de domingo aplicado' : `${formatMoney(price.daily_cents)}/dia`}{price.insurance_included ? ' · proteção incluída' : ' · somente aluguel'}</span></div> : <TariffOptions model={model}/>}
              {pricing.insurance_included && !!model.daily_cents && <p className="go-inclusion"><ShieldCheck size={16} aria-hidden="true"/> Proteção incluída na tarifa. Confira as condições abaixo.</p>}
              <dl className="go-model-specs"><div><dt>Autonomia estimada</dt><dd>{model.spec.range ? `Até ${model.spec.range} km` : 'A confirmar'}</dd></div><div><dt>Motor</dt><dd>{model.spec.power ? `${model.spec.power.toLocaleString('pt-BR')} W` : 'A confirmar'}</dd></div><div><dt>{model.spec.capacity_exclusive ? 'Limite operacional' : 'Carga máxima'}</dt><dd>{model.spec.capacity ? `${model.spec.capacity_exclusive ? 'Abaixo de ' : ''}${model.spec.capacity} kg` : 'A confirmar'}</dd></div></dl>
              {model.spec.color_selection !== false && <fieldset className="go-colors"><legend>Cor{color ? ` · ${color.name}` : ''}</legend>{model.colors.map(item => <button key={item.id} type="button" aria-pressed={color?.id === item.id} title={item.name} aria-label={`${model.name}, ${item.name}${searched ? `, ${item.available || 0} disponíveis no período` : ''}`} onClick={() => setActiveColors(previous => ({...previous, [model.id]: item.id}))} className={searched && !item.available ? 'go-color-unavailable' : ''}><i style={{backgroundColor: item.hex}}/><span>{item.name}</span></button>)}</fieldset>}
              <p className={'go-stock'+(searched && amount ? ' go-stock-available' : '')} role="status">{searched && !!amount && <CheckCircle2 size={17} aria-hidden="true"/>}{!model.daily_cents ? 'Preço de locação em preparação' : !searched ? 'Consulte as datas para ver a disponibilidade.' : amount ? `${amount} ${amount === 1 ? 'unidade disponível' : 'unidades disponíveis'}${model.spec.color_selection !== false ? ' nesta cor' : ' no período'}` : model.spec.color_selection === false ? 'Modelo indisponível no período' : 'Esta cor não está disponível no período'}</p>
              {!searched ? <button type="button" className="go-button go-primary" onClick={chooseDates}>Escolher datas <ArrowRight size={17} aria-hidden="true"/></button> : canChoose ? <button className="go-button go-primary" disabled={busy} onClick={() => color && choose(model, color)}>Reservar {model.spec.color_selection === false ? model.name : 'esta cor'} <ArrowRight size={17} aria-hidden="true"/></button> : <><button className="go-button go-primary" disabled>{!model.daily_cents ? 'Tarifa em preparação' : !price ? 'Período não disponível para este modelo' : 'Indisponível para reserva'}</button>{!!settings?.rentals_enabled && <button type="button" className="go-button go-text" onClick={chooseDates}>Consultar outras datas</button>}</>}
              <details className="go-details"><summary>Ficha técnica e cuidados</summary><dl className="go-specs">{[['Bateria', model.spec.battery], ['Recarga', model.spec.charge], ['Freios', model.spec.brakes], ['Velocidade informada no manual', model.spec.speed ? `${model.spec.speed} km/h` : 'A confirmar']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'A confirmar'}</dd></div>)}</dl><ul>{model.spec.notes?.map(note => <li key={note}>{note}</li>)}</ul><p className="go-fine">Autonomia varia com peso, relevo e uso. A loja confere documentação e elegibilidade antes da retirada. Fonte: {model.spec.source || 'Cadastro da loja.'}</p>{model.id === 't1' && <><a href="/manuals/t1.pdf" target="_blank" rel="noreferrer">Consultar manual da T1 <ArrowUpRight size={15} aria-hidden="true"/></a><p><a href="/api/fleet/care-guide" target="_blank" rel="noreferrer">Baixar guia de cuidados <ArrowUpRight size={15} aria-hidden="true"/></a></p></>}</details>
            </div>
          </article>;
        })}</div>
      </section>
      <section className="go-wrap go-booking-section" id="go-period" hidden={!datesOpen} aria-label="Período da locação">
        <div className="go-booking-heading"><div><h2>Quando você quer alugar?</h2></div><span className="go-timezone"><Clock3 size={15} aria-hidden="true"/> Horários de Brasília</span></div>
        <p className="go-store-hours">{storeHoursText}</p><p className="go-weekend-offer">{weekendPromotionText}</p><form className="go-period" onSubmit={search}>
          <fieldset><legend><CalendarDays size={17} aria-hidden="true"/> Retirada</legend><div><label><span>Data</span><input ref={startInput} type="date" required min={dateDay(0)} value={startDate} onChange={event => changePeriod(setStartDate, event.target.value)}/></label><label><span>Horário</span><input type="time" required min={hoursForDate(startDate)?.min} max={hoursForDate(startDate)?.max} value={startTime} onChange={event => changePeriod(setStartTime, event.target.value)}/></label></div></fieldset>
          <fieldset><legend><CalendarDays size={17} aria-hidden="true"/> Devolução</legend><div><label><span>Data</span><input type="date" required min={startDate} value={endDate} onChange={event => changePeriod(setEndDate, event.target.value)}/></label><label><span>Horário</span><input type="time" required min={hoursForDate(endDate)?.min} max={hoursForDate(endDate)?.max} value={endTime} onChange={event => changePeriod(setEndTime, event.target.value)}/></label></div></fieldset>
          <button className="go-button go-primary" disabled={busy || !catalog || !!periodError}>{busy ? 'Consultando…' : <>Ver disponibilidade <ArrowRight size={17} aria-hidden="true"/></>}</button>
          <p aria-live="polite" role={periodError ? 'alert' : undefined}>{periodError || `${days} ${days === 1 ? 'diária' : 'diárias'} de 24 horas · você paga na loja`}</p>
        </form>
        {endDate && !hoursForDate(endDate) && <button className="go-button go-secondary" type="button" onClick={()=>changePeriod(setEndDate,nextOpenDate(endDate))}>Devolver na segunda-feira</button>}
        <ol className="go-progress" aria-label="Etapas da reserva">{[{label:'Moto',enabled:true},{label:'Período',enabled:true},{label:reserved?'Confirmada':'Contato e confirmação',enabled:!!selection}].map((item,index)=><li key={index} className={step > index + 1 ? 'is-complete' : step === index + 1 ? 'is-current' : ''}><button type="button" disabled={!item.enabled} onClick={() => {if (index === 1) chooseDates(); else scrollToElement(document.getElementById(index === 0 ? 'go-fleet' : 'go-checkout'));}} aria-current={step === index + 1 || (reserved && index === 2) ? 'step' : undefined}><span>{step > index + 1 ? <Check size={15} aria-hidden="true"/> : index + 1}</span>{item.label}</button></li>)}</ol>
      </section>
      {selection && quote && <section id="go-checkout" ref={checkout} className="go-wrap go-checkout" aria-label="Concluir reserva">
        <div className="go-section-heading"><div><h2>{reserved ? 'Sua reserva foi registrada.' : 'Seu próximo caminho.'}</h2></div>{!reserved && <button type="button" className="go-button go-secondary" onClick={chooseDates}>Alterar datas</button>}</div>
        {!reserved && <div className="go-rental-heading"><h3>{selection.model.name}</h3><p><span>Retirada prevista <strong>{formatPeriod(Date.parse(start))}</strong></span><span>Devolução prevista <strong>{formatPeriod(Date.parse(end))}</strong></span></p></div>}
        <div className="go-checkout-grid"><div>
          {!reserved && <InsuranceDetails quote={quote} insurance={insurance} busy={busy} onChange={changeInsurance}/>}
          <FleetIntake key={selection.model.id + selection.color.id + start + end} model={selection.model} color={selection.color} start={start} end={end} quote={quote} disabled={busy} onReserved={afterReservation}/>
        </div>{!reserved && <aside className="go-summary">
          <div className="go-summary-title"><h3>{selection.model.name}</h3><span>{quote.days} {quote.days === 1 ? 'diária' : 'diárias'}</span></div>
          <dl><div><dt>Aluguel · {quote.days} × {formatMoney(quote.daily_cents)}</dt><dd>{formatMoney(quote.days * quote.daily_cents)}</dd></div>{!!quote.discount_cents && <div className="go-mandatory-price"><dt>Desconto de domingo · 50% do aluguel</dt><dd>− {formatMoney(quote.discount_cents)}</dd></div>}<div className={quote.insurance_included ? 'go-mandatory-price' : ''}><dt>{quote.insurance_included ? 'Seguro incluído' : insurance === 'none' ? 'Sem seguro adicional' : `Seguro ${insurance === 'basic' ? 'básico' : 'completo'}`}</dt><dd>+ {formatMoney(quote.protection_cents)}</dd></div></dl>
          {quote.insurance_included && <p className="go-mandatory-note">Seguro obrigatório: não é possível alugar este modelo sem ele.</p>}
          <dl><div className="go-total"><dt>Total</dt><dd>{formatMoney(quote.total_cents)}</dd></div></dl>
        </aside>}</div>
      </section>}
    </main><footer className="go-footer go-wrap"><div><Link href="/" className="go-brand" aria-label="Calori Go, início"><BrandLogo/></Link><p><MapPin size={17} aria-hidden="true"/>{settings?.address || pickupAddress}</p><a href={`https://wa.me/${contact}`} target="_blank" rel="noreferrer">Conversar com a loja <ArrowUpRight size={16} aria-hidden="true"/></a></div><nav aria-label="Informações da loja"><a href="#go-fleet">Nossos modelos</a><details className="go-footer-help"><summary>Como alugar</summary><p>Escolha o modelo e as datas, confira o total e informe seu contato. Aguarde a liberação da equipe para retirar e pagar na loja.</p></details><a href="/admin">Área da empresa <ArrowUpRight size={15} aria-hidden="true"/></a></nav></footer>
  </div>;
}
