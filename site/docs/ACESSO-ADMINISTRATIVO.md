# Acesso administrativo no Cloudflare

O primeiro acesso exige a chave provisória `ADMIN_SETUP_KEY` e uma senha de 12 a 128 caracteres. A chave deve permanecer nos segredos de execução até o administrador ser criado com sucesso; depois, remova-a. A senha administrativa é diferente dessa chave e nunca deve ser incluída no GitHub ou em variáveis de build.

## Correção da mensagem de senha inválida

Uma falha na função criptográfica era convertida em erro de preenchimento, mesmo para senhas válidas. Agora, somente a validação de uma senha fraca gera esse erro. Falhas técnicas ao criar, recuperar ou verificar a senha retornam HTTP 503, sem expor a senha, a chave provisória ou detalhes internos.

Novas credenciais usam PBKDF2-SHA256 com 100.000 iterações, salt aleatório de 32 bytes e resultado de 32 bytes, dentro do limite de execução considerado para Workers hospedados. O custo é menor que as 600.000 iterações anteriores; use uma senha longa e aleatória. O limite de tentativas protege o acesso online, mas não substitui a proteção do banco contra acesso indevido.

O formato registra o número de iterações. A verificação preserva esse parâmetro para hashes antigos de 600.000 iterações quando o ambiente permite calculá-los. Não há reinterpretação, migração de credenciais em massa ou alteração das reservas. Se um acesso antigo encontrar o limite da hospedagem, use `/admin/recuperar` com uma nova chave provisória: a recuperação gera o hash compatível e revoga as sessões anteriores. Uma falha durante essa operação preserva as credenciais e sessões existentes.

Os testes simulam o limite da função criptográfica para verificar criação, login e recuperação; também verificam erros técnicos, senhas inválidas, hashes antigos e formatos não reconhecidos. Isso reproduz a falha sem utilizar senhas ou dados reais. O resultado em produção deve ser conferido após a implantação.

## Aplicar no Worker já publicado

1. Aguarde a implantação do commit corrigido da branch `main` em **Computação → Workers e Pages → seu Worker → Implantações**.
2. Com a implantação concluída, abra `/admin/primeiro-acesso` para criar o administrador. Se ele já existir, entre em `/admin/entrar`.
3. Informe os dados diretamente no site. Se concluir o cadastro, abra o painel e remova `ADMIN_SETUP_KEY` dos segredos de execução do Worker.

Esta correção usa o banco e o Worker existentes, sem novas variáveis ou migrações de banco. Não execute novamente as etapas de exclusão do roteiro inicial.
