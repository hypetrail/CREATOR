# Validação para publicação no Cloudflare

Versão sem conta de cliente, verificada localmente em 02/11/2026:

- **177 testes automatizados aprovados**, sem falhas ou testes ignorados.
- TypeScript aprovado. Lint dos módulos alterados sem erros; há avisos de imagens existentes. O lint global do repositório ainda aponta problemas anteriores em outros arquivos e não é apresentado como aprovado.
- Build de produção concluído e pacote validado com `npm run deploy:cloudflare -- --dry-run`: um vínculo D1 **DB**, arquivos **ASSETS**, administração por senha e agendamento de cinco minutos. Nenhuma migração remota ou publicação real executada.
- Alocação de moto e gravação do contato na mesma transação: falha do contato devolve o estoque; concorrência pela última unidade deixa um único vencedor; repetição da solicitação mantém uma reserva.
- Contato mínimo fora dos dados comerciais e do resumo público: WhatsApp normalizado, nome opcional e autorização operacional. Sem criação de conta, CPF, endereço, e-mail ou PDF privado novo.
- Retirada das rotas públicas de contas/cadastro completo com HTTP 410. Históricos cifrados e documentos anteriores preservados e acessíveis somente à administração autorizada.
- Fila WhatsApp testada com provedor simulado: recuperação de confirmação pendente, correção de telefone antes do envio, revogação, deduplicação e bloqueio de resultados incertos. Campanhas de contas antigas não são executadas pelo cron atual.

## Conferência no navegador do Worker compilado

Foi usado um D1 **local, isolado e fictício**, com as migrações até `0011_minimal_reservation_contacts.sql`. O Worker usou o mesmo pacote de produção, servido somente em loopback. O ID configurado não provocou conexão com o banco remoto.

Foram conferidos:

1. Primeiro acesso, senha administrativa, sessão segura, bloqueio de cabeçalhos administrativos forjados e logout.
2. Catálogo público T1 sem escolha de cor; formulário móvel apenas com WhatsApp, nome opcional e aceites, sem conta de cliente.
3. Reserva de 48 horas por R$ 90, código da reserva, quatro partes de resumo e aviso correto de WhatsApp ainda não configurado.
4. Estoque compartilhado: cinco unidades inicialmente, quatro após reserva pública e três após reserva manual no mesmo período.
5. Contato acessível apenas ao administrador; `/api/customer` desativada e `/minha-conta` redirecionando ao site.
6. Preparação e liberação real para retirada alimentando a fila; vistoria de saída com referências a fotos locais e relatório privado.
7. Retirada efetiva iniciando o prazo de 48 horas, contador no painel e devolução após vistoria de retorno.
8. Aba de avisos mostrando a pendência de conexão, sem afirmar envio ou entrega realizados.

Nenhum erro de JavaScript foi observado nesses fluxos. Nenhuma mensagem WhatsApp ou e-mail real foi enviada. O relatório e as capturas da sessão ficam fora do repositório, em `output/calori-cloudflare/sem-cadastro` do ambiente de trabalho.

## Limites desta validação

O D1 de produção está identificado no projeto como `calori-go-db`, ID `87762edb-d9b6-4dd7-bb72-9c3cc58329e4`. A configuração não comprova acesso à conta Cloudflare: publicação, migrações remotas, permissões, domínio e segredos ainda precisam ser conferidos na hospedagem.

O envio real exige número e token da Meta, versão da API e template utilitário aprovado. Aceitação pela API não comprova entrega. Cadastre os segredos no Worker, nunca no frontend ou GitHub. Preserve a chave original se houver cadastro histórico cifrado.

Siga [Publicar no Cloudflare pelo painel e GitHub](PUBLICAR-CLOUDFLARE-PELO-PAINEL.md) e [o fluxo atual sem cadastro](NOVO-FLUXO-SEM-CADASTRO.md). Não importe os bancos fictícios dos testes na operação real.
