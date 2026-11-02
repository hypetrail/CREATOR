# Como gerenciar a frota CaloriMob

O cliente usa a página inicial e reserva com WhatsApp obrigatório e nome opcional, sem conta. A empresa usa `/admin`, com senha própria e acesso completo. Veja também [o fluxo sem cadastro](NOVO-FLUXO-SEM-CADASTRO.md) e [a publicação pelo Cloudflare](PUBLICAR-CLOUDFLARE-PELO-PAINEL.md).

## Frota e preços iniciais

São cinco unidades T1, identificadas internamente de T1 · 001 até T1 · 005. A T1 não oferece seleção de cor ao cliente; o acabamento da loja é interno. Os identificadores não substituem o chassi real.

| Período | Locação | Proteção incluída | Total |
| --- | ---: | ---: | ---: |
| Uma diária de 24 horas | R$ 45 | R$ 15 | R$ 60 |
| Duas diárias | R$ 60 | R$ 30 | R$ 90 |
| Três diárias | R$ 90 | R$ 45 | R$ 135 |

A partir de dois dias, são R$ 45 por dia, incluindo R$ 15 de proteção. Frações do período contratado contam uma nova diária; a multa por devolução atrasada usa outra regra, descrita abaixo. O pagamento é exclusivamente presencial.

## Modelos, unidades e preços

1. Abra **Frota e modelos** em `/admin`.
2. Use **Editar modelo** para alterar descrição, fotos, tarifas e condições. Na T1, o aluguel padrão é R$ 30 e a proteção incluída R$ 15. A exceção de diária única tem aluguel de R$ 45 e proteção de R$ 15.
3. Use **Adicionar modelo** para oferecer outro veículo. Cadastre suas informações técnicas, tarifas e fotos, e depois uma unidade física para cada moto real.
4. Use **Ocultar modelo do site** para retirar um modelo do catálogo. O histórico e as unidades permanecem. **Exibir modelo no site** permite trazê-lo de volta.
5. Use **Cadastrar unidade** ou **Editar unidade** para identificação interna e situação de cada moto.

Editar preços ou condições afeta novas reservas. As anteriores preservam o combinado. Modelos com opções de acabamento podem ter variantes; a T1 atual não exibe opções de cor.

## Manutenção e disponibilidade

- **Manutenção sem prazo:** coloque a unidade em manutenção.
- **Bloqueio com datas:** use o calendário para definir início e fim.
- **Remoção da operação:** marque fora de operação; não apague o histórico.
- **Retorno:** restabeleça a situação disponível e confira bloqueios e pendências de segurança.

A disponibilidade considera cada unidade, reservas, bloqueios, avarias e três horas para vistoria, limpeza e recarga. Uma moto alugada e atrasada permanece ocupada. Um bloqueio de segurança exige registrar a solução; mudar somente o status da unidade não o remove. Reservas conflitantes impedem alterações incompatíveis na moto.

## Liberar o atendimento público

Abra **Configurações**, confira contato/endereço, preços e condições e habilite **Liberar reservas pelo site**. Reservas começam desativadas para permitir essa conferência. Novos contatos não dependem de chave de cadastro, e-mail ou R2.

O cliente escolhe datas e modelo, informa WhatsApp e nome opcional, autoriza os avisos operacionais e aceita as condições. O servidor confere novamente valores e disponibilidade e grava reserva e contato na mesma transação. O número `CG-...` aparece na confirmação e no painel. Ele não é um recibo de pagamento nem confirmação de moto pronta.

Não há perfil, senha ou portal de documentos do cliente. Identificação completa, documentação, elegibilidade e assinatura são conferidas presencialmente pela equipe. Dados históricos completos permanecem acessíveis somente ao administrador autorizado; preserve a chave original se já houver registros criptografados.

## Operar uma reserva

1. Em **Reservas**, busque pelo número ou abra a ocupação no calendário.
2. Use **Criar reserva manual** para atendimento de balcão, telefone ou WhatsApp. Informe o contato e sua autorização no mesmo registro.
3. Registre **Em preparação** para iniciar a conferência.
4. Confirme moto, documentação e bateria antes de **Liberar para retirada** e registrar o horário. Só essa ação prepara o aviso de moto pronta.
5. Faça a vistoria de saída com checklist e referências às fotos do computador. Registre a retirada efetiva para iniciar o período contratado e o contador no painel.
6. Confira o pagamento presencial. O sistema registra o que a equipe conferiu; não cobra automaticamente.
7. Na devolução, registre vistoria de retorno, avarias e eventuais valores a conferir. Danos podem manter a moto bloqueada até solução.

O painel também permite cancelar reservas e registrar despesas, ocorrências e manutenção. A identificação completa não é solicitada online neste fluxo.

## WhatsApp e correções do contato

Em cada reserva, o administrador pode consultar/corrigir o contato, registrar pendência ou revogar os avisos. A correção exige conferir a autorização do destinatário. Avisos já aceitos ou com resultado incerto não são repetidos automaticamente.

A aba **Avisos** mostra os resumos operacionais e o resultado do processamento. O Worker processa a fila a cada cinco minutos na hospedagem: confirmação, preparação, pendência registrada pela equipe, retirada liberada e proximidade da devolução. Não há campanha automática de contas antigas nem detecção de abandono sem contato recebido.

Configure a API oficial da Meta e o template utilitário aprovado usando [o guia de publicação](PUBLICAR-CLOUDFLARE-PELO-PAINEL.md). Sem configuração, o painel informa a pendência. Aceitação pela API não comprova entrega. Custos e limites são os da Meta; a confirmação usa até quatro partes de resumo. As condições completas são apresentadas antes do aceite.

## Atraso e segurança

A regra atual desconta as primeiras duas horas de atraso. Depois, cada hora iniciada corresponde a 1/24 da diária combinada; arredondam-se os centavos apenas no total. Para diária de R$ 45: 3 horas de atraso total geram R$ 1,88; 4 horas geram R$ 3,75; 26 horas geram R$ 45. A apuração não realiza débito automático. Reservas antigas preservam sua política aceita.

A T1 exige peso combinado abaixo de 120 kg. A circulação e a elegibilidade legal da unidade devem ser conferidas antes da entrega; autorização dos pais não substitui exigências legais. As condições da proteção básica precisam corresponder à cobertura efetivamente oferecida pela empresa.

Fotos de vistoria podem ficar no computador, com referências no registro. Fotos de catálogo precisam estar publicadas para os clientes visualizarem; o site não acessa automaticamente o disco da loja. Backup, contingência e homologação real do WhatsApp continuam sendo etapas da implantação.
