# Cadastro inicial da T1

> Atualização vigente: consulte [Fluxo do site e WhatsApp](FLUXO-SITE-WHATSAPP.md). A T1 não tem escolha pública de cor, o e-mail é opcional, o cadastro continua completo e o atraso desconta duas horas antes da cobrança por hora iniciada. Referências anteriores divergentes abaixo são históricas.

O modelo **New e-bike T1** possui cinco unidades físicas confirmadas pela loja, uma em cada cor: Azul, Branca, Verde, Vermelha e **Verde camela**. O nome da quinta cor foi preservado como informado. Os códigos internos `t1-001` a `t1-005` não são números de chassi ou de série; preencha a identificação real de cada unidade no painel.

A tarifa confirmada para **duas diárias ou mais** é de **R$ 45 por diária**, composta por **R$ 30 de locação + R$ 15 de seguro obrigatório**. Duas diárias totalizam R$ 90. O cadastro de novas cores não cria estoque automaticamente: cadastre cada moto física separadamente.

A exceção de **uma diária de 24 horas por R$ 60** foi confirmada: **R$ 45 de locação + R$ 15 de seguro obrigatório**. O cadastro mantém `single_day_enabled: true`. As condições de cobertura e operação ainda precisam ser conferidas antes da liberação.

## Fontes e imagens

- Documento original: `public/manuals/t1.pdf`, cópia sem alterações do PDF “660322 - SCOOTER ELET T1 1000W BRANCO B-LITIO 64V.pdf” fornecido pela loja.
- Imagem do modelo: `public/fleet/t1/manual.png`, extraída da imagem incorporada ao PDF, restaurando sua máscara original de transparência. A foto é ilustrativa e não foi atribuída a uma cor: o acabamento difere das fotos apresentadas na conversa.
- As cinco imagens apresentadas na conversa mostram Azul, Branca repetida, Verde e Vermelha. Elas ainda precisam ser recebidas como arquivos e vinculadas às cores pelo painel. A quinta cor não possui foto identificada.
- Os campos de galeria por cor começam vazios. Os seletores exibem referências de tonalidade, não uma promessa de correspondência exata à pintura.

## Dados técnicos cadastrados

| Informação | Documento fornecido |
|---|---|
| Motor | Traseiro sem escovas, 1.000 W |
| Bateria | Lítio removível, 64 V, 20 Ah, 1.280 Wh |
| Autonomia | Estimada em 50 km |
| Velocidade máxima assistida | 50 km/h |
| Recarga | Aproximadamente 6 a 7 horas |
| Carga máxima informada pelo manual | 150 kg |
| Limite operacional da locação, definido em 29/10/2026 | Soma de condutor, eventual passageiro e carga **abaixo de 120 kg**, evitando aproximar-se do limite |
| Peso | 57,5 kg |
| Dimensões | 158 × 67 × 111 cm |
| Freios | Disco hidráulico dianteiro e tambor traseiro |
| Rodas e pneus | 14 polegadas; 2.75 × 14 sem câmara |
| Recursos | NFC, alarme integrado, bateria removível e cesta |
| Passageiros | Não informado; confirmar |

O limite de 120 kg é uma restrição comercial mais conservadora da CaloriMob; ele não altera o PDF original do fabricante. O cadastro usa `capacity: 120`, `capacity_exclusive: true` e preserva `manufacturer_capacity: 150`.

A solicitação comercial de até duas pessoas fica separada da lotação confirmada: `commercial_passengers: 2`, enquanto `passengers: null` permanece até conferência da documentação e configuração. A política de solicitações a partir de 16 anos é registrada com revisão de elegibilidade obrigatória; pais presentes e assinando para 16 e 17 anos não dispensam habilitação, idade ou outros requisitos legais aplicáveis.

O manual identifica a versão branca. A loja deve conferir a configuração das outras unidades antes de aplicar a mesma ficha técnica. A velocidade de 50 km/h foi mantida conforme o documento, sem reutilizar os 32 km/h de outros modelos. Este cadastro não estabelece dispensa de habilitação nem enquadramento de circulação.

## Próximos passos no painel

1. Conferir as tarifas de R$ 60 para uma diária e R$ 45/dia para duas ou mais, sua composição e os dados técnicos do modelo.
2. Conferir a identificação física, a cor e o estado das cinco unidades.
3. Enviar as fotos originais e associá-las à respectiva cor.
4. Confirmar condições operacionais antes de liberar reservas.
5. Manter as unidades em manutenção ou fora de operação quando indisponíveis, preservando o histórico.

## Novas regras operacionais informadas em 29/10/2026

- Limite combinado estritamente abaixo de 120 kg e rotas autorizadas: não circular em vias movimentadas, estradas vicinais ou rodovias. A rota também precisa ser legalmente permitida para a unidade.
- Três horas de preparação entre locações para vistoria, limpeza e avaliação da recarga. Esse prazo não equivale à carga completa de 6–7 horas indicada pelo manual.
- Vistorias de saída e retorno com fotos e conferência de moto, bateria, carregador, chave e acessórios.
- Proteção básica de R$ 15/dia: regras fornecidas para pneu furado, seta e carenagem. A participação de terceiros em uma colisão não exclui os danos básicos previstos à moto alugada; danos a terceiros e quebra do chassi permanecem excluídos. Seguradora/natureza da proteção, franquias e limites ainda exigem definição documental.
- Nova regra confirmada de atraso: até duas horas de tolerância, inclusive ao atravessar a meia-noite; após esse prazo, metade da diária se a devolução ocorrer na mesma data prevista. No dia seguinte, uma diária inteira com seguro substitui a metade, sem somar as duas. Atrasos que alcancem dois ou mais dias posteriores ficam para conferência, pois não foi aprovada repetição automática. Reservas anteriores preservam sua versão contratada.
- Guia `cuidados-t1-2026-10-29` baseado no manual fornecido e nas regras da empresa, disponível em PDF junto aos documentos de locação. Não foi possível consultar fontes externas neste ambiente; não se apresenta esta elaboração como pesquisa atual da internet.

A ficha técnica do manual identifica 64 V nominais e menciona carregador de 60 V / 3 A. A equipe deve conferir os rótulos e a compatibilidade do conjunto real com o fornecedor; o guia do cliente orienta usar apenas o carregador entregue ou autorizado para aquela unidade, sem recomendar substituição por tensão presumida.
