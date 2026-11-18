import {company} from './company';
export const packages = [
 {id:'none',title:'Aluguel básico',fee:0,description:'A moto para o seu período, sem seguro adicional.',items:['Mínimo de 2 diárias','Retirada na CaloriMob']},
 {id:'basic',title:'Aluguel + seguro básico',fee:1500,description:'Proteção para pequenos imprevistos.',items:['Pneu furado','Avarias na lataria e pintura, como riscos','Uma lavagem incluída']},
 {id:'full',title:'Aluguel + seguro completo',fee:3000,description:'Proteção para danos à moto alugada.',items:['Pneu furado','Danos à moto em queda ou colisão','Uma lavagem incluída']}
] as const;
export const coverageSummary='Básico: pneu furado e avarias na lataria e pintura, como riscos. Completo: pneu furado e danos à moto alugada em queda ou colisão. Ambos incluem uma lavagem. A cobertura de colisão se limita à moto alugada e não cobre terceiros.';

export const officialWhatsApp=company.whatsapp;

export const pickupAddress=company.address;
