# Revisão para a nova instalação no Cloudflare

Revisão concluída em 06/11/2026, solicitada pelo proprietário para recomeçar a hospedagem e o banco D1. Foram inventariados os 277 arquivos versionados da entrega inicial, examinados os caminhos de publicação, autenticação, reservas, estoque, documentos e comunicação, e executadas as verificações abaixo.

## Resultado da análise do GitHub

| Área | Constatação | Providência |
| --- | --- | --- |
| Branch principal | A `main` tinha apenas o README; a aplicação completa estava na branch de entrega. | Consolidar a aplicação na `main`, preservando o histórico e a branch anterior. |
| Pasta de publicação | O painel exigia selecionar `site`; o nome da branch chegou a ser colocado nesse campo. | Comandos na raiz instalam e compilam `site` automaticamente. O caminho agora é `/`. |
| Node | A escolha dependia de preencher uma variável no painel. | `.node-version` na raiz seleciona Node 24. |
| D1 | A configuração apontava para o banco da tentativa anterior. | Substituir pelo novo ID informado: `72584dd8-cc93-41f6-8495-b396a45a4d83`. |
| Configurações de execução | Variáveis de texto do painel podiam ser sobrescritas por uma publicação. | `keep_vars: true` preserva esses valores. Segredos continuam fora do código. |
| Autorização de publicação | O token criado manualmente não apareceu no seletor do usuário. | Roteiro usa o token criado pelo próprio assistente Cloudflare e acrescenta D1/Editar pelo perfil. |
| Documentação | Havia instruções antigas de branch, pasta e banco. | Consolidar o roteiro atual e identificar o relatório anterior como histórico. |

## Funcionalidades presentes

| Parte | O que foi conferido |
| --- | --- |
| Site do cliente | Catálogo T1, datas, cotação, confirmação de valores e condições, nome opcional e WhatsApp; sem conta de cliente. |
| Administração | Primeiro acesso por chave temporária, senha com hash, sessão protegida, controle de tentativas e rejeição de cabeçalhos administrativos enviados pelo visitante. |
| Frota | Separação de modelo e unidade física; cinco T1; disponibilidade por período, manutenção, bloqueios e intervalo de preparação. |
| Reservas | Alocação e contato na mesma transação, proteção contra reserva duplicada, reserva manual e estados operacionais. |
| Valores | Uma diária de R$ 60; duas ou mais a R$ 45/dia com proteção; condições preservadas por reserva; atraso proporcional após duas horas de tolerância. |
| Operação | Liberação pela equipe, vistorias, retirada efetiva, prazo, devolução, pagamento presencial e registros de ocorrências. |
| WhatsApp | Fila no servidor, autorização do contato, revogação, deduplicação e distinção entre pedido aceito pelo provedor e mensagem entregue. |
| Documentos | Guia de cuidados em PDF e consulta administrativa de históricos; novos cadastros completos e envio por e-mail estão desativados no fluxo simplificado. |
| Protótipo HTML | Demonstração local preservada em `prototipos`; alterações nela não migram automaticamente para o site publicado. |

## Verificações executadas

- Instalação limpa do lockfile: 704 pacotes instalados. O cache do teste foi colocado em uma pasta gravável do ambiente; não se alteraram as verificações de integridade.
- **179 testes automatizados aprovados**, sem falhas ou testes ignorados. Incluem concorrência pela última moto, rollback do contato, preços, atraso, autenticação e comunicação com provedor simulado.
- **TypeScript aprovado**, pelo comando da raiz `npm run check:types`.
- **Build de produção aprovado**, pelo comando da raiz `npm run build:cloudflare`, incluindo instalação das dependências de `site`.
- **Simulação de publicação aprovada**, por `npm run deploy:cloudflare -- --dry-run`, sem migração remota ou publicação. Os argumentos são encaminhados da raiz para o script de implantação.
- Pacote final com um vínculo **DB**, arquivos **ASSETS**, autenticação por senha, persistência das variáveis de execução e cron de cinco minutos.
- Migrações `0000` a `0011` aplicadas com Wrangler em **D1 local vazio e isolado**.
- **23 verificações HTTP aprovadas no Worker compilado**, incluindo primeiro administrador em banco vazio, cookie protegido, cinco T1, habilitação de reservas, cotação de R$ 90 por 48 horas, reserva pública, estoque reduzido para quatro unidades, acesso privado ao contato, PDF de cuidados e revogação da sessão ao sair. Apenas dados fictícios e recursos locais foram usados.
- Verificação de padrões de chaves privadas e tokens GitHub/Meta nos arquivos versionados: nenhum desses padrões encontrado. Essa busca não substitui uma auditoria de segurança completa.

## Pendências e limites

1. **Publicação real:** depende da nova conta/configuração do Worker, do acesso ao novo D1 e da permissão do token. Os testes locais não comprovam recursos ou permissões na conta do proprietário.
2. **WhatsApp real:** depende de número, credencial, versão e template aprovado na Meta. Nenhuma mensagem real foi enviada nesta revisão.
3. **Fotos novas:** imagens de catálogo incluídas no código funcionam como arquivos públicos. Upload pelo painel requer armazenamento adicional, como R2; o banco D1 não guarda esses arquivos. Vistorias podem manter fotos no computador e registrar referências.
4. **Qualidade de código:** o lint global apontou **77 erros e 20 avisos**, majoritariamente tipos `any`, além de avisos de imagens, dependências de hooks e componentes antigos. Isso é dívida de manutenção; o lint global não foi apresentado como aprovado. O teste de configuração alterado passou no lint específico.
5. **Código histórico:** componentes e migrações anteriores foram preservados. As rotas públicas de cadastro foram desativadas, e o portal antigo redireciona para o site. Uma limpeza posterior de código morto deve preservar o histórico e as funções usadas pelo painel.
6. **Operação da loja:** endereço, telefone, condições da proteção, vistoria e liberação de reservas precisam ser conferidos pelo responsável antes de atender clientes reais.

O banco anterior não foi consultado nem excluído pelo assistente. O proprietário solicitou reinício e forneceu um novo ID; a exclusão dos recursos antigos é feita pelo painel Cloudflare. Preserve o banco novo durante a limpeza.

## Configuração da nova instalação

- Branch: `main`.
- Caminho: `/` (raiz).
- Worker: `calori-go`.
- Build: `npm run build:cloudflare`.
- Implantação: `npm run deploy:cloudflare`.
- Banco: `calori-go-db`, ID `72584dd8-cc93-41f6-8495-b396a45a4d83`.
- Variáveis de build: nenhuma necessária para Node ou D1 nesta instalação.

Siga [Nova instalação da CaloriMob no Cloudflare](COLOCAR-NO-AR-DO-ZERO.md). Os próximos passos são publicar o Worker, criar a senha administrativa e testar uma reserva antes de conectar os envios reais.
