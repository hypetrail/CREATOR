# Calori Go — publicação pelo painel Cloudflare

Abra **site/docs/PUBLICAR-CLOUDFLARE-PELO-PAINEL.md** para publicar pelo GitHub e Cloudflare Workers, sem upload de ZIP e sem terminal.

Configuração do painel: branch **entrega/site-whatsapp-2026-11-01**, diretório raiz **site**, build **npm run build:cloudflare**, publicação **npm run deploy:cloudflare**. Crie o D1 **calori-go-db** e informe seu Database ID real em **CALORI_D1_DATABASE_ID** nas variáveis de build. A publicação aplica as migrações.

O administrador tem login próprio por senha. O primeiro acesso é autorizado pelo segredo provisório **ADMIN_SETUP_KEY**, cadastrado no painel Cloudflare. A chave deve ser removida depois da criação da senha. A tela **/admin/configuracao** orienta a gerar e guardar a chave **CUSTOMER_DATA_KEY** do cadastro completo.

T1 sem escolha pública de cor, cinco unidades, cadastro completo com e-mail opcional, celular e senha para clientes, mensagens WhatsApp preparadas e fotos de vistoria no computador. PDF e R2 são opcionais nesta fase. A API WhatsApp ainda precisa ser conectada para envios reais.

Validação: 160 testes aprovados, TypeScript e build de produção aprovados, Wrangler dry-run e fluxo real do Worker no navegador. Nenhuma publicação na conta Cloudflare, migração remota ou mensagem externa foi realizada nesta sessão. Consulte **site/docs/VALIDACAO-CLOUDFLARE.md**.

Segredos, bancos de teste, dependências instaladas e arquivos de execução local não fazem parte desta entrega. Não substitua a chave de criptografia de uma base existente.
