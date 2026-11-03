# Colocar a CaloriMob no ar, do zero, pelo Cloudflare

Guia conferido em 03/11/2026 para publicar pelo computador, usando os painéis do GitHub e do Cloudflare. Não é necessário usar terminal.

O objetivo é publicar a aplicação completa: site do cliente, administração com senha, estoque compartilhado e reservas no servidor. O arquivo `CaloriMob-Painel-Administrador.html` da pasta `prototipos` é uma demonstração local. As alterações feitas nele não são transferidas automaticamente para a aplicação completa da pasta `site`.

O código da entrega está no GitHub, na branch `entrega/site-whatsapp-2026-11-01`. Ele foi testado localmente; a publicação na sua conta e o envio real de WhatsApp precisam ser configurados e conferidos.

## 1. Entender o que você vai usar

| Serviço | Para que serve |
| --- | --- |
| GitHub | Guarda o código e entrega a versão escolhida ao Cloudflare. |
| Cloudflare Workers | Publica as páginas e executa as funções do servidor. |
| Cloudflare D1 | Guarda modelos, unidades, reservas, contatos mínimos e fila de avisos. |
| WhatsApp Business Cloud API da Meta | Envia as mensagens depois de configurada. É uma conexão separada da hospedagem. |

Você pode começar usando o endereço gratuito `workers.dev` fornecido pelo Cloudflare. Comprar um domínio próprio é opcional nesta etapa.

## 2. Entrar no GitHub e conferir a entrega

Abra:

https://github.com/hypetrail/CREATOR/tree/entrega/site-whatsapp-2026-11-01

Entre na conta que tem acesso ao repositório `hypetrail/CREATOR`. Confira que a branch exibida é `entrega/site-whatsapp-2026-11-01` e abra a pasta `site`. Nela estão `package.json`, `wrangler.json`, `app`, `lib` e `drizzle`.

A branch é uma versão do projeto dentro do repositório. Use o nome indicado, mesmo que o GitHub ou o Cloudflare sugira `main` por padrão. O painel será orientado a buscar a pasta `site` nessa versão.

Não é necessário baixar um ZIP para este caminho. O Cloudflare busca o código diretamente do GitHub.

## 3. Criar ou acessar a conta Cloudflare

Abra https://dash.cloudflare.com/sign-up e crie sua conta, caso ainda não tenha. Confirme o e-mail e entre em https://dash.cloudflare.com.

Use a mesma conta Cloudflare para o Worker e para o banco D1. Você pode abrir a área **Workers & Pages**, normalmente dentro de **Compute & AI** ou **Compute**, sem ter um domínio comprado.

A conta pode ser criada gratuitamente. Workers tem plano gratuito com limites; o plano Workers Paid tem cobrança mínima de US$ 5/mês, além de eventuais excedentes. Domínio próprio e mensagens da Meta têm custos separados. Um plano de site/DNS Pro ou Business não é um requisito deste roteiro. Consulte os preços atuais antes de contratar.

## 4. Criar ou localizar o banco D1

No menu Cloudflare, procure **Storage & Databases → D1 SQL Database**. Se o menu estiver diferente, use a busca do painel por `D1`.

1. Se já existe o banco `calori-go-db`, abra-o e copie seu **Database ID**.
2. Se não existe, clique em **Create Database**.
3. Use o nome `calori-go-db`.
4. A indicação de localização é opcional; pode manter a seleção padrão.
5. Confirme em **Create** e copie o **Database ID**.

Você informou anteriormente o ID `87762edb-d9b6-4dd7-bb72-9c3cc58329e4`, que já está no código. Se esse banco aparece nesta conta, pode reutilizá-lo. Se criar outro banco, use o ID novo na variável de build do passo 7. Reutilizar um nome não reutiliza o mesmo ID.

O Database ID não é senha. Não crie tabelas à mão: o comando de publicação do projeto aplica as migrações do banco. Se houver dados reais em um banco existente, preserve um backup antes de atualizar.

## 5. Criar a autorização de publicação

O Cloudflare precisa de autorização para publicar o Worker e preparar as tabelas no D1. A autorização padrão gerada pelo Workers Builds pode não incluir D1; por isso, confira essa permissão antes de publicar.

Para criar uma autorização específica pelo próprio painel:

1. Abra o ícone do seu perfil → **My Profile → API Tokens**, ou https://dash.cloudflare.com/profile/api-tokens.
2. Clique em **Create Token → Create Custom Token**.
3. Nomeie como `calori-go-publicacao`.
4. Configure as permissões abaixo.

| Tipo | Permissão | Acesso |
| --- | --- | --- |
| Account | Workers Scripts | Edit |
| Account | D1 | Edit |
| Account | Account Settings | Read |
| User | User Details | Read |
| User | Memberships | Read |

Em **Account Resources**, use **Include → Specific account** e escolha a conta que contém seu D1. Conclua a criação. Se o valor do token for exibido, guarde-o no seu gerenciador de senhas; ele não deve ser enviado no chat ou gravado no GitHub.

No passo seguinte, selecione `calori-go-publicacao` no campo **API token** da configuração do build. O Cloudflare usa esse token para publicar. Ele não é a senha do administrador do site nem o token do WhatsApp.

Se você já usa um token de publicação, pode editar esse mesmo token em **My Profile → API Tokens** e acrescentar **Account → D1 → Edit**, preservando as permissões necessárias do Worker. Depois, confirme qual token está selecionado em **Worker → Settings → Build**.

## 6. Conectar o repositório ao Worker

Volte à conta Cloudflare e abra **Workers & Pages → Create application → GitHub**. Conforme a versão do painel, a opção pode aparecer como **Connect GitHub** ou **Import a repository**.

Autorize o aplicativo Cloudflare no GitHub a acessar o repositório `CREATOR`. Em seguida, selecione `hypetrail/CREATOR`.

Preencha exatamente:

| Campo no Cloudflare | Valor |
| --- | --- |
| Nome do Worker / Project name | `calori-go` |
| Git repository | `hypetrail/CREATOR` |
| Git branch / Production branch | `entrega/site-whatsapp-2026-11-01` |
| Root directory / Diretório raiz | `site` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| API token | `calori-go-publicacao`, criado no passo 5 |

O nome `calori-go` corresponde ao nome configurado no projeto. Não escolha outro nome sem ajustar também a configuração do código.

O painel instala as dependências do projeto antes do build. Se houver um campo separado de instalação, use `npm ci`. Não há uma pasta de saída para preencher como em uma hospedagem estática: este roteiro usa Workers com comando de deploy.

Se o Worker `calori-go` já foi criado, abra-o em **Workers & Pages → calori-go → Settings → Build/Builds → Connect**, conecte o GitHub e use os mesmos valores. Não é necessário apagar o Worker para corrigir a configuração.

O uploader de arquivos estáticos/ZIP não é o caminho desta aplicação. O build converte React/TypeScript para o pacote que será publicado. `npm start` é usado para prévia local e não deve substituir o comando de deploy.

## 7. Preencher as variáveis do build

Na configuração de build, abra **Build Variables and Secrets** ou **Advanced settings**. Se esses campos só estiverem disponíveis depois da criação, use **Worker → Settings → Build → Build Variables and Secrets**, salve e execute novamente o build.

Cadastre como variáveis de texto:

| Nome | Valor |
| --- | --- |
| `NODE_VERSION` | `24` |
| `CALORI_D1_DATABASE_ID` | O Database ID copiado no passo 4 |

Para o banco anteriormente informado, o segundo valor é `87762edb-d9b6-4dd7-bb72-9c3cc58329e4`. Para um banco novo, cole o ID novo. Não use o nome `calori-go-db` no campo do ID.

Como usamos os nomes `calori-go-db` e `calori-go`, não são necessárias as variáveis opcionais de mudança de nome. O arquivo já define esses nomes.

Estas duas variáveis são de **build**, usadas para montar a publicação. As chaves do administrador e do WhatsApp são variáveis/segredos de **execução**, configurados em outra área depois que o Worker existir. Configurar uma variável de build não a torna disponível automaticamente ao site em execução.

## 8. Publicar e encontrar o endereço

Clique em **Save and Deploy**. Aguarde as etapas terminarem:

- Instalação das dependências.
- Build do site.
- Aplicação das migrações no D1.
- Publicação do Worker e dos arquivos do site.

O comando `npm run deploy:cloudflare` já executa as migrações e depois publica. Não importe os bancos fictícios usados nos testes.

Ao concluir, abra o endereço exibido pelo Cloudflare, parecido com `https://calori-go.seu-identificador.workers.dev`. Esse é apenas o formato do endereço: copie o link real que o painel mostrar.

Se for o primeiro Worker da conta e o Cloudflare pedir um identificador para `workers.dev`, escolha um identificador disponível. Ele fará parte do endereço gratuito.

Para consultar falhas, abra **Deployments → View build history** e selecione o build com erro. Corrija o campo, salve e use **Retry build** ou a opção equivalente para uma nova execução. Salvar uma variável sem executar um novo build não muda o pacote já compilado.

## 9. Criar o acesso do administrador

Depois que o Worker estiver publicado:

1. Abra **Workers & Pages → calori-go → Settings → Variables and Secrets**.
2. Clique em **Add** e selecione o tipo **Secret**.
3. Em nome, escreva `ADMIN_SETUP_KEY`.
4. No valor, coloque uma chave aleatória de pelo menos 32 caracteres criada por você, de preferência no gerenciador de senhas. Guarde-a temporariamente.
5. Salve e clique em **Deploy** para aplicar.
6. Abra o endereço publicado seguido de `/admin`.
7. Na tela **Criar acesso do administrador**, informe a chave temporária e escolha sua senha definitiva de pelo menos 12 caracteres.
8. Depois de criar o acesso, volte a **Variables and Secrets**, remova `ADMIN_SETUP_KEY` e aplique a alteração.

A chave temporária autoriza criar o primeiro administrador. A senha definitiva é a que você usará para entrar depois. Não use o Database ID como chave, não compartilhe chaves no chat e não copie configurações locais como `FLEET_OWNER_ID` para produção.

Se esquecer a senha no futuro, cadastre uma nova `ADMIN_SETUP_KEY`, abra `/admin/recuperar`, redefina a senha e remova novamente a chave temporária.

## 10. Conferir a frota e liberar as reservas

Após criar a senha, clique em **Abrir painel da frota**. O primeiro acesso administrativo inicializa a frota; as reservas públicas começam desativadas para você conferir a operação.

Confira as cinco T1 e os preços: uma diária de R$ 60 com proteção; a partir de duas diárias, R$ 45/dia, sendo R$ 30 de locação e R$ 15 de proteção. Confira o endereço, WhatsApp da loja, disponibilidade, bloqueios e condições.

Em **Configurações**, habilite **Liberar reservas pelo site** e salve quando estiver pronto para o teste. Em uma janela anônima, abra a página pública e faça uma reserva de teste, com contato controlado pela empresa.

Verifique que a reserva aparece no painel, reduz a disponibilidade para aquele período e apresenta pagamento pendente na loja. Cancele o teste ou conclua o fluxo pela equipe para liberar corretamente o estoque.

Não é necessária uma chave `CUSTOMER_DATA_KEY` para os novos contatos mínimos. Se houver registros históricos cifrados de versões anteriores, preserve a chave original deles.

As fotos de catálogo já incluídas no projeto são publicadas junto com o site. As fotos locais de vistoria permanecem no computador: o painel registra referências e checklist. Este roteiro não adiciona armazenamento de novos uploads de fotos ao painel.

## 11. Ativar os envios reais de WhatsApp

O site pode ser publicado antes dessa conexão. Até configurá-la, as mensagens ficam pendentes e o painel mostra essa situação.

A integração utiliza a **WhatsApp Business Cloud API da Meta**. Informar o número da loja em Configurações não autoriza envios automáticos por si só.

Quando o número remetente e o template utilitário estiverem configurados na Meta, abra **Worker → Settings → Variables and Secrets** e adicione:

| Nome | Tipo | O que informar |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Secret | Token válido de produção da Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | Secret | ID do número remetente; não é o telefone com DDD |
| `WHATSAPP_API_VERSION` | Secret | Versão vigente usada pela sua integração na Graph API |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Secret | `pt_BR`, se esse for o idioma aprovado |
| `WHATSAPP_TEMPLATE_RENTAL` | Secret | Nome exato do template utilitário aprovado |
| `APP_PUBLIC_URL` | Secret, opcional | Endereço HTTPS real do site, para incluir o link do guia nos textos |

Neste roteiro, use **Secret** também para os identificadores e nomes. Eles não são senhas, mas esse tipo preserva os valores cadastrados no painel nas próximas publicações pelo GitHub. Na configuração atual do projeto, variáveis de execução do tipo Text podem ser sobrescritas pelo deploy. Isso não altera as variáveis de build do passo 7, que continuam como texto.

Salve e aplique em **Deploy**. O template precisa corresponder aos três parâmetros usados pelo código: número da reserva, título/parte e texto. Os parâmetros e a aprovação são conferidos na Meta; não basta inventar o nome do template no Cloudflare.

O Worker processa os avisos a cada cinco minutos. Em **Avisos**, confira a fila. A mensagem de moto pronta é preparada quando a equipe libera a retirada; o formulário sozinho não faz essa liberação. Antes de abrir o atendimento, teste um envio real para um número controlado pela empresa e confirme o recebimento. Aceitação pela API não comprova entrega.

Não é necessário configurar Gmail para este fluxo. A configuração da Meta é uma etapa separada da publicação do site.

## 12. Colocar um domínio próprio, se quiser

O endereço `workers.dev` já permite abrir e testar o site. Quando quiser um endereço próprio, registre um domínio em um registrador, adicione esse domínio à sua conta Cloudflare e conclua a ativação de DNS indicada no painel.

Com o domínio ativo, abra **Workers & Pages → calori-go → Settings → Domains & Routes → Add → Custom Domain**. Informe o domínio ou subdomínio desejado e confirme. O Cloudflare configura o vínculo e o HTTPS. Confira também `APP_PUBLIC_URL` se você usar essa variável.

Não basta digitar um domínio que você não possui. Se o domínio já estiver em uso, a configuração deve preservar os serviços existentes.

## Problemas comuns

| O que aparece | O que conferir |
| --- | --- |
| TypeScript encontrado / uploader não suporta build | Volte a Workers com integração GitHub. O ZIP do código não é um site estático pronto. |
| `package.json` não encontrado | Branch correta e Root directory igual a `site`. |
| Worker name mismatch | O nome no painel e no código precisa ser `calori-go`. |
| D1 não encontrado | ID correto, banco na mesma conta e variável `CALORI_D1_DATABASE_ID` no build. |
| D1 / erro de autorização no deploy | Token selecionado no build com `Account → D1 → Edit` na conta correta, além das permissões do Worker. |
| Erro relacionado a versão do Node | `NODE_VERSION=24` nas variáveis de build; execute novamente. |
| Banco ainda não configurado / tabela inexistente | Confirme se as migrações terminaram; use `npm run deploy:cloudflare` como deploy command. |
| Cadastro de administrador pede chave | Crie `ADMIN_SETUP_KEY` como Secret de execução, aplique o Deploy e abra `/admin`. |
| Configuração não muda depois de salvar | Execute um novo build para variáveis de build; aplique Deploy para segredos de execução. |
| Frota ainda vazia / reservas não liberadas | Abra a administração com sua senha e confira a liberação em Configurações. |
| WhatsApp pendente | Confira credenciais Meta, ID do número, versão, idioma e template aprovado. |

## Outras hospedagens

| Serviço | Como se encaixa neste projeto |
| --- | --- |
| Cloudflare Workers + D1 | É o caminho já preparado no código. Recomendado para esta entrega. |
| Vercel | Hospeda aplicações web; este projeto exigiria adaptar o servidor e o acesso ao D1 antes da migração. |
| Netlify | Oferece publicação web e funções; exigiria adaptar as funções do servidor, dados e agendamento. |
| Render | Pode executar servidor Node e conectar banco; exigiria preparar uma versão compatível do servidor, banco e tarefas agendadas. |
| Railway | Também hospeda servidores e bancos; requer adaptação da aplicação atual para esse ambiente. |

Trocar de serviço é possível, mas não elimina a necessidade de guardar estoque e reservas compartilhados e proteger a API de WhatsApp. Para o código desta entrega, continuar com Cloudflare evita uma migração de infraestrutura agora.

Links: https://vercel.com · https://www.netlify.com · https://render.com · https://railway.com.

## Fontes oficiais e alcance do guia

Fluxos conferidos no código do projeto e na documentação oficial Cloudflare, incluindo seu repositório público de documentação. Nomes e localização dos botões podem variar conforme o idioma e a atualização do painel.

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Configuração de build e permissões do token](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Versão do Node no build](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [D1: primeiros passos](https://developers.cloudflare.com/d1/get-started/)
- [Segredos no Worker](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Variáveis do painel e configuração do deploy](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)
- [Domínio próprio](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
- [Preços Workers](https://developers.cloudflare.com/workers/platform/pricing/)
- [Preços D1](https://developers.cloudflare.com/d1/platform/pricing/)

Este guia não executou publicação, migração no banco real ou contratação de serviços na sua conta. A conclusão de cada etapa deve ser confirmada no seu painel Cloudflare.
