# Documentos de locação e envio por e-mail

> Atualização vigente: consulte [Fluxo do site e WhatsApp](FLUXO-SITE-WHATSAPP.md). A T1 não tem escolha pública de cor, o e-mail é opcional, o cadastro continua completo e o atraso desconta duas horas antes da cobrança por hora iniciada. Referências anteriores divergentes abaixo são históricas.

## Fluxo do cliente

1. O cliente escolhe datas, modelo e cor. O servidor separa uma unidade física e preserva preço e condições aceitas.
2. Para acompanhar depois em **Minhas reservas**, entra na conta antes de confirmar. No próprio site, preenche nome, CPF, nascimento, WhatsApp, **e-mail obrigatório**, endereço completo e responsável quando aplicável. Os dados da moto e da locação vêm da reserva; o perfil autorizado pode preencher os campos vazios sem apagar o que já foi digitado.
3. Após confirmar, recebe um número e pode baixar o PDF preenchido. Quando a chave e o armazenamento estiverem configurados, a identificação e a via privada são preservadas antes da tentativa de e-mail. O retorno distingue cadastro guardado, documento guardado e resultado do envio. O PDF informa retirada **prevista**, pagamento presencial pendente e condições salvas; o guia de cuidados versionado acompanha as novas reservas que o possuem no snapshot.
4. A equipe confere a moto, os documentos e a bateria. Ao clicar em **Liberar para retirada**, informa o horário confirmado. Esse evento solicita outro e-mail com o PDF **Confirmação de retirada** e as cláusulas preservadas.
5. O painel distingue envio em processamento, aceitação pelo provedor e falha. Aceitação pelo provedor não comprova recebimento na caixa de entrada. Sem conexão, a reserva permanece registrada e o site informa a pendência, sem simular um envio.

T1 New e-bike: a partir de 2 diárias, R$ 45/dia, sendo R$ 30 de aluguel e R$ 15 de seguro já incluído. A exceção anteriormente confirmada de 1 diária (24 horas) custa R$ 60 com seguro, sendo R$ 45 de aluguel e R$ 15 de seguro. A regra informada em 29/10/2026 prevê tolerância de até duas horas e, após esse prazo, metade da diária contratada: R$ 22,50 na tarifa de R$ 45 ou R$ 30 na diária única de R$ 60. A empresa confirmou que, ultrapassada a tolerância, no dia seguinte uma diária inteira com seguro substitui a metade, sem somar as duas: R$ 45 na tarifa comum ou R$ 60 na diária única. A tolerância global também vale ao atravessar a meia-noite. Atrasos que alcancem dois ou mais dias posteriores permanecem para conferência, sem repetição automática presumida. A reserva preserva sua regra e seus valores; mudar o preço ou as cláusulas não altera reservas anteriores. A apuração de atraso é separada do pagamento presencial e uma pendência não é apresentada como cobrança final. Reservas históricas continuam com o texto que aceitaram.

## Cláusulas e revisão

As cláusulas informadas pela empresa, os cuidados com a moto e a autorização de prorrogação antes da devolução estão no modelo. A proteção básica informada inclui danos básicos da própria moto, inclusive quando houver terceiros na colisão; danos a terceiros e quebra do chassi ficam excluídos. Seguradora ou natureza da proteção, franquias, limites, cancelamento e reembolso ainda precisam de definição/revisão. O orçamento usa as condições preservadas, sem presumir coberturas dos pacotes opcionais antigos.

Em **Administração → Documentos**:

1. Complete a identificação cadastral da empresa e confirme endereço e contato.
2. Use **Usar cláusulas de locação informadas** para carregar o texto fornecido, se necessário. Isso apenas prepara um rascunho.
3. Confira as coberturas e exclusões já informadas; complete identificação da proteção, franquias, limites, cancelamento, ausência e reembolso e revise o conjunto.
4. Salve o rascunho ou confirme a revisão e publique uma versão aprovada.

Enquanto esses dados estiverem pendentes, o PDF mostra **RASCUNHO — NÃO É CONTRATO DEFINITIVO**. A publicação no painel ativa uma versão para novas reservas; não publica a hospedagem. Documentos de reservas antigas usam sua versão original. Registros históricos sem cláusulas salvas não recebem cláusulas novas retroativamente. Pagamento é somente na loja e o PDF não é recibo, apólice ou assinatura eletrônica.

## Onde ficam os dados pessoais

A empresa autorizou guardar o cadastro e os documentos completos no próprio site, em área protegida. Esse modelo substitui a decisão anterior de manter toda identificação somente na página ou em um sistema externo.

A conta básica usa telefone de login, senha somente em hash com salt, sessões protegidas e preferências separadas de avisos operacionais e ofertas. Os dados completos de identificação são guardados pelo fluxo protegido com criptografia autenticada AES-256-GCM e chave exclusiva do servidor (`CUSTOMER_DATA_KEY`), sem expor nome, CPF, endereço ou e-mail em metadados públicos. Sem a chave configurada, o sistema deve informar a indisponibilidade do armazenamento protegido em vez de gravar dados completos em texto aberto.

Documentos personalizados ficam em armazenamento privado e exigem autorização do administrador ou do cliente dono da reserva antes de consulta e download. O número da reserva, sozinho, não autoriza acesso. O cadastro atual pode receber correções autorizadas, mas a identificação e as condições preservadas em um documento emitido não devem ser sobrescritas silenciosamente. O perfil é editável, mas o primeiro snapshot da identificação e a via privada emitida são imutáveis. Uma correção que exija alterar documento deve ter procedimento próprio de adendo/reemissão; esta entrega não apresenta a edição do perfil como correção retroativa de contrato.

O cadastro externo permanece como integração opcional ou fonte de registros históricos. A confirmação posterior pode recuperar os dados preservados no próprio site, quando disponíveis e configurados, sem exigir que a empresa mantenha uma segunda base. A geração e o envio ainda dependem dos serviços e credenciais necessários. Dados pessoais históricos existentes não foram apagados.

Os serviços de comunicação recebem os dados necessários ao envio. O provedor de e-mail conserva mensagens conforme suas próprias regras, incluindo a pasta Enviados do Gmail. O resumo manual de WhatsApp usa informações operacionais da reserva, evitando CPF e endereço completo na URL. Anexar um PDF ou enviar relatório ao WhatsApp encaminha seu conteúdo ao serviço e ao destinatário escolhido. Esses usos, os acessos e os prazos de retenção precisam estar informados no formulário e na política da empresa. Fotos do catálogo podem ser públicas; documentos e vistorias não devem usar a galeria pública de produtos.

A rota pública de envio exige uma capacidade aleatória devolvida somente à solicitação original e com prazo limitado. Ela não aceita documentos, preços ou condições arbitrários fornecidos pelo navegador. Identificação e arquivos são validados e associados à reserva autorizada. Corrigir a ficha na página não altera um documento já encaminhado.

A chave de criptografia deve ficar no gerenciador seguro da hospedagem e ser preservada para recuperação. Ela não deve ser enviada pelo chat nem incluída no repositório. O plano de backup e contingência ficou para uma etapa posterior, conforme solicitado; esta atualização não equivale a um backup automático implantado.

## Conectar o Gmail informado

Remetente escolhido: **calori.mobi2@gmail.com**. O adaptador usa Gmail API e OAuth; informar o endereço não concede acesso. Nenhum e-mail real foi enviado na validação.

Um responsável técnico deve:

1. Criar ou selecionar um projeto Google Cloud e habilitar a **Gmail API**.
2. Configurar a tela de consentimento e um cliente OAuth adequado ao fluxo de autorização usado pela empresa.
3. Autorizar a conta `calori.mobi2@gmail.com` com acesso offline e o escopo `https://www.googleapis.com/auth/gmail.send`, obtendo um refresh token pelo fluxo OAuth. A autorização deve pertencer ao remetente ou a um alias permitido pela conta.
4. Configurar no gerenciador de segredos da hospedagem: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` e `GMAIL_REFRESH_TOKEN`. Definir também `RESERVATION_EMAIL_PROVIDER=gmail` e `RESERVATION_EMAIL_FROM=calori.mobi2@gmail.com`.
5. Confirmar as exigências do Google para o aplicativo OAuth. Tokens de aplicativos externos em modo de teste podem expirar e exigir nova autorização; preparar o aplicativo para uso contínuo antes da operação.
6. Com armazenamento protegido, contato do cliente e condições preparados, testar uma reserva e a liberação com endereço de teste autorizado, conferir os anexos e a pasta Enviados e só depois habilitar o fluxo público.

Não envie senha, client secret ou refresh token pelo chat e não inclua segredos no Git. `.dev.vars.example` contém apenas nomes e valores públicos de configuração. A hospedagem precisa permitir saída HTTPS para `oauth2.googleapis.com` e `gmail.googleapis.com`; o domínio do cadastro externo só é necessário se essa integração opcional for utilizada. As políticas de saída da nuvem devem ser ajustadas pelo fluxo de configuração suportado.

Existe alternativa Resend para **domínio remetente próprio verificado**, com `RESERVATION_EMAIL_PROVIDER=resend`, `RESERVATION_EMAIL_FROM` e `RESEND_API_KEY`. Um endereço pessoal `@gmail.com` não é tratado como domínio autenticável no Resend.

## Conectar o WhatsApp e seus templates

Use a integração oficial **WhatsApp Business Cloud API**. Abrir `wa.me` prepara uma conversa manual e não habilita automação. Configure no gerenciador seguro:

| Variável | Finalidade |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Credencial da integração, somente no servidor. |
| `WHATSAPP_PHONE_NUMBER_ID` | Identificador Meta do número remetente, não o telefone digitado pelo cliente. |
| `WHATSAPP_API_VERSION` | Versão vigente da API confirmada para a conta. Não há versão presumida no exemplo. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Idioma dos templates; padrão `pt_BR`. |
| `WHATSAPP_TEMPLATE_AUTH` | Template aprovado de autenticação, com código no corpo e no botão de URL. |
| `WHATSAPP_TEMPLATE_PREPARING` / `WHATSAPP_TEMPLATE_READY` | Preparação e liberação real da retirada. |
| `WHATSAPP_TEMPLATE_RETURN_REMINDER` / `WHATSAPP_TEMPLATE_CARE` | Prazo efetivo de devolução e cuidados. |
| `WHATSAPP_TEMPLATE_AVAILABILITY` | Oferta de disponibilidade para clientes com autorização comercial. |
| `WHATSAPP_TEMPLATE_INSPECTION` | Template de utilidade aprovado com documento no cabeçalho para o relatório de vistoria. |
| `INSPECTION_ARCHIVE_PHONE` | Destinatário permitido para o arquivo da empresa; não presumir envio do número remetente para si mesmo. |
| `APP_PUBLIC_URL` ou `WHATSAPP_SITE_URL` | URL pública HTTPS usada nos links de atendimento e do guia. |
| `CUSTOMER_OTP_SECRET` | Segredo de ao menos 32 caracteres para proteger códigos temporários de confirmação e recuperação. |

Os nomes, idioma, quantidade e ordem dos parâmetros precisam corresponder aos templates aprovados na conta Meta. Consulte `lib/notification-server.ts` e `lib/whatsapp-server.ts` ao cadastrá-los; colocar um nome de template no ambiente não obtém aprovação. A saída HTTPS para `graph.facebook.com` precisa estar permitida.

A confirmação do telefone usa código de seis dígitos com expiração, limite de tentativas e intervalo entre solicitações. A senha de acesso exige pelo menos 12 caracteres e é armazenada por hash PBKDF2-SHA256 com salt. Sem provedor de autenticação configurado, o sistema informa a pendência; não oferece código fictício. A recuperação comprova a posse do número e revoga sessões anteriores. Ao recuperar uma conta antes não verificada, as preferências anteriores são limpas para que o dono do número escolha seus próprios consentimentos.

Em **Avisos**, o administrador pode processar a fila, preparar um aviso de disponibilidade e ligar/desligar a preparação automática. A automação exige reservas públicas abertas, estoque compatível, telefone verificado e autorização comercial própria, com limite de um aviso de disponibilidade por contato a cada sete dias. A autorização operacional é distinta e pode ser revogada.

O build prepara o Worker com `scheduled()` e cron a cada cinco minutos. Confirme que a hospedagem preservou a configuração. Outra plataforma pode usar `POST /api/notifications` com bearer `NOTIFY_CRON_SECRET` de ao menos 32 caracteres. O segredo não vai no navegador nem em URL. O padrão do lembrete é 120 minutos antes do prazo efetivo; `RETURN_REMINDER_MINUTES` permite configuração entre 15 e 1.440 minutos.

O relatório privado de vistoria reúne checklist e fotos. O envio automático faz upload do PDF e usa um template aprovado de documento para o destino configurado da empresa. Sem conexão, a equipe pode baixar e anexar esse relatório manualmente. Aceitação pela Meta não comprova entrega; resultado incerto impede repetição automática.

## Conectar o cadastro externo — opcional

Foi implementado um contrato de adaptador, não uma conexão presumida com um produto específico. Configure `CUSTOMER_SYSTEM_NAME`, `CUSTOMER_API_URL` (base HTTPS) e o segredo `CUSTOMER_API_TOKEN` somente após verificar a documentação do sistema. Se ele não tiver endpoints compatíveis, será necessário um adaptador no servidor da empresa.

| Operação | Requisição | Resposta esperada |
| --- | --- | --- |
| Cadastrar | `POST {base}/customer-reservations` com `{reservation_id, customer}` | `{reference: identificadorInterno}` |
| Consultar | `GET {base}/customer-reservations/{reference}` | `{customer: camposDaIdentificacao}` |

Ambas usam `Authorization: Bearer`. O cadastro deve ser idempotente por `reservation_id` e pelo header `Idempotency-Key`, preservando o primeiro cadastro de uma mesma reserva em repetições. A referência deve ser um ID opaco de até 120 caracteres, não CPF, telefone ou e-mail. Os campos do cliente correspondem aos nomes internos do formulário: `name`, `cpf`, `phone`, `email`, `birth`, `cep`, `street`, `number`, `district`, `city`, `state`, `complement` e, quando aplicável, `guardian`, `guardianCPF`, `guardianPhone`, `accompanied`.

O painel também permite vincular manualmente um identificador externo existente. Essa integração é opcional no novo modelo de cadastro protegido no site. Consultas e envios administrativos exigem o proprietário autenticado.

## Falhas e repetição

Uma reserva não é duplicada se o e-mail falhar. O cliente pode tentar novamente dentro da validade da solicitação; a equipe usa **Enviar documento por e-mail** no painel. O servidor limita tentativas e impede envios simultâneos do mesmo evento. Uma nova liberação após voltar à preparação é um evento novo e possui outro documento.

Gmail não oferece garantia de idempotência no envio. Se uma tentativa ficar sem confirmação, o registro recebe estado **Resultado incerto** e o reenvio automático é bloqueado, incluindo requisições interrompidas com prazo expirado. A equipe deve conferir a pasta Enviados e o provedor antes de resolver o evento; não há botão para ignorar essa proteção. A mesma cautela é aplicada a respostas ambíguas do provedor alternativo. Erros confirmados antes de qualquer envio permitem nova tentativa, até o limite de cinco.

O envio de e-mail continua sendo solicitado no evento de confirmação/liberação e não representa entrega garantida. A nova comunicação por WhatsApp possui fila de tarefas e depende de configuração do provedor, templates aprovados, verificação de telefone, consentimento aplicável e agendador. Não há assinatura digital nem confirmação de entrega/bounce presumida. Serviços não conectados são apresentados como pendentes, sem simulação de envio.

## Migração e validação

Aplicar todas as migrações em ordem, incluindo `0005_reservation_documents.sql`, `0006_document_delivery_tracking.sql`, `0007_customer_operations.sql` e `0008_private_customer_documents.sql`, pelo fluxo da hospedagem. Localmente: `npm run db:local`. As migrações preservam a frota e o histórico. Não foi realizado deploy nem acessado banco de produção.

Validação: `npm test`, `npx tsc --noEmit` e `npm run build`. Os testes geram PDFs reais e usam requisições simuladas para OAuth, Gmail e cadastro externo; nenhum serviço externo é acionado. São verificados preço, cláusulas, horário confirmado, privacidade, autorização, concorrência, repetição e falhas ambíguas. A extração de texto dos PDFs exige `pdftotext` do Poppler. A conexão real e a entrega final precisam ser verificadas após a configuração segura da hospedagem e a autorização dos serviços de comunicação. O cadastro externo é opcional no novo modelo.

Para a sequência de atendimento e a lista de pendências, consulte [Operação e cadastro](ENTREGA-OPERACAO-E-CADASTRO.md). A geração local de segredos sem exibir os valores está no [guia de desenvolvimento](DESENVOLVIMENTO-FROTA.md).
