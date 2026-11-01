# CaloriMob — locação de motos elétricas

> **Versão atual da frota T1:** veja [Como gerenciar a frota](docs/COMO-GERENCIAR-A-FROTA.md), [Desenvolvimento](docs/DESENVOLVIMENTO-FROTA.md) e [Cadastro T1](docs/T1-CADASTRO.md). A página inicial e `/admin` agora usam o catálogo dinâmico e as reservas operacionais em `/api/fleet`. Os registros abaixo descrevem a versão anterior e seu histórico de decisões.

Aplicação destinada à hospedagem privada em Sites, com Vinext, D1 para modelos, unidades, reservas e bloqueios, e R2 para fotos.

O site é exclusivo de locação. O antigo endereço `/catalogo/index.html` redireciona para a página inicial. O painel fica em `/admin`. A página principal inclui filtros, comparação e indicação por trajeto/peso.

## Frota e preços — atualização de 14/10/2026

JE-7 Ecoviva e Rio Conduzza a R$ 35/dia; CX18 CaloriMob a R$ 45/dia. Uma unidade inicial por modelo, ajustável no painel. A atualização de dados é executada uma vez para o proprietário e preserva reservas existentes. Modelos antigos são desativados, sem apagar histórico. Cadastros futuros continuam permitidos.

Seguro básico R$ 15/diária (pneu furado, avarias na lataria e pintura, como riscos) ou completo R$ 30/diária (pneu furado e danos à moto alugada em queda ou colisão). Ambos incluem uma lavagem; não há cobrança separada. Terceiros não são cobertos pelo pacote. Descrições fornecidas pelo usuário para o rascunho, sem inventar franquias ou limites. Colunas antigas de lavagem são mantidas para não alterar histórico; não geram novas cobranças.

O site abre em modo de demonstração, sem gravar reservas reais. Cabeçalho e rodapé usam logo e ícone da moto enviados, exibidos em verde claro por máscara CSS. A abertura tem só texto: “Alugue uma moto elétrica. Escolha. Converse. Ande.”

As imagens da identidade visual fornecidas foram copiadas integralmente para `public/brand`. Fotos reais das três motos, endereço e WhatsApp oficial ainda faltam. A simulação funciona sem criar reserva; reservas reais continuam condicionadas ao cadastro operacional e liberação no painel. Dados técnicos incertos são sinalizados, sem prometer ré/Bluetooth ou capacidade exata da CX18.

O pagamento na retirada é implementado. Pix/cartão online está sinalizado como integração pendente; nenhuma cobrança online é realizada.

## Regras de reserva

Retirada futura e intervalo mínimo de 48 horas. Diárias de 24 horas, com frações adicionais arredondadas para uma nova diária. Valores armazenados em centavos. Tarifas e totais são recalculados no servidor.

Cada unidade possui calendário próprio. A alocação usa um único INSERT/SELECT para impedir reservas sobrepostas e respeitar manutenção/bloqueios. Os intervalos são semiabertos: devolução e próxima retirada podem ocorrer no mesmo instante. Reservas canceladas/devolvidas não bloqueiam disponibilidade. O pagamento “Pago” é registrado manualmente pela loja.

Na consulta de acesso de 14/10/2026 o serviço retornou audiência pública, em divergência com a instrução do usuário. A publicação desta atualização está suspensa até autorização para restaurar acesso privado. Nunca mudar a audiência sem aprovação explícita de Maicon. As APIs exigem a identidade fornecida pela hospedagem; o proprietário do painel é vinculado ao primeiro visitante autenticado, dentro do acesso exclusivo já confirmado da conta proprietária. Essa configuração não deve ser usada para uma primeira publicação pública.

## Validação

`node --test tests/rental.test.mjs tests/catalog.test.js` — 17 verificações de faturamento, concorrência de reservas, bloqueios, cancelamento, alterações de tarifa, autenticação, consulta, idempotência e novos modelos.

`node node_modules/typescript/bin/tsc --noEmit` — tipos.

Construir com o helper de build da habilidade Sites. As migrações são schema-only e foram geradas com `npm run db:generate`; dados iniciais são inseridos pela aplicação, fora das migrações.

`node tests/render-rental.mjs && python3 tests/structure.py` verifica a renderização inicial com React, os arquivos de marca, os rótulos e as regras responsivas em 390, 768 e 1440 px. Validação visual em navegador ficou indisponível porque a interface de navegador autorizada não foi exposta neste ambiente.

A revisão seguinte mantém publicação suspensa: a consulta de acesso ainda retorna público. É necessária aprovação explícita para restringir a audiência ou publicar publicamente. O número de WhatsApp oficial ainda deve ser informado para ativar o contato final com resumo da reserva.

## Referência e contato

WhatsApp oficial fornecido: (19) 97150-5878, link 5519971505878. Botões de contato no início e final; a conclusão da simulação envia resumo com moto, datas, pacote e total, identificando que é simulação. Contato padrão também disponível no painel.

Referência solicitada: https://www.vammo.com, consultada em 14/10/2026. Adaptada a estrutura de chamada de aluguel, seleção de modelos, planos e contato. Marca, preços, cobertura e especificações da CaloriMob preservados. Nenhuma promessa de bateria ilimitada, suporte 24h ou serviços da Vammo foi transferida.

Revisão: somente logo tipográfico no cabeçalho/rodapé; endereço de retirada fornecido em Av. dos Lírios, 142, Vila Maschietto, São José do Rio Pardo-SP, CEP 13720-146. Fotos enviadas copiadas sem edição em public/fleet: Ecoviva branca com cesto como JE-7; scooter preta com banco marrom como CX18; arte identificada Rio como Rio. Especificações permanecem as fornecidas, sem inferir potência pelo nome do arquivo. Publicação continua suspensa; prévia inline atualizada.

Visual revisado para interface clara inspirada no iOS: superfícies brancas e cinza-claro, texto preto, tipografia nativa -apple-system/SF Pro nos dispositivos Apple e fontes de sistema equivalentes em outros dispositivos. Botões em cápsula, controles segmentados, separadores sutis e verde nas ações/valores. Tema claro mantido explicitamente. Sem alteração de regras de locação ou de visibilidade.

Publicação pública autorizada explicitamente por Maicon para apresentação ao cliente. Página de demonstração funciona sem login nem chamadas às APIs de reservas; consulta local à simulação da sessão. Inicialização de banco sem proprietário é limitada ao proprietário verificado do Site, impedindo que visitantes assumam administração.
