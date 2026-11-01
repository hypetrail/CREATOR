# WhatsApp, verificação de telefone e lembretes

O código usa a API oficial WhatsApp Business Cloud da Meta. Os testes utilizam requisições simuladas; nenhuma mensagem real foi enviada nem conta da Meta conectada por esta atualização. Informar um telefone não concede acesso ao WhatsApp.

## Preferências e identificação

O cadastro mantém telefone, hash de senha e preferências. Criar uma conta não comprova que a pessoa controla aquele telefone: o campo `phone_verified` começa falso. A confirmação exige um código temporário enviado por um template de autenticação aprovado.

Há autorizações separadas para:

- **Avisos da locação:** preparação, retirada liberada, cuidados e devolução.
- **Ofertas de disponibilidade:** comunicações de natureza promocional.

Uma autorização não substitui a outra. As ofertas começam desativadas. Antes de enviar, o servidor confere novamente telefone verificado, conta ativa e autorização correspondente. A revogação impede o envio das mensagens ainda pendentes quando forem processadas.

## Configuração da conta oficial

Uma pessoa responsável precisa configurar o negócio e remetente na Meta, os templates e o faturamento aplicável. Guarde os valores sensíveis no gerenciador de segredos da hospedagem, nunca no Git ou no chat.

| Variável | Finalidade |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Token autorizado para o remetente da conta oficial. |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador técnico do número na Meta, diferente do telefone escrito com DDD. |
| `WHATSAPP_API_VERSION` | Versão atualmente suportada e escolhida na conta, no formato `vNN.N`. Nenhuma versão é presumida automaticamente. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Idioma do template; padrão `pt_BR`. |
| `WHATSAPP_TEMPLATE_AUTH` | Nome do template aprovado de autenticação para o código temporário. |
| `WHATSAPP_TEMPLATE_PREPARING` | Template de início de preparação. |
| `WHATSAPP_TEMPLATE_READY` | Template de retirada efetivamente liberada. |
| `WHATSAPP_TEMPLATE_RETURN_REMINDER` | Template de lembrete de devolução. |
| `WHATSAPP_TEMPLATE_CARE` | Template de cuidados e link para o manual público. |
| `WHATSAPP_TEMPLATE_AVAILABILITY` | Template promocional de disponibilidade. |
| `APP_PUBLIC_URL` ou `WHATSAPP_SITE_URL` | Endereço HTTPS público da aplicação, usado nos links de consulta e manual. |
| `RETURN_REMINDER_MINUTES` | Antecedência do lembrete, entre 15 e 1.440 minutos; padrão 120 minutos. |
| `CUSTOMER_OTP_SECRET` | Segredo forte da verificação do cadastro, configurado no módulo de contas. |
| `NOTIFY_CRON_SECRET` | Segredo com pelo menos 32 caracteres para o agendador HTTP. |

As saídas HTTPS precisam estar autorizadas na política de rede da hospedagem, incluindo `graph.facebook.com`. Nesta configuração de nuvem, os domínios externos dependem da configuração de rede aprovada. Ter uma variável preenchida não comprova que a conta, o template, a política de rede ou o faturamento estão autorizados.

Os nomes configurados devem corresponder a templates realmente aprovados. Todos os disparos automáticos deste módulo usam templates; o código não presume uma janela de conversa aberta para enviar texto livre. Taxas e limites dependem das regras e da conta da Meta vigentes e não foram cotados nesta atualização.

## Parâmetros dos templates

Os textos abaixo são sugestões para criação e revisão na Meta, não templates automaticamente aprovados. A ordem e a quantidade dos parâmetros precisam corresponder exatamente à configuração do código:

| Tipo | Parâmetros de corpo em ordem |
| --- | --- |
| Preparação | Número da reserva; modelo; cor. |
| Pronta para retirada | Número da reserva; modelo; cor; data/horário confirmado; endereço preservado na reserva. |
| Devolução | Número da reserva; modelo; data/horário efetivo de devolução previsto; orientação de devolução e prorrogação. |
| Cuidados | Número da reserva; orientação resumida; link HTTPS para `/api/fleet/care-guide`. |
| Disponibilidade | Modelos disponíveis para consulta; endereço HTTPS do site. |

O template de preparação informa que a equipe está preparando a moto e que a pessoa deve aguardar a liberação. Ele não afirma que a moto está pronta ou carregada. O template de disponibilidade deve orientar a consultar as datas; uma mensagem promocional não separa uma unidade nem garante disponibilidade futura.

O template de autenticação segue o formato de autenticação da Meta: código no corpo e no botão de cópia/autenticação. A criação, expiração, quantidade de tentativas e validação do código pertencem ao módulo de contas. O código não é devolvido ao navegador pela API.

## Agendamento e resultado

O módulo grava eventos em `customer_notifications`, com referência à conta/reserva, tipo, horário, estado e identificador do provedor. Não copia CPF, endereço, senha, telefone ou documento para a fila. O telefone é consultado no cadastro protegido somente na hora de enviar.

Os eventos de preparação e liberação são registrados pela operação. O lembrete considera `due_ms`, calculado a partir da retirada real, com antecedência padrão de duas horas. O aviso de cuidados é programado para cinco minutos depois da retirada. Um processamento periódico também recupera eventos atuais que ainda não foram enfileirados.

O agendador precisa chamar `processNotifications()` periodicamente. A integração HTTP alternativa é `POST /api/notifications`, com `Authorization: Bearer` usando o segredo armazenado em `NOTIFY_CRON_SECRET`. Sem segredo válido, a rota não processa mensagens. Configure o agendador e as credenciais na hospedagem antes de prometer avisos automáticos.

Eventos desatualizados são cancelados, por exemplo quando a locação foi devolvida, a liberação mudou ou a autorização foi revogada. A campanha de disponibilidade é solicitada pelo administrador; consultar o catálogo não dispara mensagens. São considerados apenas modelos com unidades disponíveis, sem impedimento de segurança e livres no período conservador de referência de dois dias, com intervalo de preparação. A reserva real sempre consulta novamente as datas escolhidas.

As campanhas processam até 1.000 contatos elegíveis por solicitação e respeitam no máximo um aviso de disponibilidade por conta em sete dias, contando o momento real de submissão. A disponibilidade e a autorização são novamente conferidas antes do envio.

| Estado | Significado |
| --- | --- |
| `pending` | Evento aguardando o horário e o processamento. |
| `sending` | Uma execução já assumiu o evento. Outra execução não o repete. |
| `not_configured` | Conexão, template ou endereço público ainda pendente. Não consome tentativas de envio. |
| `submitted` | API aceitou a mensagem e devolveu identificador. Não é confirmação de entrega ou leitura. |
| `failed` | Falha confirmada; uma nova tentativa pode ocorrer, até o limite de cinco. |
| `cancelled` | Evento perdeu validade ou autorização. |
| `unknown` | O provedor não confirmou o resultado, ou a execução foi interrompida durante o envio. |

O envio da Meta não oferece uma garantia de idempotência para este fluxo. Resultados incertos e execuções interrompidas não são repetidos automaticamente. O administrador precisa conferir o resultado no provedor. Não há webhook de entrega/leitura implementado nesta etapa.

## Arquivo de vistoria no WhatsApp da empresa

O envio automático de um PDF privado de vistoria usa `sendInspectionArchivePDF()` e exige:

- `WHATSAPP_TEMPLATE_INSPECTION`: template de utilidade aprovado com cabeçalho do tipo documento.
- `INSPECTION_ARCHIVE_PHONE`: número de arquivo da empresa, permitido como destinatário pela Meta.

O número destinatário não é aceito livremente de uma solicitação: precisa corresponder ao número configurado. Não se presume que o próprio número remetente da conta oficial possa receber mensagens de si mesmo; configure e teste o destinatário adequado.

O código primeiro envia um PDF de até 20 MiB para `/media` e depois usa o identificador de mídia no cabeçalho do template aprovado. Os parâmetros de corpo devem corresponder ao template configurado pelo integrador. Não são criadas URLs públicas para as fotos ou para o contrato. O envio compartilha o arquivo com a Meta e com o destinatário, conforme as regras desses serviços; mantenha isso na política de privacidade.

Falha apenas no upload não indica que uma mensagem foi enviada. Resultado incerto no envio da mensagem precisa do mesmo bloqueio contra duplicação aplicado aos avisos. O armazenamento oficial e a rastreabilidade da vistoria continuam no sistema protegido, mesmo que a cópia no WhatsApp falhe.

Como alternativa manual, o painel pode abrir o texto do relatório no WhatsApp e permitir baixar o PDF/fotos para anexar. Abrir uma conversa não anexa os arquivos automaticamente nem confirma entrega.

## Testes

`node --test tests/notifications.test.mjs` executa requisições simuladas para verificar configuração, código temporário, consentimentos separados, segurança de unidades, concorrência, horários reais, frequência promocional, falhas ambíguas, agendamento protegido e documento de vistoria. Os testes não acessam a Meta nem enviam mensagens reais.
