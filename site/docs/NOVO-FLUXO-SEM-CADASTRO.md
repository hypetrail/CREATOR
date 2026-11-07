# Locação sem conta de cliente

Esta versão simplifica a operação para usar um catálogo público, um painel exclusivo do administrador e avisos de WhatsApp executados no servidor. O cliente não cria conta, não escolhe senha e não preenche um cadastro completo.

O projeto continua sendo uma aplicação web com servidor e D1. A simplificação remove funções de cadastro; ela não transforma o código-fonte em um pacote de arquivos HTML prontos para o uploader estático. A publicação continua pelo Cloudflare Workers integrado ao GitHub.

## O que o cliente preenche

- WhatsApp com DDD, obrigatório para o atendimento.
- Nome de atendimento, opcional.
- Autorização para guardar esse contato e enviar mensagens operacionais desta reserva.
- Aceite das condições apresentadas para o modelo, período e valores selecionados.

Não são solicitados CPF, endereço, e-mail, nascimento, documentos pessoais ou dados de responsável neste formulário. A identificação completa, a documentação, a elegibilidade e a assinatura são conferidas presencialmente pela equipe. Retirar os campos online não dispensa essas conferências.

O cliente escolhe as datas e o modelo, confere o total e confirma a solicitação. O site apresenta o código da reserva, o período, o pagamento presencial e as regras. A confirmação de uma reserva não informa que a moto já está pronta.

Não há cadastro, recuperação de senha, perfil, planos de conta ou portal de documentos do cliente neste fluxo. As rotas públicas antigas de contas e cadastro deixam de ser o caminho operacional. Reservas e documentos históricos permanecem preservados para consulta administrativa autorizada; a mudança não autoriza apagar dados antigos nem expô-los publicamente.

## O que permanece no painel

O administrador continua tendo seu próprio login e controla:

- Modelos, unidades físicas, preços e visibilidade do catálogo.
- Disponibilidade, bloqueios, manutenção e calendário.
- Reservas públicas e reservas manuais de balcão/telefone/WhatsApp.
- Preparação, liberação para retirada, retirada efetiva, devolução e cancelamento.
- Vistorias, referências de fotos locais, avarias e bloqueios de segurança.
- Pagamento presencial conferido pela equipe, despesas e ocorrências.
- Contato mínimo da reserva, permissão de mensagens e situação dos avisos.

A mesma unidade física não deve ser separada para períodos conflitantes. O intervalo de três horas entre locações e os bloqueios de manutenção continuam fazendo parte da disponibilidade. Mudanças futuras de preços ou condições não alteram o que já foi aceito numa reserva.

O prazo efetivo de devolução continua baseado no momento em que a equipe registra a retirada, com a duração contratada. A contagem não começa apenas porque o formulário foi preenchido.

## Dados mínimos e históricos

O D1 guarda os dados operacionais da frota e das reservas, seus valores e condições aceitas. A nova tabela de contatos guarda somente a referência da reserva, nome opcional, telefone normalizado e informações de autorização/revogação dos avisos.

O contato é um dado pessoal e só deve aparecer em rotas administrativas autorizadas ou na resposta da própria confirmação da reserva. Não é colocado em listagens públicas, logs de erro, chaves de idempotência ou URLs públicas. O token da API de WhatsApp também não é enviado ao navegador.

Novos contatos mínimos não dependem da chave `CUSTOMER_DATA_KEY` e não são apresentados como criptografados pela aplicação. Eles ficam no D1 com os controles da hospedagem e com acesso mediado pelo servidor. A chave anterior ainda pode ser necessária para consultar os cadastros e PDFs históricos que já foram criptografados. Preserve-a para esses históricos; não substitua por uma chave nova.

O cadastro mínimo não requer R2 ou geração de PDF. As fotos de vistoria podem permanecer no computador da loja, com nomes de arquivos e checklist registrados na reserva. Uma foto de catálogo exibida aos clientes precisa estar nos arquivos publicados do site ou em armazenamento acessível pela hospedagem.

## Quando cada mensagem é preparada

| Evento | Mensagem |
| --- | --- |
| Reserva registrada com contato autorizado | Código, modelo, período, total, pagamento na loja e orientações. |
| Administrador registra uma pendência | Aviso para concluir o atendimento com a loja; o motivo detalhado fica no painel. |
| Equipe inicia a preparação | Informação de que a reserva está em preparação. |
| Equipe libera a retirada | Moto pronta, horário confirmado e endereço. |
| Aproximação da devolução efetiva | Lembrete do prazo registrado após a retirada. |

A mensagem de moto pronta depende da liberação real da equipe, das condições de segurança e do estado atual da reserva. O sistema não conclui sozinho que a moto está carregada, revisada ou apta a ser entregue.

“Reserva incompleta” significa uma pendência registrada pela operação para uma reserva que já possui contato autorizado. Não é uma alegação de detecção automática de qualquer pessoa que abandonou a página. Sem telefone recebido e autorização, não há destinatário para avisar.

Os textos usam os valores e condições preservados na própria reserva. A rotina revalida a situação e a autorização antes de enviar. Cancelamentos, devoluções, mudanças na liberação e bloqueios de segurança devem impedir mensagens incompatíveis com o novo estado. Revogar a autorização bloqueia os envios ainda pendentes; isso não recolhe mensagens que já foram enviadas.

Eventos usam identificação própria para evitar envios repetidos. Quando o resultado de uma tentativa é incerto, a equipe deve conferir o provedor antes de repetir. Uma mensagem aceita pela API não equivale a uma confirmação de entrega ao cliente.

## Conectar o WhatsApp da loja

A integração é a WhatsApp Business Cloud API oficial. O número comercial informado na interface, sozinho, não autoriza envios automáticos.

Configure na hospedagem:

| Configuração | Finalidade |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Credencial do servidor; cadastrar como segredo. |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificação do número remetente na Meta. |
| `WHATSAPP_API_VERSION` | Versão da Graph API em uso. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Idioma do template, normalmente `pt_BR`. |
| `WHATSAPP_TEMPLATE_RENTAL` | Nome do template utilitário aprovado para os textos operacionais. |

O template usado nos textos da reserva recebe o código, o título/parte da mensagem e o texto correspondente. O nome efetivo e sua aprovação precisam ser conferidos na conta Meta. Os limites e custos são definidos pelo provedor e não desaparecem ao remover o cadastro do cliente.

A rotina programada do Worker processa os avisos a cada cinco minutos, após publicação na hospedagem. A autorização administrativa para preparar uma mensagem não substitui a configuração da API. Enquanto a conexão estiver ausente, o painel e a confirmação devem indicar que os envios estão pendentes, sem anunciar entrega realizada.

## Publicar pelo painel Cloudflare

Use a mesma conta que contém o novo banco D1 informado pelo proprietário. Consulte o [roteiro atualizado](COLOCAR-NO-AR-DO-ZERO.md):

- Banco esperado: `calori-go-db`.
- Database ID novo: `72584dd8-cc93-41f6-8495-b396a45a4d83`.
- Repositório: `hypetrail/CREATOR`.
- Branch: `main`.
- Diretório raiz: `/` (raiz do repositório).
- Build: `npm run build:cloudflare`.
- Publicação: `npm run deploy:cloudflare`.
- Node.js: `24`, escolhido por `.node-version`.

A publicação deve aplicar também a migração `0011_minimal_reservation_contacts.sql`, preservando os registros anteriores. Não importe um banco de testes na operação real.

O login do administrador continua sendo criado com o segredo provisório `ADMIN_SETUP_KEY`, de pelo menos 32 caracteres, cadastrado no painel do Worker. Abra `/admin`, crie a senha e remova a chave provisória após concluir. O fluxo novo de reserva não exige cadastrar uma nova `CUSTOMER_DATA_KEY`.

A instalação nova não exige variáveis de build. Se reutilizar configurações antigas, remova qualquer override `CALORI_D1_DATABASE_ID` que aponte para o banco anterior. Nenhum deploy na conta Cloudflare e nenhum envio real de WhatsApp devem ser presumidos pelos testes locais.

## Conferência antes de abrir a operação

Teste a reserva com um contato controlado pela empresa, a criação manual, os avisos preparados, a liberação, a retirada, o prazo efetivo e a devolução. Confira também cancelamento, manutenção, revogação de avisos e um segundo cliente tentando reservar a última unidade do mesmo período.

O pagamento continua presencial. Documentação, condições definitivas da proteção, vistoria e assinatura permanecem responsabilidades da operação da loja. A regra comercial e a elegibilidade de condução da T1 precisam ser conferidas antes da entrega.
