import {MapPin} from 'lucide-react';
import {company} from '../lib/company';
import './company-details.css';
function WhatsAppIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 11.5a9 9 0 0 1-13.4 7.9L3 21l1.5-4.7A9 9 0 1 1 21 11.5Z"/><path d="m8.2 6.8 1.5 2.7-1.1 1.2a10 10 0 0 0 4.6 4.2l1.2-1.3 2.7 1.3c.2 1.3-.7 2.3-2 2.2-4.5-.3-8.9-4.9-9-8.5-.1-1.1.8-2 2.1-1.8Z"/></svg>;
}
export default function CompanyDetails({phone = company.whatsapp, address = company.address}: {phone?: string; address?: string}) {
  const phoneLabel = phone.replace(/^55(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  return <address className="go-company">
    <strong>{company.tradeName}</strong>
    <span>{company.legalName}</span>
    <span>CNPJ: {company.registration}</span>
    <a className="go-company-whatsapp" href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp da CALORIMOB: ${phoneLabel}`}><WhatsAppIcon/><span>{phoneLabel}</span></a>
    <a className="go-company-map" href={company.mapsUrl} target="_blank" rel="noopener noreferrer" aria-label="Abrir localização da CALORIMOB no Google Maps"><MapPin size={20} aria-hidden="true"/><span>{address === company.address ? <>{company.street}<br/>{company.city}</> : address}<small>Google Maps · ver localização</small></span></a>
  </address>;
}
