# Calori Go — locação sem conta de cliente

O cliente escolhe modelo e período, informa o WhatsApp, pode adicionar um nome de atendimento e autoriza os avisos operacionais. Não cria conta ou senha nem preenche CPF, endereço, e-mail ou documentos pessoais. Identificação, elegibilidade, vistoria e assinatura são conferidas presencialmente pela loja.

O administrador mantém seu próprio login, controla frota, unidades, preços, disponibilidade, manutenção, reservas, preparação, liberação, retirada e devolução. Os avisos usam eventos reais: reserva registrada, preparação, moto pronta e prazo de devolução. Uma pendência precisa ser registrada pela equipe para uma reserva que já tenha contato autorizado.

O servidor e o banco D1 permanecem necessários para compartilhar o estoque e programar os avisos. Novos contatos mínimos ficam no D1 privado e não exigem CUSTOMER_DATA_KEY, R2, Gmail ou PDF automático. Dados completos e documentos históricos são preservados com acesso administrativo; preserve a chave original caso tenham sido criptografados antes.

Leia **site/docs/NOVO-FLUXO-SEM-CADASTRO.md** para a operação atual. Para publicar pelo navegador, siga **site/docs/PUBLICAR-CLOUDFLARE-PELO-PAINEL.md**.

Configuração do Cloudflare: repositório hypetrail/CREATOR, branch entrega/site-whatsapp-2026-11-01, diretório raiz site, build npm run build:cloudflare, publicação npm run deploy:cloudflare. A publicação aplica também a migração 0011_minimal_reservation_contacts.sql. O D1 esperado é calori-go-db, ID 87762edb-d9b6-4dd7-bb72-9c3cc58329e4.

O site continua sendo uma aplicação React/TypeScript com Worker, portanto use a integração com GitHub, não o uploader de arquivos estáticos. Não houve migração de dados reais ou publicação na conta Cloudflare presumida por este documento.

O primeiro administrador é criado usando o segredo provisório ADMIN_SETUP_KEY no painel do Worker; remova-o depois de criar a senha. A API oficial do WhatsApp precisa de número remetente, versão, token de servidor e template aprovado para enviar mensagens reais. Sem configuração, o sistema deve mostrar envio pendente. Credenciais nunca devem ser colocadas no frontend ou repositório.

Fotos de vistoria podem ficar no computador: apenas os nomes e o checklist são registrados, sem cópia automática das imagens. A documentação das condições, a proteção e a elegibilidade da T1 precisam ser conferidas pela operação antes da entrega.
