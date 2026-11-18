# Checkout compacto

- Modelo e período previsto no topo; resumo comercial com aluguel, seguro obrigatório em verde e total.
- Cobertura expansível em tópicos, com acesso às condições completas. Quando a loja alterar o texto contratual, a interface apresenta o conteúdo configurado, sem aplicar um resumo antigo.
- Nome e WhatsApp obrigatórios na reserva pública, com validação no navegador e no servidor. Reservas históricas e atendimento manual preservam compatibilidade.
- Visual de vidro discreto, sem animações; fundo opaco quando o navegador não oferece desfoque ou o usuário prefere transparência reduzida.
- Link informado pela loja: https://maps.app.goo.gl/VaRnDRooZaSWEASj7. Novas reservas preservam esse link no seu registro de condições.
- Confirmação automática inclui nome do contato autorizado e localização. Identificação histórica não é copiada. O envio continua pela fila existente, depende da API e do modelo de mensagem aprovados; o cron está configurado para executar a cada cinco minutos. Registro e fila não comprovam entrega da mensagem.
- O botão de conversa com a loja abre uma mensagem preenchida com “Acabei de solicitar uma locação”, nome, modelo, número, período, total e localização. O cliente confirma o envio no WhatsApp. Isso não substitui a entrega automática ao cliente.
- O aviso de pronta para retirada continua condicionado à liberação da equipe.

Validação: 198 testes automatizados, TypeScript, compilação Cloudflare, simulação de publicação e 15 verificações no navegador. No celular de 390 px, o campo de WhatsApp ficou a aproximadamente 625 px do início da etapa (748 px na versão anterior). Nenhuma mensagem real foi enviada durante os testes.
