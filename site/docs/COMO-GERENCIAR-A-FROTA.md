# Como gerenciar a frota Calori Go

O cliente usa a página inicial e **Minhas reservas** em `/minha-conta`. A empresa usa `/admin`, com um proprietário autenticado e acesso completo. O código foi preparado localmente; publicação, aplicação das migrações e homologação no ambiente de destino são etapas próprias.

## Cadastro inicial da T1

Foram cadastradas cinco unidades físicas: Azul, Branca, Verde, Vermelha e Verde camela, uma de cada cor, conforme informado. Os identificadores T1 · 001 até T1 · 005 são referências internas, não números de chassi.

| Período | Aluguel | Seguro incluído | Total |
|---|---:|---:|---:|
| Uma diária de 24 horas | R$ 45 | R$ 15 | R$ 60 |
| Duas diárias | R$ 60 | R$ 30 | R$ 90 |
| Três diárias | R$ 90 | R$ 45 | R$ 135 |

A partir de duas diárias, o total é R$ 45 por dia: R$ 30 de aluguel e R$ 15 de seguro. Frações adicionais contam uma nova diária. Por exemplo, 24 horas e um minuto são duas diárias, total de R$ 90. O pagamento é exclusivamente presencial.

As reservas começam desativadas nas configurações, para a equipe conferir contatos, condições e operação antes da liberação.

## Alterar preço ou informações

1. Entre em `/admin` e selecione **Frota e modelos**.
2. No modelo, clique em **Editar modelo**.
3. Altere **Aluguel por diária (R$)**. Para a T1 atual, esse campo vale **30**; o seguro incluído vale **15**, resultando em **45** para o cliente.
4. A exceção de uma diária possui aluguel de **45**, somado ao seguro de **15**, totalizando **60**.
5. Confira a prévia do valor total e clique em **Salvar modelo**.

O preço muda para novas reservas. Uma reserva existente mantém os valores e condições aceitos. Se as condições mudarem enquanto o cliente preenche a ficha, o sistema exige revisar o orçamento antes de confirmar.

## Adicionar um modelo diferente

1. Em **Frota e modelos**, clique em **Adicionar modelo**.
2. Informe nome, marca, preço e ficha técnica conhecida.
3. Cadastre as cores e envie fotos gerais e fotos de cada cor.
4. Configure seguro incluído ou opcional, período mínimo e eventual tarifa de diária única.
5. Salve o modelo. Depois use **Adicionar moto** ou **Cadastrar unidade** para cada veículo físico.
6. Marque **Exibir modelo no site de locação** quando o cadastro estiver pronto.

Cadastrar um modelo ou uma cor, sozinho, não cria unidades no estoque. A quantidade exibida vem das motos físicas cadastradas.

## Tirar um modelo do catálogo e trazê-lo de volta

Clique em **Ocultar modelo do site** no cartão do modelo. O cliente deixa de vê-lo, mas a empresa conserva unidades, histórico e reservas. Para retornar, use **Exibir modelo no site**. Não é necessário apagar e cadastrar tudo novamente.

## Adicionar uma moto física e controlar sua cor

1. Clique em **Cadastrar unidade**.
2. Escolha o modelo e uma das cores cadastradas.
3. Dê um nome interno à unidade e informe patrimônio ou chassi, se desejar.
4. Selecione **Em operação** e salve.

Uma moto equivale a uma linha no cadastro. Para alterar cor, nome ou identificação, clique em **Editar unidade**. O sistema impede recolorir ou retirar de operação uma unidade com reserva ativa. Resolva primeiro a reserva; o combinado do cliente continua preservado no registro.

## Manutenção, bloqueio e retirada de operação

- **Manutenção sem prazo:** edite a unidade e selecione **Em manutenção**.
- **Manutenção em datas específicas:** abra **Calendário**, selecione a unidade e cadastre um bloqueio com início e fim.
- **Retirada permanente da frota:** selecione **Fora de operação**. O histórico permanece.
- **Retorno:** altere a unidade para **Em operação** ou remova o bloqueio correspondente.

A disponibilidade considera período, cor, reservas, bloqueios, intervalo de preparação de três horas e bloqueios de segurança por avaria. Uma unidade alugada com devolução atrasada continua indisponível até o retorno. Se a vistoria gerar bloqueio de segurança, registre o reparo e a resolução em **Registros**; apenas mudar a unidade para Em operação não remove esse bloqueio.

## Liberar reservas pelo site

1. Abra **Configurações**.
2. Confira endereço, WhatsApp, regras e condições da proteção. Confirme o enquadramento de circulação da T1, a documentação da empresa e as condições definitivas de cobertura, cancelamento e ausência. Para dados completos e PDFs privados, configure a chave e o armazenamento antes de receber dados reais.
3. Habilite **Liberar reservas pelo site** e salve.
4. Na página pública, escolha datas e confira se as cores disponíveis correspondem à operação.

Os campos e controles do painel alteram o banco usado pelo site. Mudanças aparecem na próxima consulta do cliente; não há sincronização automática de uma página já aberta sem nova consulta.

## O que acontece ao reservar

O cliente escolhe datas, modelo e cor, preenche a ficha e aceita as condições. Para acompanhar depois na conta, deve entrar antes de confirmar; o número da reserva não permite assumir uma reserva de visitante. Ao confirmar, o servidor recalcula o total, verifica as condições aceitas e separa uma unidade em uma operação atômica.

A reserva recebe um número `CG-...`, entra no calendário e aparece em **Reservas**, com pagamento pendente na retirada. O cliente informa e-mail obrigatório, pode baixar o PDF preenchido e solicita o envio automaticamente. O envio depende de conectar o Gmail e disponibilizar o contato no cadastro protegido; pendências ficam visíveis. A ficha pelo WhatsApp permanece como alternativa manual.

A empresa autorizou guardar o cadastro e os documentos completos no site em área protegida. A conta básica usa telefone e senha em hash; a identificação completa usa armazenamento criptografado e os documentos exigem autorização para acesso. A configuração segura da hospedagem é obrigatória antes de receber dados reais. A reserva preserva valores e condições aceitas, e a identificação de um documento emitido não deve ser sobrescrita silenciosamente. Abrir o WhatsApp ou enviar e-mail também encaminha os dados necessários ao respectivo serviço. Cadastros pessoais antigos não foram apagados por esta atualização. Consulte o guia de Documentos para a configuração e as restrições de acesso.

O cliente deve guardar o número e aguardar a liberação da equipe antes de ir retirar. O código não é comprovante de pagamento.

## Recursos preparados e conexões pendentes

Estão preparados: conta do cliente, cadastro completo protegido, PDFs privados, vistorias com fotos, contador pela retirada efetiva, registro de despesas/ocorrências/rastreador e fila de WhatsApp. Em **Avisos**, a empresa controla o processamento e a automação de disponibilidade. Os avisos proativos exigem telefone verificado e autorização específica; ofertas não são presumidas pelo cadastro.

Ainda dependem de configuração ou definição: autorização real do Gmail, conta Meta/API/templates, publicação e segredos, condições contratuais finais e enquadramento da T1. Não há plano/desconto com preço inventado, assinatura eletrônica presumida ou localização GPS ao vivo. Rastreamento depende de instalação e fornecedor/API. Backup e contingência foram deixados para próxima etapa.

O WhatsApp manual continua disponível: abrir uma conversa prepara a mensagem e a equipe confirma o envio. Nenhuma mensagem automática ou e-mail é simulado como enviado. Consulte [Operação e cadastro](ENTREGA-OPERACAO-E-CADASTRO.md) e [Documentos e cadastro](DOCUMENTOS-E-CADASTRO.md).

## Fotos recebidas

As fotos inseridas na conversa não chegaram ao ambiente como arquivos baixáveis. Por isso, as galerias por cor ficaram prontas para receber os arquivos originais em **Editar modelo → Cores e fotos de cada cor**.

Foi utilizada provisoriamente uma foto ilustrativa extraída do manual, com acabamento diferente das imagens da conversa. Ela não é apresentada como prova da cor escolhida. Para incorporar exatamente as fotos enviadas, forneça os PNG/JPG como arquivos ou em um ZIP, ou envie-os pelo próprio painel.

## Atualização: operação de Reservas

A rotina completa está em [Reservas e retirada](RESERVAS-E-RETIRADA.md). A célula ocupada do calendário abre a reserva correspondente. As vistorias de saída e retorno precisam de fotos e conferências antes de confirmar retirada/devolução. O servidor registra os horários efetivos e recusa uma retirada que ocupe outra reserva ou seu intervalo de preparação. Aviso de moto pronta só é preparado depois da liberação real. O envio depende dos serviços conectados e suas autorizações.

## Atualização: documento PDF e cláusulas

O PDF real agora é gerado na página, com opção de download e impressão. O painel **Documentos** permite preparar cláusulas e publicar versões revisadas, preservadas por reserva. A seção de documentos e identificação, em cada reserva, permite consultar o cadastro autorizado e baixar PDFs privados. Para atendimento de balcão, se ainda não existir identificação preservada, permite preenchê-la e gerar a via protegida. O cadastro externo permanece opcional. Veja [Documentos e cadastro](DOCUMENTOS-E-CADASTRO.md). O envio usa Gmail API com o remetente calori.mobi2@gmail.com e os dados autorizados da reserva; o serviço precisa ser conectado. O cadastro externo é opcional no novo modelo de armazenamento protegido. Veja o passo a passo no guia.

## Regras operacionais confirmadas

A T1 tem limite operacional de peso combinado abaixo de 120 kg, três horas de preparação entre locações e conferência obrigatória da elegibilidade da unidade. A retirada e a devolução exigem vistoria com fotos. A contagem das diárias usa a retirada efetiva registrada pela equipe e o prazo resultante, preservando as datas inicialmente reservadas para referência.

A tolerância de atraso é de duas horas, inclusive ao atravessar a meia-noite. Depois dela, na mesma data prevista aplica-se metade da diária; no dia seguinte, uma diária inteira com seguro substitui a metade, sem somá-las. Dois ou mais dias posteriores permanecem para conferência, sem repetição automática presumida. Esses valores são apurados separadamente do pagamento presencial e não são um débito automático. Contratos antigos preservam sua regra aceita.

A proteção básica contempla os danos simples previstos à moto alugada mesmo quando terceiros participam do acidente; danos a terceiros e quebra do chassi permanecem excluídos. Fornecedor/natureza da proteção, franquias e limites ainda precisam de documentação.
