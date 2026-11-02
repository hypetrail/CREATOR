# CaloriMob — locação de motos elétricas

O site está em [`site/`](site/). O cliente reserva pelo WhatsApp, sem criar conta. A administração controla frota, disponibilidade, preços e operação; o servidor prepara os avisos da locação.

- [Fluxo atual sem cadastro de cliente](site/docs/NOVO-FLUXO-SEM-CADASTRO.md)
- [Publicar no Cloudflare pelo painel e GitHub](site/docs/PUBLICAR-CLOUDFLARE-PELO-PAINEL.md)
- [Gerenciar a frota e as reservas](site/docs/COMO-GERENCIAR-A-FROTA.md)
- [Validação da entrega](site/docs/VALIDACAO-CLOUDFLARE.md)

Use a branch `entrega/site-whatsapp-2026-11-01`, diretório raiz `site`, build `npm run build:cloudflare` e deploy `npm run deploy:cloudflare`. A API oficial do WhatsApp exige configuração na hospedagem; suas credenciais ficam somente no servidor.
