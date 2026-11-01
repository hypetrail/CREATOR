# Reservas integradas à frota

> Atualização vigente: consulte [Fluxo do site e WhatsApp](FLUXO-SITE-WHATSAPP.md). A T1 não tem escolha pública de cor, o e-mail é opcional, o cadastro continua completo e o atraso desconta duas horas antes da cobrança por hora iniciada. Referências anteriores divergentes abaixo são históricas.

A aba **Reservas** usa o mesmo estoque e calendário da frota. Este guia descreve o código preparado para a nova operação; publicação, serviços externos e homologação no ambiente de destino são etapas próprias.

## Rotina da equipe

1. Em **Reservas**, busque pelo número, modelo, cor ou nome interno da unidade. Os filtros também permitem escolher situação e período.
2. Uma reserva nova começa em **Reservada**: a unidade física já ocupa o período no calendário.
3. Clique em **Iniciar preparação**. A moto continua indisponível para outra reserva no mesmo período.
4. Confira revisão/equipamentos, documentação/elegibilidade e bateria carregada. Marque as três confirmações e informe o horário de retirada, dentro do período reservado.
5. Clique em **Liberar para retirada**. A situação passa para **Pronta para retirada**, e o painel prepara o aviso com número, moto, horário e endereço. Também solicita o e-mail com PDF de confirmação, usando o contato autorizado do cadastro protegido quando configurado.
6. Na saída, abra **Vistoria de saída e confirmação da retirada**. Confira os sete itens, anexe ao menos uma foto e salve. Depois confira pagamento, documentação, elegibilidade e assinatura e use **Confirmar retirada e iniciar tempo**. A situação passa para **Alugada**, com início efetivo registrado pelo servidor. O pagamento presencial é conferido e anotado pela equipe.
7. No retorno, abra a vistoria de devolução, confira os itens, registre fotos e avarias, salve e use **Confirmar devolução**. A situação passa para **Devolvida**. O prazo real, o atraso e a preparação seguinte são registrados separadamente.

Reservas ainda não retiradas podem ser canceladas; isso libera o período. Uma reserva encerrada não pode ser reativada. Motos já alugadas devem passar pela devolução. Se uma moto pronta precisar de nova conferência, use **Voltar à preparação**; o aviso de retirada fica indisponível até nova liberação.

## Reserva de balcão, telefone ou WhatsApp

1. Em **Reservas**, clique em **Criar reserva manual**.
2. Informe retirada e devolução em horários de Brasília.
3. Escolha uma unidade disponível para o período. A opção identifica modelo, cor e moto física.
4. Clique em **Consultar valores**. O sistema aplica a mesma tarifa do site, incluindo o seguro obrigatório da T1.
5. Confira os valores com o cliente, aceite as condições e clique em **Confirmar reserva manual**.

A reserva recebe número, entra no calendário e começa com pagamento pendente na loja. A operação manual é permitida mesmo com a abertura pública de reservas desativada. O servidor confere novamente unidade, disponibilidade e condições para evitar sobreposição ou preço desatualizado.

A criação manual inicial separa a unidade e registra os dados comerciais. Na seção de cadastro e documentos da reserva, quando ainda não houver identificação preservada, o administrador pode preencher **Identificação do cliente da reserva** e usar **Salvar cadastro e gerar PDF protegido**. Isso exige chave e armazenamento configurados, não envia e-mail automaticamente nem comprova assinatura/pagamento. O primeiro snapshot é preservado; alterar posteriormente um perfil não o reescreve. O histórico identifica **Reserva manual** ou **Reserva pelo site**.

## Duas mensagens diferentes

- **Confirmação da reserva:** preparada depois do registro, com número, modelo/cor, datas, total e aviso para aguardar a liberação da moto.
- **Aviso de moto pronta:** disponível somente enquanto a reserva está pronta para retirada, depois da conferência operacional e do horário confirmado. Usa o endereço preservado nas condições da reserva.

Informe o WhatsApp do cliente no campo de envio e clique em **Abrir mensagem no WhatsApp**. Confira e toque em **Enviar** no WhatsApp. Também é possível copiar o texto. O número digitado somente para abrir essa mensagem permanece na tela e não altera o cadastro. Separadamente, a conta do cliente pode guardar o telefone de login e suas preferências autorizadas.

Abrir o WhatsApp prepara uma mensagem manual e não comprova entrega. O novo fluxo de avisos automáticos usa fila e depende da integração oficial, templates aprovados, telefone verificado, preferência aplicável e agendador. O contato é obtido de forma autorizada, sem usar cadastro apenas como autorização presumida para ofertas. Credenciais e mensagens reais não são simuladas.

## Calendário e frota

As situações **Reservada**, **Em preparação**, **Pronta para retirada** e **Alugada** ocupam a unidade no calendário. Elas também impedem alterações conflitantes de cor ou retirada da unidade da frota. Uma moto alugada com devolução atrasada continua indisponível até o registro da devolução.

Ao clicar numa célula ocupada do calendário, o painel abre a aba Reservas já filtrada pelo número correspondente. Células livres continuam permitindo preparar bloqueios da empresa. Atualize os dados caso outra pessoa tenha realizado alterações em outra tela.

## Atualização e validação técnica

Aplique as migrações em ordem até `0008_private_customer_documents.sql`. A `0004` introduziu o fluxo operacional; a `0007` acrescenta contas, horários efetivos, vistorias, registros e notificações; a `0008` acrescenta identificação e documentos criptografados. As anteriores e os registros históricos são preservados.

Aplicação local: dentro de `site/`, executar `npm run db:local`. Em produção, aplicar a migração pelo fluxo da hospedagem, preservando o banco existente, antes de publicar o código.

A validação técnica usa testes automatizados de estoque, concorrência, períodos efetivos, vistorias, privacidade e filas, além de TypeScript e build. Use o relatório da entrega para o resultado final de navegador. Os testes dos provedores usam serviços simulados e não comprovam recebimento real de mensagens.

## Documentos por e-mail

O cliente preenche identificação e e-mail obrigatório no site. A confirmação da reserva e a liberação para retirada possuem PDFs distintos com as condições preservadas. O remetente escolhido é calori.mobi2@gmail.com; o envio real exige autorização OAuth da conta e acesso autorizado à identificação preservada da reserva. O cadastro externo é opcional no novo modelo de armazenamento protegido no site. Consulte [Documentos e cadastro](DOCUMENTOS-E-CADASTRO.md). A operação continua registrada se o e-mail falhar, com resultado visível e proteção contra reenvio duplicado. Os adaptadores foram testados com serviços simulados, sem enviar e-mail real.

## Retirada e devolução efetivas

A retirada começa a contar somente na ação da equipe após salvar a vistoria de saída com fotos e concluir as conferências de pagamento, documentação, elegibilidade e assinatura. O servidor registra o horário e calcula o prazo de devolução pelo período contratado. Se isso conflitar com outra reserva ou bloqueio, a equipe precisa resolver o conflito antes da entrega; o sistema não reduz o período silenciosamente.

Na devolução, salvar a vistoria de retorno e registrar o encerramento. Há três horas de preparação antes de outra locação. Falha ou avaria que exija manutenção precisa manter a unidade bloqueada até reparo e conferência, preservando as reservas futuras para que a equipe trate os clientes afetados.

A multa atual, para novas condições aceitas, tem tolerância de duas horas. Depois dela, meia diária na mesma data; no dia seguinte, uma diária completa com seguro substitui a meia diária. Dois ou mais dias posteriores exigem conferência até que a repetição seja definida. A apuração não registra pagamento nem cobra automaticamente, e o histórico mantém as condições originalmente aceitas.

## Relatórios, avisos e dados privados

Em cada reserva, a consulta da identificação completa é uma ação explícita do administrador; os dados podem ser ocultados novamente. PDFs preservados têm download privado. O número da reserva, sozinho, não libera dados ao público. Cliente autenticado só consulta reservas vinculadas à sua sessão quando foram criadas; uma reserva de visitante não é assumida automaticamente por uma conta posterior.

As fotos da interface são normalizadas para JPEG otimizado e não entram na galeria de produtos. O relatório de vistoria reúne checklist e fotos. Seu envio automático ao arquivo WhatsApp da empresa precisa de template aprovado e destino configurado; a alternativa manual exige baixar e anexar o relatório. O horário de envio da foto não atesta a data original de captura.

Na aba **Avisos**, a fila registra preparo, liberação, lembrete de devolução, cuidados e disponibilidade. Telefones precisam estar verificados e ter a preferência aplicável. Ofertas têm autorização distinta, limite de sete dias e dependem de reservas públicas abertas; o administrador pode desligar a automação. Aceitação pelo provedor não comprova entrega. Veja [Operação e cadastro](ENTREGA-OPERACAO-E-CADASTRO.md).
