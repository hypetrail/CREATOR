# Publicar no Cloudflare pelo painel e pelo GitHub

Este é o caminho para publicar o site completo. O uploader de ZIP/arquivos prontos não compila TypeScript nem prepara banco e servidor. Use **Cloudflare Workers**, importando o repositório GitHub.

A configuração desta entrega mantém o catálogo público, sem conta ou cadastro completo de cliente, e usa um login próprio para a administração. A reserva solicita apenas WhatsApp, nome opcional e autorização para os avisos operacionais. O primeiro acesso do administrador e sua recuperação dependem de uma chave provisória cadastrada pelo proprietário no painel Cloudflare. Não é necessário contratar outro serviço de autenticação, conectar e-mail ou instalar um app para começar.

O projeto continua usando React, TypeScript e um Worker. A simplificação remove o cadastro, mas mantém a compilação e o banco mínimo que compartilha estoque, valores, períodos e contatos das reservas. Consulte também **NOVO-FLUXO-SEM-CADASTRO.md**.

## 1. Criar o banco

1. No Cloudflare, abra **Storage & Databases → D1 → Create database**.
2. Nome sugerido: **calori-go-db**.
3. Conclua a criação e copie o **Database ID**. O ID informado pelo proprietário já foi configurado nesta entrega: `87762edb-d9b6-4dd7-bb72-9c3cc58329e4`. Se esse é o seu banco, não precisa repetir a criação.

O Database ID identifica o recurso e não é uma senha. Não crie tabelas nem importe um banco de testes. O comando de publicação aplica as migrações em ordem, incluindo a `0010_admin_password_auth.sql` e a `0011_minimal_reservation_contacts.sql`, e registra o que já foi aplicado. Se usar um banco existente, preserve backup antes de atualizar.

## 2. Importar o GitHub como Worker

No Cloudflare, abra **Workers & Pages → Create application** e escolha a opção de **importar/conectar um repositório GitHub para um Worker**. Os nomes dos botões podem variar conforme o idioma do painel.

Selecione:

| Campo | Valor |
| --- | --- |
| Repositório | `hypetrail/CREATOR` |
| Branch de produção | `entrega/site-whatsapp-2026-11-01` |
| Nome do Worker | `calori-go` |
| Root directory / Diretório raiz | `site` |
| Build command / Comando de build | `npm run build:cloudflare` |
| Deploy command / Comando de publicação | `npm run deploy:cloudflare` |

O painel deve instalar as dependências do `package-lock.json`; se houver campo de instalação separado, use `npm ci`. Não escolha uma exportação estática de Next.js nem use `npm start` como comando de publicação. `npm start` serve à prévia local.

A branch `main` ainda não contém esta entrega. Selecionar apenas o repositório, sem trocar a branch e o diretório raiz, não seleciona o aplicativo correto.

## 3. Variáveis de build

Antes de executar a primeira publicação, adicione nas configurações **de build**:

| Nome | Valor |
| --- | --- |
| `NODE_VERSION` | `24` |

O Database ID já está no `wrangler.json`. Não é necessário cadastrar `CALORI_D1_DATABASE_ID` para este banco. Se essa variável já existir no painel, use o mesmo ID acima ou remova a variável para utilizar a configuração do repositório.

Se escolheu nomes diferentes ou mudar o banco, adicione também:

| Nome opcional | Quando usar |
| --- | --- |
| `CALORI_D1_DATABASE_ID` | Quando quiser substituir o banco configurado no repositório |
| `CALORI_D1_DATABASE_NAME` | Quando o banco não se chama `calori-go-db` |
| `CALORI_WORKER_NAME` | Quando o Worker não se chama `calori-go` |

São identificadores de implantação, sem senhas. A configuração no GitHub já contém o Database ID fornecido pelo proprietário. O build continua recusando identificadores inválidos ou provisórios. Os scripts geram uma única conexão **DB** e um único agendamento de cinco minutos.

O deploy executa o Wrangler em duas etapas: aplica as migrações no D1 indicado e publica o Worker compilado em `dist/server/wrangler.json`. A conta/token de deploy usada pelo Cloudflare precisa poder publicar Workers e aplicar migrações D1; o acesso ao GitHub sozinho não concede essa permissão no Cloudflare.

## 4. Primeira publicação

Execute **Save and Deploy / Deploy**. Quando terminar, o Cloudflare exibirá o endereço do Worker, normalmente terminado em **workers.dev**. Esse será o link que você poderá abrir no computador e no celular.

Nesta etapa, o site pode aparecer com a frota ainda em preparação. As unidades são inicializadas quando o proprietário abre a administração pela primeira vez. O pagamento continua presencial e as reservas públicas começam desativadas.

O vínculo D1 **DB** já é publicado a partir do Database ID informado. Não crie um segundo vínculo com o mesmo nome. A fonte e as fotos de catálogo que fazem parte do código são entregues como arquivos estáticos pelo vínculo **ASSETS**. O fluxo novo não exige R2, envio de e-mail nem armazenamento de PDFs de cliente. As fotos de vistoria podem permanecer no computador da loja: o sistema salva somente seus nomes/referências e o checklist. O relatório identifica que essas imagens não foram anexadas ao site; não é uma cópia das fotos.

## 5. Criar a senha do administrador

Depois de o Worker existir:

1. Abra **Worker → Settings → Variables and Secrets**.
2. Adicione um **Secret** chamado **ADMIN_SETUP_KEY**.
3. Gere uma chave provisória de pelo menos **32 caracteres**, preferencialmente no seu gerenciador de senhas. Guarde-a temporariamente e salve/aplique a configuração do Worker. Não envie o valor no chat e não o coloque no GitHub ou nas variáveis de build.
4. Abra o endereço publicado seguido de **/admin**.
5. Na tela **Criar acesso do administrador**, informe a chave provisória e escolha uma senha de pelo menos 12 caracteres.
6. Depois de concluir, remova **ADMIN_SETUP_KEY** dos segredos do Worker e aplique a mudança.

O sistema guarda o hash da senha, limita tentativas, usa sessão HttpOnly/Secure e verifica a sessão no servidor. Alterar um cabeçalho HTTP não concede acesso administrativo. Os clientes não criam contas nem senhas: seu WhatsApp fica vinculado à reserva e aos avisos autorizados. O login acima é exclusivo do administrador.

A sessão administrativa dura até oito horas. O botão **Sair** encerra o acesso atual.

## 6. Configurar os avisos de WhatsApp

Após criar a senha, a tela **/admin/configuracao** e o painel **Avisos** ajudam a conferir a situação da operação. O fluxo novo guarda o contato mínimo no D1 privado e não exige criar uma chave `CUSTOMER_DATA_KEY`.

Para ativar os envios, conecte a WhatsApp Business Cloud API oficial e cadastre no Worker:

| Nome | Como configurar |
| --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Credencial da Meta, como **Secret**, nunca no GitHub ou navegador. |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número remetente da loja na conta Meta. |
| `WHATSAPP_API_VERSION` | Versão ativa da Graph API usada pela integração. |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Idioma do modelo aprovado, normalmente `pt_BR`. |
| `WHATSAPP_TEMPLATE_RENTAL` | Nome do template utilitário aprovado para as informações operacionais. |

Não envie os valores de segredos no chat. O número de telefone comercial, sozinho, não substitui a autorização da Meta. O template recebe código da reserva, título/parte e texto da mensagem. A aprovação e os custos dos envios são definidos pelo provedor.

Sem esses requisitos, o site pode registrar reservas e mostrar a situação pendente dos envios, mas não deve apresentar as mensagens como entregues. O botão de contato com a loja continua disponível.

A rotina do Worker verifica os avisos a cada cinco minutos. Reserva registrada, preparação, retirada liberada e proximidade do prazo usam eventos reais da operação. A pendência é registrada explicitamente pelo administrador para uma reserva que já tenha telefone e autorização; o site não presume que todo visitante que saiu da página possa ser avisado.

### Quando existem dados históricos

Reservas, cadastros completos e documentos anteriores não devem ser apagados pela atualização. Se você já usou `CUSTOMER_DATA_KEY` para criptografá-los, preserve a chave original para a consulta administrativa desse histórico. Uma chave nova não abre registros antigos. Isso não torna essa chave obrigatória para os contatos mínimos das novas reservas.

## 7. Conferir a operação

Abra o painel da frota e confira:

- Cinco T1, sem escolha pública de cor, e as tarifas combinadas.
- Dados de contato/endereço e condições da empresa.
- Disponibilidade, manutenção e intervalo de três horas.
- Reserva de teste sem criar conta: WhatsApp, nome opcional, autorização, código, retirada e devolução. O prazo efetivo é acompanhado pela operação no painel.
- Regra de atraso: descontar duas horas; cada hora iniciada depois disso corresponde a 1/24 da diária, com centavos arredondados somente no total.

O WhatsApp não enviará mensagens reais sem conta/API e template conectados. O site informa a situação; o funcionamento novo está em **NOVO-FLUXO-SEM-CADASTRO.md**. Não é necessário conectar Gmail, coletar CPF ou endereço, nem criar conta de cliente para testar o fluxo atual.

Vistorias podem registrar nomes das fotos já guardadas no computador, sem enviar as imagens ao site. Os arquivos públicos de catálogo precisam estar no código ou em hospedagem acessível aos visitantes.

## Recuperação da senha administrativa

Se esquecer a senha, adicione novamente uma nova chave provisória de pelo menos 32 caracteres no segredo **ADMIN_SETUP_KEY** do Worker. Abra **/admin/recuperar**, informe essa chave e escolha uma nova senha. O procedimento revoga as sessões anteriores. Remova a chave provisória do painel depois de recuperar o acesso. As reservas e os contatos operacionais permanecem no D1.

## Verificação técnica desta entrega

- `npm test`
- `npx tsc --noEmit`
- `npm run build:cloudflare`, com identificador sintético apenas nos testes
- `npm run deploy:cloudflare -- --dry-run`, sem publicar nem migrar banco remoto
- Teste no navegador do Worker compilado, em D1 local isolado

A publicação real e sua URL dependem da conta Cloudflare do proprietário; não foi presumido acesso a ela. `ADMIN_SETUP_KEY`, senhas, `WHATSAPP_ACCESS_TOKEN` e qualquer chave legada de dados não devem ser incluídos no repositório.
