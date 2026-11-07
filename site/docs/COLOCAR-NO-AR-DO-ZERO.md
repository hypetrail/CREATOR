# Nova instalação da CaloriMob no Cloudflare

Roteiro atualizado em 06/11/2026, usando GitHub e painel Cloudflare pelo computador. Substitui as instruções anteriores de escolher a branch de entrega, preencher `site` no caminho e cadastrar variáveis de build.

## 1. Banco novo e limpeza da tentativa anterior

O proprietário solicitou recomeçar pelo D1 e informou:

- Nome: `calori-go-db`.
- **Database ID novo: `72584dd8-cc93-41f6-8495-b396a45a4d83`.**
- O ID antigo `87762edb-d9b6-4dd7-bb72-9c3cc58329e4` foi retirado da configuração de publicação.

**Preserve o banco novo.** Não o exclua ao limpar recursos antigos.

Se ainda existir o Worker antigo, abra **Computação → Workers e Pages → calori-go → Configurações → Zona de perigo → Excluir Worker** e confirme o nome solicitado. Isso remove o Worker antigo e suas configurações, mantendo o código do GitHub.

Se o banco anterior ainda existir, identifique-o pelo **ID antigo** antes de excluí-lo na área de configurações do D1. A exclusão remove seus dados. O banco novo acima deve permanecer.

Em **Meu perfil → Tokens de API**, revogue os tokens exclusivos da tentativa anterior, como `calori-go-publicacao` e `calori-go-build`, após remover o Worker antigo. Se também criou um token de conta com esses nomes, ele fica na área de tokens da conta. Preserve credenciais usadas por outros projetos.

Não é necessário excluir a conta Cloudflare ou comprar um domínio. Estas exclusões dependem do painel do proprietário; não foram executadas automaticamente pelo assistente.

## 2. Conferir o GitHub

Abra https://github.com/hypetrail/CREATOR/tree/main.

A branch **main** agora contém a aplicação completa. Na raiz aparecem `package.json`, `package-lock.json`, `.node-version`, `README.md`, `site` e `prototipos`.

O HTML de `prototipos` é uma demonstração local. Os comandos da raiz publicam a aplicação completa da pasta `site`.

## 3. Criar o novo Worker

Abra **Computação → Workers e Pages → Criar aplicativo → Conectar ao GitHub**. Autorize e escolha **hypetrail/CREATOR**.

Preencha:

| Campo | Valor |
| --- | --- |
| Nome do projeto | `calori-go` |
| Comando da build | `npm run build:cloudflare` |
| Comando de implantação | `npm run deploy:cloudflare` |
| Habilitar builds de preview | Desativado |
| Proteger com Cloudflare Access | Desativado para o site público |

Em **Configurações avançadas**:

| Campo | Valor |
| --- | --- |
| Caminho / diretório raiz | `/`, a raiz padrão do repositório |
| Token de API | **Criar novo token** |
| Nome do token | `calori-go-build-novo` |
| Variáveis de build | Nenhuma necessária nesta instalação |

Se houver seleção de branch, mantenha **main**. Não preencha `site` nem o nome de uma branch no campo Caminho deste roteiro.

O arquivo `.node-version` escolhe Node 24. O novo ID do banco já está em `site/wrangler.json`. Não adicione o ID antigo nas variáveis do painel.

O Cloudflare instala o pacote da raiz; o comando da build instala as dependências de `site` com `npm ci` e compila a aplicação. Não há diretório de saída estático para preencher nem ZIP para enviar.

Clique em **Implantar**.

## 4. Acrescentar acesso ao D1 no token novo

A lista padrão documentada do token automático não inclui D1. Depois que o Cloudflare criar o token:

1. Em outra aba, abra https://dash.cloudflare.com/profile/api-tokens.
2. Localize **calori-go-build-novo** em **Meu perfil → Tokens de API**.
3. Escolha **Editar** e acrescente **Conta → D1 → Editar**, na conta que contém o banco novo.
4. Preserve as permissões necessárias do Worker e salve.

Se a primeira build falhar por permissão do D1, volte a **Implantações → build com erro → Tentar compilar novamente** após salvar a permissão. Essa execução deve mostrar **main**.

O token já foi criado e selecionado pelo assistente do Cloudflare. Não precisa copiá-lo para o código, chat ou variáveis de build.

## 5. O que a implantação prepara

O comando aplica as migrações no novo D1 e publica o Worker compilado. Ele prepara tabelas, vínculo **DB**, arquivos **ASSETS**, administração por senha e agendamento de mensagens a cada cinco minutos.

Não crie tabelas, associações D1 ou gatilhos cron manualmente. Não importe bancos fictícios dos testes.

Ao concluir, o painel mostra o endereço real `workers.dev`. Ele permite abrir o site sem domínio próprio.

## 6. Criar o primeiro administrador

Se o site já foi publicado e uma senha válida foi recusada, consulte [a correção do acesso administrativo](ACESSO-ADMINISTRATIVO.md). Não repita a exclusão de recursos das etapas iniciais.

1. Abra **calori-go → Configurações → Variáveis e segredos em tempo de execução**.
2. Adicione um segredo chamado `ADMIN_SETUP_KEY`.
3. Use uma chave aleatória de pelo menos 32 caracteres, gerada e guardada por você.
4. Salve e aplique a alteração.
5. Abra o endereço do site seguido de `/admin`.
6. Informe a chave temporária e crie sua senha de pelo menos 12 caracteres.
7. Depois do cadastro, remova o segredo temporário e aplique a alteração.

Segredos reais ficam na hospedagem. O Database ID não é uma senha. Os clientes acessam o site público; apenas a administração exige login.

## 7. Conferir a frota e testar

Abra **Painel da frota**. O primeiro acesso administrativo inicializa o catálogo. Confira:

- Cinco unidades T1, sem escolha pública de cor.
- Uma diária: R$ 60 com proteção. Duas ou mais: R$ 45/dia, incluindo R$ 15 de proteção.
- Endereço, telefone da loja, disponibilidade e condições.
- Reservas públicas inicialmente desativadas. Habilite **Liberar reservas pelo site** após conferir os dados.

Faça uma reserva de teste com contato da empresa. Confira código, total, estoque e pagamento pendente na loja. Teste reserva manual, preparação, liberação, vistoria de saída, retirada, prazo efetivo, vistoria de retorno e devolução. Cancele os testes que não serão concluídos.

O prazo começa quando a equipe registra a retirada. Há intervalo de três horas entre locações e tolerância de duas horas na devolução. Depois da tolerância, cada hora iniciada custa 1/24 da diária contratada; os centavos são arredondados no total.

## 8. Conectar o WhatsApp depois de validar o site

A API da Meta é uma configuração separada. Até conectá-la, os avisos ficam pendentes.

Em **Variáveis e segredos em tempo de execução**, configure:

| Nome | Tipo | Informação |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | Segredo | Credencial válida da Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | Texto | ID do número remetente |
| `WHATSAPP_API_VERSION` | Texto | Versão ativa usada na integração |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Texto | Idioma aprovado, normalmente `pt_BR` |
| `WHATSAPP_TEMPLATE_RENTAL` | Texto | Nome do template utilitário aprovado |
| `APP_PUBLIC_URL` | Texto, opcional | Endereço HTTPS do site |

A configuração atual usa `keep_vars` para preservar as variáveis de execução nas próximas publicações. Segredos também permanecem no Worker. Esses valores não pertencem às variáveis de build.

O template recebe código da reserva, título/parte e texto. Cadastre o número e aprove o template na Meta. Informar somente o telefone da loja não autoriza os envios.

A equipe libera a retirada pelo painel. Teste o recebimento real; aceitação pela API não comprova entrega. Gmail não é necessário neste fluxo.

## 9. Fotos, domínio e atualizações

As fotos de catálogo incluídas no código acompanham o site. Vistorias podem usar fotos no computador, com referências e checklist no painel. Upload de novas imagens pelo painel depende de armazenamento adicional; R2 não integra esta instalação básica.

Um domínio próprio é opcional. Com um domínio seu ativo no Cloudflare, use **Worker → Domínios → Adicionar domínio personalizado**, ou a área **Domínios e rotas**, conforme o painel.

Alterações na branch **main** podem iniciar builds automáticos. Atualizações normais preservam o banco. Não repita a exclusão do D1 para atualizar preços ou modelos.

## Referências

- [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/)
- [Token e configuração da build](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Node escolhido por arquivo](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/)
- [D1](https://developers.cloudflare.com/d1/get-started/)
- [Persistência de variáveis do painel](https://developers.cloudflare.com/workers/wrangler/configuration/#source-of-truth)

Os nomes dos botões podem variar com a tradução. A validação local não comprova publicação nem envio real na conta do proprietário.
