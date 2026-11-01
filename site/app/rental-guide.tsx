'use client';
import {useState} from 'react';
import {formatMoney, type FleetModel} from '../lib/fleet-client';
import {pricingPolicy} from '../lib/fleet-pricing';
import {supportsLoad} from '../lib/fleet-fit';

const customerDaily = (model: FleetModel) => {
  const pricing = pricingPolicy(model);
  return model.daily_cents === null ? null : model.daily_cents + (pricing.insurance_included ? pricing.insurance_daily_cents : 0);
};
export default function RentalGuide({models, fleetAnchor = '#fleet'}: {models: FleetModel[]; fleetAnchor?: string}) {
  const [distance, setDistance] = useState(20), [weight, setWeight] = useState(80), [purpose, setPurpose] = useState('daily'), [show, setShow] = useState(false);
  const active = models.filter(model => model.active), need = Math.ceil(distance * 1.25);
  const matches = active.filter(model => {
    const range = ('rangeMin' in model.spec ? Number(model.spec.rangeMin) : 0) || model.spec.range;
    return range && range >= need && supportsLoad(model.spec,weight) && (purpose !== 'passenger' || (model.spec.passengers || 0) >= 2);
  }).sort((a, b) => (customerDaily(a) ?? Infinity) - (customerDaily(b) ?? Infinity));
  const rows: [string, (model: FleetModel) => string][] = [
    ['Diária padrão', model => customerDaily(model) !== null ? formatMoney(customerDaily(model)!) : 'A confirmar'],
    ['Condições da diária', model => {const policy = pricingPolicy(model);return `${policy.minimum_days} ou mais diárias${policy.insurance_included ? ' · seguro incluído' : ' · seguro opcional'}${policy.single_day_enabled ? ' · diária única em tarifa própria' : ''}`;}],
    ['Autonomia estimada', model => model.spec.range ? `Até ${model.spec.range} km` : 'A confirmar'],
    ['Potência', model => model.spec.power ? `${model.spec.power} W` : 'A confirmar'],
    ['Velocidade informada', model => model.spec.speed ? `${model.spec.speed} km/h` : 'A confirmar'],
    ['Limite de peso', model => model.spec.capacity ? `${model.spec.capacity_exclusive?'Abaixo de ':''}${model.spec.capacity} kg no total` : 'Confirmar unidade'],
    ['Passageiros', model => model.spec.passengers ? String(model.spec.passengers) : 'A confirmar'],
    ['Bateria', model => model.spec.battery || 'A confirmar'], ['Recarga', model => model.spec.charge || 'A confirmar'],
    ['Freios', model => model.spec.brakes || 'A confirmar'],
  ];
  return <section className="shell rental-guide" id="compare"><span className="eyebrow">ESCOLHA PARA A SUA LOCAÇÃO</span><h2>Qual elétrica combina com seu trajeto?</h2>
    <div className="guide-form"><label>Km por dia (ida e volta)<input type="number" min="1" max="300" value={distance} onChange={event => {setDistance(Math.max(1, Number(event.target.value)));setShow(false);}}/></label><label>Peso total: pessoas e bagagem (kg)<input type="number" min="1" max="300" value={weight} onChange={event => {setWeight(Math.max(1, Number(event.target.value)));setShow(false);}}/></label><label>Uso principal<select value={purpose} onChange={event => {setPurpose(event.target.value);setShow(false);}}><option value="daily">Passeio e rotina</option><option value="delivery">Entregas</option><option value="passenger">Com passageiro</option></select></label><button className="btn primary" onClick={() => setShow(true)}>Ver opções para meu uso</button></div>
    {show && <div className="guide-result" role="status"><b>{matches.length ? matches.map(model => `${model.brand} ${model.name}`).join(' ou ') : 'Converse com a Calori Go antes de escolher.'}</b><p>{matches.length ? `Esses modelos têm autonomia e carga informadas compatíveis com ${distance} km por dia e ${weight} kg.` : 'Nenhum modelo com dados confirmados atende a todos os critérios informados.'} A estimativa usa {need} km, com margem de 25%, e considera recarga diária. Peso, relevo e uso alteram a autonomia.</p><p>Considere o peso somado do condutor, passageiro autorizado e bagagem. Na T1, o total precisa ficar abaixo de 120 kg; evite aproximar-se do limite.</p>{purpose === 'delivery' && <p>Confirme com a loja o uso para entregas, a fixação da carga e as paradas para recarregar.</p>}<p>A indicação não garante autonomia, elegibilidade ou disponibilidade. Confira as condições da unidade com a loja.</p><a className="text-button" href={fleetAnchor}>Consultar as motos e o período ↑</a></div>}
    <details className="rental-comparison"><summary>Comparar as motos lado a lado</summary><div className="table-scroll" tabIndex={0} aria-label="Comparação de motos para aluguel; role para os lados"><table><caption>Fichas técnicas e diárias padrão de locação</caption><thead><tr><th scope="col">Característica</th>{active.map(model => <th scope="col" key={model.id}>{model.brand} {model.name}</th>)}</tr></thead><tbody>{rows.map(([label, get]) => <tr key={label}><th scope="row">{label}</th>{active.map(model => <td key={model.id}>{get(model)}</td>)}</tr>)}</tbody></table></div></details>
  </section>;
}
