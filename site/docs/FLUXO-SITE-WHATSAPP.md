# Fluxo atual do site: T1 e WhatsApp

> Para publicar pelo painel Cloudflare com o GitHub, siga [Publicação no Cloudflare](PUBLICAR-CLOUDFLARE-PELO-PAINEL.md). O build de produção usa autenticação administrativa própria; o login local do ChatGPT continua exclusivo do desenvolvimento.

Esta atualização substitui as referências anteriores a cinco cores, multa de meia diária e envio obrigatório por e-mail. O foco é o site; não há aplicativo nativo ou PWA criado nesta etapa.

## Frota e cliente

- Cinco unidades físicas T1, com o mesmo acabamento da loja. O cliente escolhe apenas o modelo, sem seletor nem descrição da cor. O acabamento continua sendo um dado interno.
- O administrador continua podendo cadastrar outros modelos e retirar unidades da operação, preservando o histórico.
- R$ 45 por diária para duas ou mais diárias: R$ 30 de aluguel + R$ 15 de proteção incluída. Uma diária de 24 horas continua custando R$ 60, com proteção.
- Cadastro completo junto da reserva: nome, CPF, nascimento, WhatsApp, CEP, rua, número, bairro, cidade, UF e complemento opcional. Responsável e presença na retirada para 16–17 anos, conforme as conferências de elegibilidade. E-mail é opcional.
- O resumo da reserva reúne modelo, unidade, período, preço e código. A identificação completa é criptografada e vinculada à reserva; não vai no link público que abre uma conversa com a loja.
- A conta continua opcional, com celular e senha. A ficha pode recuperar campos vazios do cadastro da conta. A identificação preservada não muda quando o perfil é editado.
- Pagamento exclusivamente presencial. O cadastro não anuncia a moto como pronta; a equipe precisa liberá-la.

## Atraso confirmado nesta atualização

As primeiras duas horas após o prazo são descontadas. Depois, cada hora iniciada é cobrada pela fração de 1/24 da diária total contratada, com a proteção já incluída. Não se usa a mudança de data para lançar uma diária inteira.

Fórmula: `arredondar_centavos(diária_em_centavos × ceil((atraso − 2 horas) / 1 hora) / 24)`; até duas horas, zero.

Para uma diária de R$ 45, a referência é R$ 1,875 por hora. Não arredondar para R$ 1,88 antes de multiplicar.

| Atraso total | Horas cobradas | Valor |
| --- | ---: | ---: |
| Até 2 horas | 0 | R$ 0 |
| 2 horas e 1 minuto | 1 | R$ 1,88 |
| 3 horas exatas | 1 | R$ 1,88 |
| 3 horas e 1 minuto | 2 | R$ 3,75 |
| 4 horas | 2 | R$ 3,75 |
| 24 horas | 22 | R$ 41,25 |
| 26 horas | 24 | R$ 45 |

Na diária única de R$ 60, a referência horária é R$ 2,50. Reservas anteriores mantêm suas condições, preços e políticas de atraso. A cobrança registrada é para conferência; não há débito bancário automático.

## WhatsApp, sem e-mail obrigatório nem armazenamento automático de PDF

O formulário registra a identificação protegida e prepara mensagens de texto com:

1. Código, modelo, período, total e pagamento na loja.
2. Identificação completa e endereço do cliente.
3. Especificações técnicas preservadas do modelo escolhido.
4. Versão e cláusulas das condições, com indicação de rascunho quando aplicável.
5. Cuidados com a moto.

Depois, o mesmo canal contempla preparação, liberação com horário confirmado e lembrete de devolução. O lembrete é preparado nas duas horas anteriores ao prazo efetivo. Mensagens só são preparadas para reservas com identificação e autorização operacional registradas. Ofertas continuam separadas.

Os textos longos são divididos em partes numeradas para respeitar o limite de parâmetros da Meta, sem cortar cláusulas. O painel **Avisos** mostra cada parte e seu resultado. Resultados incertos não são reenviados automaticamente; a aceitação pela Meta não comprova entrega.

Usa-se a integração oficial WhatsApp Business Cloud API já existente, com um novo template utilitário `WHATSAPP_TEMPLATE_RENTAL`. Parâmetros de corpo, nesta ordem: código da reserva, título/número da parte, texto da parte. Exemplo para solicitar aprovação à Meta:

> CaloriMob — atendimento da reserva {{1}}. Informação: {{2}}. Confira: {{3}}. Para esclarecer qualquer dúvida sobre sua locação, responda à loja.

O nome e a aprovação real do template dependem da Meta. Informar o número comercial sozinho não autoriza envios. Ainda faltam conta Business/número remetente compatível, token, versão da API e template aprovado. Não foi realizada conexão nem envio real. Se a conexão não estiver disponível, o site informa isso e mantém o botão para o cliente falar com a loja.

Não há envio automático por Gmail neste novo fluxo. O PDF pode ser gerado na tela quando solicitado, sem gravação automática em R2. As rotas antigas e os documentos anteriores foram preservados; reservas que solicitaram explicitamente envio por e-mail mantêm esse atendimento. As condições ainda pendentes de revisão continuam identificadas como rascunho.

## Fotos no computador

A vistoria oferece por padrão **Guardar fotos no computador, sem enviar imagens ao site**. A equipe seleciona os arquivos já salvos e confirma que estão guardados na pasta da reserva. Apenas os nomes e o checklist são registrados no banco; o site não copia, abre remotamente nem faz backup dessas fotos. O relatório identifica claramente as referências locais, sem afirmar que contém as imagens.

Pasta sugerida: `reservas/CG-CODIGO/saida` e `reservas/CG-CODIGO/devolucao`. Mantenha também uma cópia de segurança separada. O envio privado de imagens continua disponível como opção para depois da contratação do armazenamento.

Fotos públicas do catálogo precisam estar dentro dos arquivos do site ou em armazenamento acessível pela hospedagem. Uma imagem que existe apenas no computador da loja não aparece automaticamente no navegador dos clientes. Não foi inventada uma foto da T1 adesivada; a ilustração continua sinalizada até a loja fornecer a imagem correta.

## Atualização e testes

Aplicar também a migração `0009_t1_single_finish.sql`, pelo fluxo de migrações da hospedagem, com backup quando houver uma base real. Ela muda apenas a frota atual e preserva reservas, identificações, preços e snapshots históricos. A proteção de alterações de unidades ocupadas é recriada sem mudar sua regra.

Para testar localmente: `npm run db:local`, `npm test`, `npx tsc --noEmit`, `npm run build`, depois `npm start`. Neste ambiente, Wrangler precisa de `XDG_CONFIG_HOME` em diretório gravável, conforme o guia de desenvolvimento.

Não publicar o login local de demonstração. Produção ainda exige autenticação confiável, banco real, chave de criptografia preservada, backup e homologação. O armazenamento de fotos/PDFs pode ser adiado neste fluxo; o banco e a criptografia do cadastro completo continuam necessários.
