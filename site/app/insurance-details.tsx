import {ShieldCheck} from 'lucide-react';
import {defaultDocumentPolicy} from '../lib/document-policy';
import type {FleetQuote} from '../lib/fleet-client';
import type {Insurance} from '../lib/rental';

export default function InsuranceDetails({quote, insurance, busy, onChange}: {quote: FleetQuote; insurance: Insurance; busy: boolean; onChange: (value: Insurance) => void}) {
  const coverage = quote.settings.coverage;
  const standard = coverage === defaultDocumentPolicy.clauses.insurance;
  return <details className="go-insurance go-insurance-bar"><summary><ShieldCheck size={18} aria-hidden="true"/><span>{quote.insurance_included ? 'Seguro obrigatório · entenda a cobertura' : 'Proteção · veja as opções'}</span></summary>
    {quote.insurance_included ? <p>O seguro faz parte da tarifa deste modelo para oferecer a proteção básica prevista nas condições. Não há opção de locação sem ele.</p> : <fieldset><legend>Escolha sua proteção</legend>{([['none','Somente aluguel'],['basic','Seguro básico'],['full','Seguro completo']] as const).map(([id,label])=><label key={id}><input type="radio" name="insurance" checked={insurance===id} disabled={busy || (id!=='none'&&!quote.settings.protection_enabled)} onChange={()=>onChange(id)}/>{label}</label>)}</fieldset>}
    {standard ? <><strong>O que cobre na moto alugada</strong><ul><li>Pneu furado.</li><li>Seta quebrada em uma queda.</li><li>Carenagem danificada em uma queda.</li></ul><strong>O que não cobre</strong><ul><li>Quebra do chassi.</li><li>Danos a terceiros.</li><li>Outros danos e despesas não previstos nas condições.</li></ul><p>Terceiros envolvidos no acidente não excluem, por si só, os danos básicos cobertos da moto alugada.</p><p>Limites, eventuais franquias e procedimento de atendimento devem ser conferidos com a loja. Não se presume cobertura irrestrita.</p><details><summary>Condições completas da proteção</summary><p>{coverage}</p></details></> : <ul>{(coverage || 'Confira a cobertura com a loja antes de reservar.').split(/\n+|(?<=[.!?])\s+/).filter(Boolean).map((text,index)=><li key={index}>{text}</li>)}</ul>}
  </details>;
}
