# CaloriMob — locação de motos elétricas

Site público de locação, painel exclusivo do administrador e avisos operacionais de WhatsApp no servidor. O cliente reserva com WhatsApp obrigatório e nome opcional: não cria conta nem informa CPF, endereço, e-mail ou senha. Identificação, documentação e assinatura são conferidas na loja.

A aplicação usa React/TypeScript, Worker Cloudflare e um banco D1 para frota, reservas, contato mínimo e fila de mensagens. O token da Meta fica somente no servidor. Não é um pacote HTML para upload estático.

## Começar

- [Fluxo atual sem cadastro](docs/NOVO-FLUXO-SEM-CADASTRO.md)
- [Publicar no Cloudflare pelo painel e GitHub](docs/PUBLICAR-CLOUDFLARE-PELO-PAINEL.md)
- [Como gerenciar a frota](docs/COMO-GERENCIAR-A-FROTA.md)
- [Revisão para a nova instalação](docs/REVISAO-PARA-NOVA-PUBLICACAO.md)

## Operação

O administrador gerencia modelos e unidades, preços, calendário, manutenção, bloqueios, reserva manual, preparação, liberação para retirada, vistorias, pagamentos presenciais e devolução. Alterações de preço não modificam reservas anteriores.

A T1 tem cinco unidades e nenhuma escolha pública de cor. Uma diária custa R$ 60 com proteção; a partir de dois dias, R$ 45 por dia (R$ 30 de locação + R$ 15 de proteção). O intervalo entre locações é de três horas. Atrasos descontam duas horas de tolerância e cobram cada hora iniciada em 1/24 da diária, arredondando os centavos no total. Condições e valores são preservados por reserva.

A reserva e o contato são gravados juntos. As mensagens cobrem confirmação, pendência registrada pelo administrador, preparação, liberação e proximidade da devolução. A liberação depende da equipe. Sem credenciais e template aprovado da Meta, o sistema informa que a comunicação aguarda configuração, sem declarar envio realizado.

Cadastros completos, contas e documentos antigos permanecem privados para consulta administrativa; não recebem novos registros por rotas públicas. Preserve a chave original `CUSTOMER_DATA_KEY` se houver dados históricos criptografados. Novos contatos não exigem essa chave nem R2. Fotos de vistoria podem ficar no computador da loja, com referências e checklist no painel.

## Desenvolvimento e publicação

Node.js 24; instalar com `npm ci`. Copie `.dev.vars.example` para `.dev.vars` somente no ambiente local. Os segredos reais não devem entrar no GitHub.

```sh
npm run db:local
npm run dev
```

```sh
npm test
npx tsc --noEmit
npm run build:cloudflare
npm run deploy:cloudflare -- --dry-run
```

Os comandos acima são executados dentro desta pasta para desenvolvimento. No painel Cloudflare, use a branch `main` e a raiz do repositório (`/`): os comandos equivalentes da raiz cuidam desta pasta automaticamente. Node 24 é escolhido por `.node-version`.

O último comando apenas valida o pacote. Para publicar, use `npm run deploy:cloudflare` na conta Cloudflare autorizada; esse comando aplica migrações D1 e publica o Worker. O novo Database ID já está configurado: `72584dd8-cc93-41f6-8495-b396a45a4d83`. As atualizações posteriores preservam os registros desse banco.

Em produção, o primeiro acesso `/admin` usa um segredo temporário `ADMIN_SETUP_KEY` de pelo menos 32 caracteres. Crie a senha administrativa e remova esse segredo após concluir. Não copie o override local `FLEET_OWNER_ID` para produção.

Os registros iniciais e decisões substituídas estão no [histórico](docs/HISTORICO-VERSOES-INICIAIS.md); eles não representam o fluxo atual.
