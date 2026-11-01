# Operação, cadastro e documentos da Calori Go

> Atualização vigente: consulte [Fluxo do site e WhatsApp](FLUXO-SITE-WHATSAPP.md). A T1 não tem escolha pública de cor, o e-mail é opcional, o cadastro continua completo e o atraso desconta duas horas antes da cobrança por hora iniciada. Referências anteriores divergentes abaixo são históricas.

Esta entrega contém o código e a validação local da nova estrutura. A publicação e a conexão real aos serviços de comunicação são etapas distintas; nenhum envio real ou deploy deve ser presumido.

## O que o cliente pode fazer

- Consultar datas, modelos e cores com disponibilidade calculada sobre as unidades físicas.
- Reservar e receber um número, com pagamento exclusivamente na loja.
- Criar conta com telefone e senha, consultar **Minhas reservas** e suas vias privadas.
- Preencher a identificação completa após conferir o orçamento. Quando autenticado, recuperar o cadastro sem repetir campos já preenchidos.
- Acompanhar o tempo restante depois que a loja registrar a retirada. Antes disso, o contador informa que a locação ainda não começou.
- Escolher separadamente avisos operacionais e ofertas pelo WhatsApp, com possibilidade de revogar as preferências.
- Baixar o documento da reserva e o guia de cuidados. O resultado do envio por e-mail aparece separadamente.

A conta exige senha de pelo menos 12 caracteres; o servidor guarda hash com salt, não a senha. A confirmação da posse do telefone e a recuperação de senha usam código por WhatsApp quando o provedor estiver conectado. Cadastrar um número não significa que ele já foi verificado.

## Regras atuais da T1

| Item | Regra preparada no projeto |
| --- | --- |
| Frota | Cinco unidades, uma de cada cor cadastrada; adicionar cor não cria uma moto física. |
| Peso | Soma de condutor, eventual passageiro e carga **abaixo de 120 kg**, evitando aproximar-se do limite. O manual original continua preservado e informa 150 kg; 120 kg é o limite operacional mais restritivo definido pela empresa. |
| Passageiro | Somente após conferir documentação, configuração, carga e uso permitido da unidade. Banco traseiro não comprova autorização de lotação. |
| Idade | A política comercial recebe solicitações a partir de 16 anos; para 16–17, pais presentes e assinando. Isso não dispensa habilitação ou outros requisitos legais. O enquadramento exato da T1 precisa ser confirmado antes da liberação. |
| Trajeto | Restrição comercial a vias movimentadas, estradas vicinais e rodovias; o percurso também precisa ser permitido para o enquadramento do veículo. |
| Duas diárias ou mais | R$ 45/dia: R$ 30 de aluguel + R$ 15 de proteção básica incluída. |
| Uma diária | R$ 60 por 24 horas: R$ 45 de aluguel + R$ 15 de proteção. |
| Proteção básica | Danos básicos da moto, como pneu furado, seta ou carenagem danificada. A própria moto mantém essa proteção em colisão com terceiros, conforme as condições; danos a terceiros e quebra do chassi ficam excluídos. |
| Preparação | Três horas entre locações para vistoria, limpeza e avaliação da recarga; esse tempo não garante uma carga completa. |

O manual informa 1.000 W e até 50 km/h. A idade comercial proposta e a assinatura dos pais não autorizam automaticamente condução por menor. Identificação da empresa, enquadramento legal, seguradora ou natureza da proteção, franquias, limites, cancelamento e ausência precisam de revisão e definição antes do contrato definitivo. O painel mantém o documento como rascunho enquanto as condições não forem publicadas como aprovadas.

## Rotina do administrador

Há um administrador com acesso completo, autenticado pela hospedagem confiável. Contas de clientes não recebem acesso administrativo. O login local de demonstração não é autenticação de produção.

1. Conferir a reserva e iniciar a preparação.
2. Conferir moto, equipamentos, elegibilidade e documentação. Informar o horário de retirada e liberar a unidade.
3. Fazer a vistoria de saída, conferir os sete itens e registrar ao menos uma foto.
4. Conferir pagamento presencial e assinatura. Confirmar a retirada após salvar a vistoria.
5. O servidor registra o início efetivo e calcula a devolução pela duração selecionada na reserva. Se o novo intervalo atingir outra reserva ou bloqueio, a entrega é recusada até a equipe resolver o conflito.
6. Na devolução, salvar a vistoria de retorno e confirmar o encerramento. O horário efetivo e a apuração de atraso ficam registrados.
7. Havendo avaria que exija manutenção, manter o bloqueio de segurança até reparar e registrar a resolução. Reservas futuras são preservadas para atendimento dos clientes afetados.

O painel permite reservas manuais de balcão/telefone, identificação protegida, consulta de documentos, registros de despesas, manutenção, ocorrências, autorizações e cadastro do rastreador. Pagamentos e despesas continuam conferidos pela equipe. A anotação de uma multa ou de um recebimento não executa cobrança bancária.

As fotos enviadas pela interface são otimizadas em JPEG e ficam fora da galeria pública. Conserve os originais se precisar deles. O relatório privado reúne checklist e fotos; o horário de envio não atesta a data original de captura. O envio manual ao WhatsApp exige anexar o relatório e tocar em Enviar. O envio automático exige configuração específica da conta Meta e do destino de arquivo da empresa.

## Atrasos para novas reservas

O cálculo usa o prazo efetivo de devolução, o horário de Brasília e a diária total preservada, sem acrescentar o seguro duas vezes.

| Devolução | Diária contratada de R$ 45 | Diária única de R$ 60 |
| --- | ---: | ---: |
| Até duas horas depois do prazo | Sem multa | Sem multa |
| Mais de duas horas, na mesma data | R$ 22,50 | R$ 30 |
| Mais de duas horas, na data seguinte | R$ 45 substitui a metade | R$ 60 substitui a metade |
| Dois ou mais dias posteriores | Conferência da equipe | Conferência da equipe |

A tolerância global de duas horas vale mesmo ao atravessar a meia-noite. A repetição de cobranças para vários dias não foi definida. Os valores são apurados para conferência e não significam pagamento recebido. Reservas anteriores mantêm as condições que aceitaram.

## Cadastro e documentos no próprio site

A empresa autorizou guardar a identificação e os documentos completos no site, substituindo a decisão anterior de depender de um sistema externo.

- Telefone de login, hash da senha, sessões e consentimentos pertencem à conta.
- Identificação completa usa criptografia autenticada AES-256-GCM no banco, com chave exclusiva do servidor.
- PDFs personalizados são criptografados em armazenamento privado; somente o administrador ou o cliente dono da reserva pode acessá-los.
- A identificação preservada para cada contrato não é reescrita quando o perfil recebe uma correção.
- Vistorias, ocorrências e documentos exigem acesso administrativo; as fotos de produto continuam públicas.
- Integração cadastral externa permanece opcional para sistemas compatíveis e registros anteriores.

A chave `CUSTOMER_DATA_KEY` e o armazenamento precisam estar configurados para guardar e abrir esses registros. A aplicação informa a falha se isso não estiver disponível, sem gravar a identificação completa em texto aberto como alternativa.

## Avisos por WhatsApp

A fila contempla preparação, moto pronta, lembrete de devolução, cuidados e disponibilidade. O aviso de preparação não apresenta a moto como pronta. O lembrete de devolução usa o prazo efetivo e, por padrão, é preparado duas horas antes. O lembrete de cuidados é programado após a retirada.

Avisos operacionais exigem telefone verificado e autorização operacional; ofertas exigem autorização comercial própria. O agendador pode preparar disponibilidade automaticamente quando as reservas públicas estiverem abertas e houver estoque compatível. O administrador pode desligar essa automação em **Avisos**. Há limite de um aviso de disponibilidade por contato a cada sete dias e nova conferência de estoque no despacho.

O Worker preparado processa a fila a cada cinco minutos depois da publicação/configuração da hospedagem. Outra hospedagem pode invocar o endpoint protegido por segredo. Aceitação pelo provedor não comprova entrega; tentativas com resultado incerto são bloqueadas para revisão, sem reenvio automático.

## O que ainda depende de decisões ou conexão real

| Pendência | Próximo passo |
| --- | --- |
| Publicação | Configurar autenticação confiável, D1, R2, fonte estática, segredos e migrações; homologar antes de abrir reservas. |
| Gmail | Autorizar a conta `calori.mobi2@gmail.com` por OAuth e testar os anexos com destinatário de teste autorizado. |
| WhatsApp | Conectar conta Business/API, versão, número remetente e templates aprovados. Configurar o número de destino permitido para relatórios da empresa. |
| Regras definitivas | Confirmar enquadramento da T1, condições completas da proteção, cadastro da empresa e cancelamento/ausência. |
| Planos e descontos | Definir preços e critérios. Não há desconto inventado ou plano ativo; o endpoint de ofertas permanece vazio. |
| Rastreamento | Instalar os equipamentos e definir fornecedor/API. O painel registra o cadastro e ocorrências; não mostra localização ao vivo presumida. |
| Backup e contingência | Etapa posterior solicitada pela empresa. Ainda não há backup automático ou plano de recuperação homologado. Preservar a chave de criptografia é necessário para qualquer recuperação futura. |

O guia de cuidados foi organizado a partir do manual T1 fornecido e das regras da empresa. Não é apresentado como pesquisa online atual, pois os sites externos não estavam acessíveis na sessão. Consulte também [Documentos e cadastro](DOCUMENTOS-E-CADASTRO.md) e [Desenvolvimento](DESENVOLVIMENTO-FROTA.md).
