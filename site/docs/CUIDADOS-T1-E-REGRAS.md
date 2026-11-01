# Cuidados com a T1 e regras de locação

> Atualização vigente: consulte [Fluxo do site e WhatsApp](FLUXO-SITE-WHATSAPP.md). A T1 não tem escolha pública de cor, o e-mail é opcional, o cadastro continua completo e o atraso desconta duas horas antes da cobrança por hora iniciada. Referências anteriores divergentes abaixo são históricas.

A versão inicial do guia é `cuidados-t1-2026-10-29`. Ela foi preparada com o PDF original de três páginas fornecido pela empresa e as regras operacionais informadas em 29/10/2026. O acesso externo está limitado pela configuração de rede; não houve consulta verificada à internet.

## Fontes e diferenças de origem

| Origem | Orientações utilizadas |
| --- | --- |
| Manual T1, página 1 | Especificações, autonomia estimada, prazo de recarga, carga máxima original e carregador do conjunto |
| Manual T1, página 2 | Conferência antes do uso, sequência de conexão e desconexão do carregador, indicador verde, bateria e temperatura ideal de funcionamento |
| Manual T1, página 3 | Capacete, carregador aprovado, proteção contra calor e água, manutenção, componentes danificados e avaliação técnica de falhas |
| Regras da CaloriMob | Peso total abaixo de 120 kg, vias restritas, pais e assinatura no atendimento de 16/17 anos, vistorias, três horas de preparação e devolução no prazo registrado |

O guia não autoriza condução por menor de idade, não confirma dispensa de habilitação e não confirma transporte de passageiro. A liberação exige elegibilidade e documentação da unidade. O limite de 120 kg é uma restrição de operação da locadora mais conservadora que os 150 kg do manual original; o documento original não foi alterado.

## Documento para o cliente

`lib/care-guide.ts` contém o conteúdo versionado. `lib/care-pdf.ts` exporta `createCareGuidePdf(fontBytes, guide?)`, que produz um PDF real com fonte Unicode, paginação e indicação de fontes. O guia reúne preparação, peso, trajeto, inspeção, recarga, água, bateria, ocorrência e devolução.

A reserva T1 preserva a cópia de `care_guide` no snapshot. O documento de locação identifica a versão preservada. Ao gerar um guia para uma reserva existente, usar seu snapshot; não substituir pelas orientações atuais sem identificar a mudança. Registros históricos sem guia não recebem condições novas silenciosamente. A integração de envio deve anexar o guia correspondente e só informar envio depois de aceitação pelo serviço, sem afirmar entrega na caixa de entrada.

## Revisão das condições

O modelo de cláusulas continua como rascunho. Permanecem pendentes a identificação cadastral completa da empresa, as condições finais de cancelamento e os dados contratuais da proteção, como fornecedor/natureza jurídica, franquias e limites. Salvar uma versão nova não altera contratos existentes.

A proteção básica de R$ 15 fornecida como regra comercial contempla os danos básicos previstos à moto alugada, inclusive quando outra pessoa ou veículo participa da colisão. Danos a terceiros e quebra do chassi permanecem excluídos; não se presumem seguradora, apólice, franquia, teto de indenização ou cobertura de outros danos. A análise de avarias deve considerar as vistorias e as condições aceitas; desgaste natural não se torna cobrança automaticamente.

A regra de atraso confirmada é: até duas horas, sem multa; mais de duas horas na mesma data prevista, metade da diária contratada; no dia seguinte, uma diária com seguro substitui a metade, sem acumular as duas. A tolerância de duas horas vale também ao atravessar a meia-noite. Dois ou mais dias posteriores ficam para conferência da empresa até que a repetição seja definida. As referências são R$ 22,50/R$ 45 na tarifa comum e R$ 30/R$ 60 na diária única. Não há cobrança ou débito automático por essa apuração.

## Validação

Os testes em `tests/pdf.test.mjs` geram PDFs reais e extraem o texto com Poppler. Cobrem limites e regras condicionais, Unicode, dados de identificação, separação entre horários previstos e efetivos, preservação de versões e ausência de cobrança histórica reescrita. A interpretação legal, a configuração física das unidades e o seguro real exigem confirmação documental da empresa.
