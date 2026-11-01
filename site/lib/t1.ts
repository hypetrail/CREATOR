export type FleetColor = {
  id: string;
  name: string;
  hex: string;
  photos: string[];
};

// Internal fleet finish only. Customers choose the model, never a T1 color.
export const t1Colors: FleetColor[] = [
  {id: 'padrao-loja', name: 'Padrão da loja', hex: '#f58220', photos: []},
];

export const t1Model = {
  id: 't1',
  name: 'T1',
  brand: 'New e-bike',
  daily_cents: 3000,
  quantity: 5,
  active: 1,
  photos: ['/fleet/t1/manual.png'],
  colors: t1Colors,
  spec: {
    color_selection: false,
    pricing: {
      insurance_included: true,
      insurance_daily_cents: 1500,
      minimum_days: 2,
      single_day_enabled: true,
      single_day_rental_cents: 4500,
    },
    power: 1000,
    rangeMin: null,
    range: 50,
    speed: 50,
    // Rental operating limit supplied by the owner. It is intentionally more
    // restrictive than the original manual, which remains available unchanged.
    capacity: 120,
    capacity_exclusive: true,
    manufacturer_capacity: 150,
    operational_rules_version: 't1-operacao-2026-10-29',
    commercial_minimum_age: 16,
    commercial_passengers: 2,
    eligibility_review_required: true,
    passengers: null,
    battery: 'Lítio removível · 64 V / 20 Ah · 1.280 Wh',
    charge: 'Aproximadamente 6 a 7 horas',
    brakes: 'Disco hidráulico dianteiro; tambor traseiro',
    weight: 57.5,
    dimensions: '158 × 67 × 111 cm',
    wheels: '14 polegadas · pneus 2.75 × 14 sem câmara',
    features: ['removable', 'nfc', 'alarm', 'basket'],
    line: 'Motor de 1.000 W e bateria removível para sua mobilidade.',
    partial: false,
    source: 'Manual T1 New e-bike, versão branca, e regras operacionais da CaloriMob informadas em 29/10/2026.',
    manual: '/manuals/t1.pdf',
    photo_note: 'Imagem ilustrativa extraída do manual; confira a foto e a configuração da unidade escolhida.',
    notes: [
      'Autonomia estimada de 50 km no manual; varia com carga, trajeto, bateria e condições de uso.',
      'Velocidade máxima assistida de 50 km/h informada no manual. Confirme a configuração da unidade e os requisitos de circulação antes de alugar.',
      'Confirme os equipamentos e a configuração técnica da unidade na retirada.',
      'Regra da locação: a soma do peso de condutor, eventual passageiro e carga deve ficar abaixo de 120 kg. Evite aproximar-se desse limite.',
      'O manual informa 150 kg; a CaloriMob adotou o limite operacional mais restritivo, abaixo de 120 kg.',
      'A presença de passageiro depende da documentação, da configuração e da autorização de uso da unidade. O manual não confirma a lotação; não basta haver um banco traseiro.',
      'A política comercial proposta admite solicitações a partir de 16 anos e exige pais presentes e assinando para 16 e 17 anos. A liberação depende da elegibilidade legal de condução; acompanhamento não substitui habilitação ou documentação exigida.',
      'Não circular em vias movimentadas, estradas vicinais ou rodovias. O trajeto também precisa ser permitido para o enquadramento da unidade.',
    ],
  },
};

// Five physical bikes with the same store finish. Internal labels are
// generated identifiers only; they do not stand in for chassis/serial numbers.
export const t1Units = Array.from({length: 5}, (_, index) => ({
  id: `t1-${String(index + 1).padStart(3, '0')}`,
  model_id: 't1',
  ordinal: index + 1,
  color: t1Colors[0].id,
  label: `T1 · ${String(index + 1).padStart(3, '0')}`,
  identifier: '',
  status: 'available',
}));
