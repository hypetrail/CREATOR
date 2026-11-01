'use client';

import {useEffect,useRef,useState} from 'react';
import {formatPeriod} from '../lib/fleet-client';

interface Props {status:string;actualStart?:number|null;actualEnd?:number|null;due?:number|null;serverNow?:number}
function duration(milliseconds:number){
 const seconds=Math.floor(Math.max(0,milliseconds)/1000),days=Math.floor(seconds/86400),hours=Math.floor((seconds%86400)/3600),minutes=Math.floor((seconds%3600)/60);
 return `${days?days+' dia(s) · ':''}${String(hours).padStart(2,'0')}h ${String(minutes).padStart(2,'0')}min ${String(seconds%60).padStart(2,'0')}s`;
}
export default function ReservationClock({status,actualStart,actualEnd,due,serverNow}:Props){
 const [now,setNow]=useState(0),offset=useRef(0);
 useEffect(()=>{offset.current=serverNow?serverNow-Date.now():0;},[serverNow]);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()+offset.current),1000);return()=>window.clearInterval(timer);},[]);
 if(!actualStart)return <div className="fa-info fa-rental-clock"><strong>Tempo de locação ainda não iniciado</strong><p>O administrador registra a retirada após a vistoria. O prazo passa a contar nesse momento.</p></div>;
 if(actualEnd||status==='returned')return <div className="fa-info fa-rental-clock"><strong>Locação encerrada</strong><p>Retirada: {formatPeriod(actualStart)}{actualEnd?` · Devolução: ${formatPeriod(actualEnd)}`:''}</p></div>;
 if(status!=='rented'||!due)return null;
 const overdue=now>due;
 return <div className={'fa-rental-clock '+(overdue?'fa-clock-overdue':'fa-info')}><strong>{now?(overdue?'Prazo ultrapassado':'Tempo restante da locação'):'Atualizando relógio…'}</strong>{now>0&&<div className="fa-clock-number" role="timer" aria-label={overdue?'Tempo de atraso':'Tempo restante'}>{duration(overdue?now-due:due-now)}</div>}<p>Retirada registrada: {formatPeriod(actualStart)} · Devolução combinada: {formatPeriod(due)}</p>{overdue&&<p>Acompanhe o cliente e confira as condições aceitas antes de registrar eventual cobrança.</p>}</div>;
}
