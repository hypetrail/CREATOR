export const features = {removable:'Bateria removível',bluetooth:'Bluetooth',reverse:'Ré',alarm:'Alarme',nfc:'Chave NFC',box:'Baú na arte',digital:'Painel digital',hydraulic:'Discos hidráulicos D/T',led:'Iluminação LED',usb:'USB',cargo_box:'Baú incluso',basket:'Cesta',sound:'Caixa de som'};
const base={power:null,peak:null,range:null,rangeMin:null,speed:null,capacity:null,battery:'A confirmar',charge:'A confirmar',brakes:'A confirmar',warranty:'A confirmar',features:[],image:null,price:null,colors:[],partial:false};
export const models=[
 {...base,id:'e50',name:'E50',brand:'BOLIN',line:'Praticidade para ir mais longe.',power:1000,range:60,speed:32,capacity:150,battery:'Lítio removível · 60 V / 20 Ah',features:['removable','box'],image:'assets/e50.png',price:8990,priceNote:'Último valor promocional registrado em 25/09/2026. Confirmar condições atuais.',source:'Arte comercial E50 atualizada em 25/09/2026 e dados informados em setembro.',notes:['Baú presente na arte comercial; confirmar se está incluso.','A arte informa carregador e manual.'],colors:['Branca (arte)']},
 {...base,id:'e60',name:'E60',brand:'BOLIN',line:'Design marcante. Rotina elétrica.',power:1000,speed:32,battery:'60 V · capacidade em Ah a confirmar',charge:'5 h (dado informado)',warranty:'1 ano',features:['box'],image:'assets/e60.png',price:9990,priceNote:'Valor de campanha encerrada em 26/09/2026. Confirmar preço atual.',source:'Arte E60 com parcelas atualizadas em 25/09/2026; dados informados em setembro.',notes:['A capacidade foi informada como 21 A e depois 20 A; unidade Ah não confirmada.','Autonomia não informada.','Baú ilustrado com detalhe vermelho; confirmar inclusão.'],colors:['Cinza','Preta','Branca','Verde','Vermelha (arte)']},
 {...base,id:'kmw',name:'KMW',brand:'KAPPAK',line:'Autonomia e tecnologia no dia a dia.',power:1000,range:60,speed:32,capacity:150,battery:'Lítio removível · 48 V / 24 Ah',charge:'4–6 h',brakes:'Discos hidráulicos dianteiro e traseiro',warranty:'1 ano',features:['removable','bluetooth','digital','hydraulic'],source:'Ficha e informações fornecidas em abril de 2026.',notes:['Aro 10”.','Banco para 2 pessoas (dado informado); respeitar a carga total.'],colors:['Preta','Branca','Azul']},
 {...base,id:'kn8',name:'KN8',brand:'KAPPAK',line:'Uma opção para deslocamentos urbanos.',power:1000,range:60,speed:32,capacity:150,battery:'Lítio removível · 60 V / 24 Ah',charge:'4–6 h',brakes:'Disco hidráulico dianteiro / tambor traseiro',warranty:'1 ano',features:['removable','digital'],source:'Ficha e informações fornecidas em abril de 2026.',notes:['Aro 10”.','Sem Bluetooth, conforme informação registrada.'],colors:['Prata','Branca','Vermelha','Preta']},
 {...base,id:'cx18',name:'CX18',brand:'CALORIMOB',line:'Mais recursos para sua rotina.',power:1000,peak:2000,range:50,rangeMin:40,speed:32,capacity:200,battery:'Lítio removível · 60 V / 24 Ah',charge:'6–7 h',brakes:'A confirmar · fichas divergentes',features:['removable','bluetooth','reverse','alarm','nfc','digital','led'],source:'Dados técnicos fornecidos em abril de 2026. Freios com divergência entre registros de 17 e 22/04.',notes:['Há registros de discos hidráulicos D/T e de freio a tambor. Confirmar a configuração da unidade.','Caixa de som, 3 níveis, BMS Daly, suspensão dupla, guidão chopper e descanso com sensor informados.','Banco para 2 pessoas (dado informado); respeitar a carga total.'],colors:['Carbono','Preta','Branca']},
 {...base,id:'he6',name:'HE-6',brand:'ECOVIVA',line:'Uma alternativa com carga de até 180 kg.',range:60,rangeMin:50,speed:32,capacity:180,battery:'60 V / 20 A · unidade a confirmar',brakes:'Discos dianteiro e traseiro',source:'Dados técnicos já informados à CaloriMob em 2026; potência e unidade da capacidade da bateria não confirmadas.',notes:['Pneus 10”.','Não há confirmação do tipo de bateria ou se é removível.']},
 {...base,id:'x13pd',name:'X13 PD',brand:'MODELO INFORMADO',line:'Ficha técnica em complemento.',power:1000,battery:'Lítio · 60 V / 20 A · unidade a confirmar',brakes:'Discos dianteiro e traseiro',source:'Dados informados em 24/09/2026.',notes:['Pneus 10”.','Não foi possível confirmar se a denominação PD corresponde à Panda.']},
 ...[
 ['panda','X13 Panda','Modelo registrado em venda da CaloriMob.'],
 ['carbono','X13 Carbono','Modelo registrado em venda da CaloriMob.'],
 ['z02','Z02','Modelo registrado em venda da CaloriMob.'],
 ['kw3','KW3','Cores informadas: azul, vermelha, preta e prata.'],
 ['tri','Big Tri Moto Chef','Modelo já mencionado no portfólio.'],
 ['akmw','AKMW','Denominação já mencionada; ficha e relação com KMW a confirmar.']
 ].map(([id,name,note])=>({...base,id,name,brand:'MODELO INFORMADO',line:'Ficha técnica a confirmar.',partial:true,source:'Modelo mencionado em registros anteriores da CaloriMob, sem ficha técnica completa disponível.',notes:[note]}))
];
export function filterModels(list,{query='',power='',range=0,features:required=[],detailed=false}={}){
 const q=query.trim().toLocaleLowerCase('pt-BR');
 return list.filter(m=>(!q||(m.name+' '+m.brand).toLocaleLowerCase('pt-BR').includes(q))&&(!power||(power==='unknown'?m.power===null:power==='over1000'?m.power>1000:m.power===Number(power)))&&(!range||(m.range!==null&&m.range>=Number(range)))&&required.every(f=>m.features.includes(f))&&(!detailed||!m.partial));
}
export function recommend(list,{distance=20,weight=80,purpose='daily',required=[]}={}){
 const need=Math.ceil(Number(distance)*1.25),load=Number(weight);
 const candidates=list.filter(m=>m.range!==null&&m.capacity!==null&&!m.partial).map(m=>{
   const conservative=m.rangeMin??m.range;
   const missing=required.filter(f=>!m.features.includes(f));
   const reasons=[],warnings=[];
   let eligible=conservative>=need&&m.capacity>=load&&!missing.length;
   if(conservative>=need) reasons.push(`Autonomia informada de ${m.rangeMin?m.rangeMin+'–':''}${m.range} km cobre ${need} km de referência.`); else warnings.push(`Autonomia de referência insuficiente para ${need} km.`);
   if(m.capacity>=load)reasons.push(`Carga informada de ${m.capacity} kg comporta o total indicado de ${load} kg.`);else warnings.push(`Carga máxima informada abaixo de ${load} kg.`);
   for(const f of required.filter(f=>m.features.includes(f)))reasons.push(`${features[f]} informado neste modelo.`);
   for(const f of missing)warnings.push(`${features[f]} sem confirmação neste modelo.`);
   if(purpose==='delivery') warnings.push('Para entregas, confirmar baú, fixação, carga, trajeto e recargas com a loja.');
   if(purpose==='passenger') warnings.push('Confirmar homologação, configuração do banco e adequação para passageiro.');
   let score=conservative-need+(m.capacity-load)/10+(m.features.includes('removable')?8:0);
   return {model:m,eligible,score,reasons,warnings};
 });
 return {need,candidates:candidates.filter(c=>c.eligible).sort((a,b)=>b.score-a.score).slice(0,3),excluded:list.filter(m=>m.range===null||m.capacity===null||m.partial).map(m=>m.name)};
}
