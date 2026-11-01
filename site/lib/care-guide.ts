export interface CareGuideSection {title:string;text:string}
export interface CareGuide {
 version:string;model_id:string;title:string;contact:string;
 sections:CareGuideSection[];source_notes:string[];
}

/**
 * Manufacturer information comes from the supplied, unchanged T1 manual.
 * Commercial restrictions are identified as owner rules. No live internet
 * research or legal classification has been represented as verified.
 */
export const defaultCareGuide:CareGuide={
 version:'cuidados-t1-2026-10-29',model_id:'t1',title:'Cuidados básicos com a moto elétrica T1',
 contact:'CaloriMob / Calori Go · WhatsApp: (19) 97150-5878',
 sections:[
  {title:'Antes de retirar',text:'Confira a documentação, a elegibilidade para conduzir a unidade, o contrato e a vistoria de saída com a equipe. Peça uma demonstração dos comandos, freios, painel e carregamento. O acompanhamento e a assinatura dos pais não substituem habilitação ou outros requisitos legais. A liberação da unidade depende dessas conferências.'},
  {title:'Peso total e passageiro',text:'Na locação da T1, a soma do peso do condutor, eventual passageiro e carga deve ficar abaixo de 120 kg. Evite aproximar-se desse limite. Passageiro somente quando a documentação, a configuração e o uso da unidade forem autorizados pela empresa; a existência de banco traseiro não confirma a lotação. Essa é a regra operacional mais restritiva adotada pela CaloriMob; o manual original informa 150 kg.'},
  {title:'Trajeto e condução',text:'Use capacete adequado, conduza com atenção e respeite os equipamentos e as regras exigidos para a unidade. Pela regra da CaloriMob, não circular em vias movimentadas, estradas vicinais ou rodovias. O trajeto escolhido também precisa ser permitido para o enquadramento do veículo. Não faça manobras perigosas, não sobrecarregue a moto e não a empreste a terceiros sem autorização.'},
  {title:'Conferência antes de cada uso',text:'Confira freios, pneus, rodas, fixações, iluminação e sistema elétrico, além do nível e da fixação da bateria. Não utilize a moto com componente danificado, perda de frenagem ou funcionamento anormal. Se houver dúvida, pare o uso e fale com a CaloriMob; não realize ajustes ou reparos por conta própria.'},
  {title:'Recarga correta',text:'Utilize somente o carregador entregue ou autorizado para aquela unidade. Em local protegido, seco e adequado, conecte primeiro o plugue à bateria e depois à tomada. Ao terminar, desconecte primeiro da rede elétrica. Interrompa o carregamento quando o indicador do carregador ficar verde, conforme o manual. Não use adaptadores elétricos improvisados, carregador incompatível ou equipamento danificado. A recarga completa é estimada em 6 a 7 horas; três horas de preparação entre locações não garantem uma carga completa.'},
  {title:'Água, limpeza e calor',text:'Evite alagamentos e contato excessivo com água. Não utilize lavadora de alta pressão, não mergulhe a moto ou a bateria e não exponha a bateria a calor excessivo. Mantenha os componentes elétricos protegidos. O manual indica faixa ideal de funcionamento entre 0 °C e 35 °C e informa que temperaturas extremas reduzem a autonomia; isso não substitui as orientações específicas do carregador e da unidade.'},
  {title:'Bateria e autonomia',text:'Não abra a bateria, não altere componentes e não permita intervenção de terceiros sem autorização. A autonomia estimada de 50 km não é garantia de percurso: peso, relevo, pneus, bateria e condições de uso afetam o resultado. Se perceber aquecimento anormal, cheiro incomum, dano, perda de potência ou falha de carga, interrompa o uso e entre em contato com a empresa para orientação técnica.'},
  {title:'Falha, queda ou acidente',text:'Comunique imediatamente qualquer barulho anormal, falha de freios, bateria, painel ou funcionamento, além de queda, impacto ou dano. Em acidente, furto ou roubo, avise imediatamente a CaloriMob e registre Boletim de Ocorrência quando necessário. Em emergência, acione o serviço público adequado. Não autorize reparos, transporte ou outras despesas em nome da empresa sem orientação.'},
  {title:'Devolução e prazo',text:'Confira o horário de devolução registrado no atendimento de retirada e acompanhe sua reserva. A quantidade de diárias começa a contar quando a equipe registra a retirada efetiva. Solicite prorrogação antes do prazo e aguarde autorização; a existência de uma solicitação não prorroga a locação. Devolva chave, carregador e todos os acessórios e participe da vistoria de retorno. Cobranças por atraso e responsabilidades seguem a versão das condições aceita na sua reserva.'},
 ],
 source_notes:[
  'Manual de instruções T1 New e-bike, versão branca, fornecido pela empresa: página 1 (especificações e recarga), página 2 (inspeção e bateria), página 3 (segurança, manutenção e falhas). O PDF original permanece sem alterações em /manuals/t1.pdf.',
  'Limite operacional abaixo de 120 kg, restrições de trajetos, acompanhamento dos pais e rotinas de locação: regras informadas pela CaloriMob em 29/10/2026. Enquadramento legal, documentação e eventual passageiro exigem confirmação para a unidade.',
  'Este guia organiza cuidados básicos e não substitui o manual do fabricante, as condições da reserva, a vistoria, a apólice ou a avaliação de um profissional.',
 ],
};

/** Parse a saved guide without silently replacing it with newer instructions. */
export function parseCareGuide(value:unknown):CareGuide{
 if(!value||typeof value!=='object')throw new Error('Guia de cuidados inválido.');
 const raw=value as Record<string,unknown>;
 const clean=(input:unknown,max:number)=>String(input??'').trim().slice(0,max);
 if(!Array.isArray(raw.sections)||!raw.sections.length||raw.sections.length>20||!Array.isArray(raw.source_notes))throw new Error('Guia de cuidados incompleto.');
 const sections=raw.sections.map(entry=>{
  if(!entry||typeof entry!=='object')throw new Error('Seção de cuidados inválida.');
  const section=entry as Record<string,unknown>,title=clean(section.title,200),text=clean(section.text,5000);
  if(!title||!text)throw new Error('Seção de cuidados incompleta.');
  return {title,text};
 });
 const result={version:clean(raw.version,100),model_id:clean(raw.model_id,80),title:clean(raw.title,200),contact:clean(raw.contact,300),sections,source_notes:raw.source_notes.slice(0,10).map(note=>clean(note,2000))};
 if(!result.version||!result.model_id||!result.title)throw new Error('Identificação do guia de cuidados incompleta.');
 return result;
}
