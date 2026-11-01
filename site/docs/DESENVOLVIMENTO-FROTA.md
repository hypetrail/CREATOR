# Desenvolvimento e operação técnica da Calori Go

> Para publicar pelo painel Cloudflare com o GitHub, siga [Publicação no Cloudflare](PUBLICAR-CLOUDFLARE-PELO-PAINEL.md). O build de produção usa autenticação administrativa própria; o login local do ChatGPT continua exclusivo do desenvolvimento.

> Atualização vigente: consulte [Fluxo do site e WhatsApp](FLUXO-SITE-WHATSAPP.md). A T1 não tem escolha pública de cor, o e-mail é opcional, o cadastro continua completo e o atraso desconta duas horas antes da cobrança por hora iniciada. Referências anteriores divergentes abaixo são históricas.

O aplicativo importado do ZIP está em `site/`. A entrega reúne código, migrações e testes locais; não equivale a publicação ou conexão aos serviços externos. Para a rotina da empresa, consulte [Operação e cadastro](ENTREGA-OPERACAO-E-CADASTRO.md).

## Preparação local

Requer Node >=22.13.0, dependências do lockfile e `pdftotext` do Poppler para os testes de texto dos PDFs.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev -- --host 127.0.0.1
```

Copie o exemplo somente ao preparar um checkout novo, preservando a configuração já existente. `.dev.vars` é ignorado pelo Git. O override `FLEET_OWNER_ID=local_seedy` é exclusivo do login local em loopback; não o publique em produção.

A rota `/signin-with-chatgpt?return_to=%2Fadmin` abre a administração de desenvolvimento. O proprietário inicializa a T1 e suas cinco unidades uma única vez. O catálogo público não assume a propriedade do banco. O cliente usa `/minha-conta` e nunca recebe acesso administrativo.

## Gerar segredos locais sem exibi-los

O trecho abaixo gera valores diferentes somente para campos ainda ausentes, sem imprimir os valores. Execute dentro de `site/` depois de criar `.dev.vars`.

```bash
node --input-type=module <<'NODE'
import {existsSync,readFileSync,appendFileSync,chmodSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const target='.dev.vars';
const existing=existsSync(target)?readFileSync(target,'utf8'):'';
for(const name of ['CUSTOMER_DATA_KEY','CUSTOMER_OTP_SECRET','NOTIFY_CRON_SECRET']){
  if(!new RegExp('^\\s*'+name+'\\s*=','m').test(existing)){
    appendFileSync(target,'\n'+name+'='+randomBytes(32).toString('hex')+'\n',{mode:0o600});
  }
}
chmodSync(target,0o600);
NODE
```

`CUSTOMER_DATA_KEY` tem 32 bytes, aceitos como 64 caracteres hexadecimais ou base64. Identificação completa e PDFs privados dependem dela. **Não substitua essa chave numa base já utilizada:** rotação/migração automática de chaves não está implementada e o valor novo não abre os registros anteriores. Preserve-a no gerenciador de segredos e no procedimento seguro de recuperação. Não envie segredos pelo chat nem os inclua no Git.

`CUSTOMER_OTP_SECRET` protege os códigos de confirmação/recuperação; `NOTIFY_CRON_SECRET` protege o agendador HTTP. Ambos precisam ter ao menos 32 caracteres. Gerar esses valores não conecta Gmail ou Meta.

## Banco e migrações

Aplique todas as migrações em ordem, sem recriar um banco existente. O helper `npm run db:local` é local e mantém o registro do que já foi aplicado.

| Migração | Conteúdo |
| --- | --- |
| `0002_fleet_units_and_snapshots.sql` e `0003_overdue_rented_units.sql` | Cores/unidades, condições preservadas e proteção de veículos alugados atrasados. |
| `0004_reservation_operations.sql` | Estados operacionais, origem e liberação de retirada. |
| `0005_reservation_documents.sql` | Versões imutáveis de condições e referências cadastrais opcionais. |
| `0006_document_delivery_tracking.sql` | Metadados e deduplicação de envio de documentos. |
| `0007_customer_operations.sql` | Contas/sessões, verificação/recuperação, cronômetro efetivo, vistorias, bloqueios de segurança, registros e fila WhatsApp. |
| `0008_private_customer_documents.sql` | Perfis criptografados, identificação imutável por reserva e documentos privados criptografados. |

As migrações antigas e os registros históricos permanecem preservados. A atualização operacional da T1 usa o limite definido pela empresa sem alterar o PDF original do fabricante. Em produção, reconciliar mudanças posteriores ao ZIP e aplicar as migrações pelo fluxo da hospedagem, com preservação dos dados.

## Configuração da hospedagem

São necessários os bindings `DB` (D1), `BUCKET` (R2) e `ASSETS` para a fonte Unicode do PDF. Fotos de catálogo e evidências privadas usam caminhos distintos; o bucket não deve ser exposto integralmente como site público. PDFs privados são criptografados e os endpoints verificam propriedade antes de recuperar os arquivos. Fotos de vistoria são privadas, com autorização administrativa, e não devem ser confundidas com criptografia de aplicação dos PDFs.

O proprietário é autenticado pela fronteira confiável da hospedagem. Outra plataforma precisa implementar autenticação real e remover headers de identidade fornecidos diretamente pelo cliente. Contas de clientes usam senha com hash PBKDF2-SHA256 de 600 mil iterações e salt, cookies HttpOnly/SameSite, Secure em HTTPS, limite de tentativas e recuperação com revogação de sessões.

A criação legada de reservas foi desativada para evitar um caminho paralelo que contorne as regras atuais. A API de estoque recebe apenas dados comerciais; a identificação autorizada segue pelo fluxo protegido. Não copie cadastro, senhas ou conteúdo dos documentos para logs de erro ou auditoria.

## Comunicação e agendamento

Configure segredos e variáveis conforme `.dev.vars.example` e [Documentos e cadastro](DOCUMENTOS-E-CADASTRO.md). A saída HTTPS necessária depende dos recursos utilizados:

- Gmail: `oauth2.googleapis.com` e `gmail.googleapis.com`.
- WhatsApp Business Cloud API: `graph.facebook.com`.
- Resend, somente se escolhido: `api.resend.com`.
- API cadastral externa: domínio específico configurado, quando a integração opcional for usada.

Na nuvem gerenciada, use a configuração suportada para permitir os destinos necessários, preservando proxy e confiança TLS. Não tente contornar bloqueios de rede. A presença de uma variável não comprova autorização do provedor.

O build do Worker prepara `scheduled()` e `triggers.crons=["*/5 * * * *"]`. Confirme que o artefato e a hospedagem preservam ambos. O agendamento nativo não precisa de bearer HTTP. Outra hospedagem pode chamar `POST /api/notifications` com `Authorization: Bearer <NOTIFY_CRON_SECRET>` por seu agendador; nunca coloque esse segredo em URL pública.

A fila revalida situação da reserva, telefone verificado e consentimento antes de enviar. Avisos de disponibilidade dependem de reservas públicas abertas, estoque, autorização comercial e limite de sete dias. O administrador pode desligar o preparo automático. O lembrete de devolução usa `due_ms` real; `RETURN_REMINDER_MINUTES` aceita 15 a 1.440 minutos e o padrão é 120. Nenhum provedor conectado ou entrega real é presumido pelos testes.

## Validação e isolamento

```bash
npm test
npx tsc --noEmit
npm run build
```

Os testes incluem tarifas, estoque e concorrência, intervalo de três horas, condições históricas, horários reais, vistorias, contas/sessões, recuperação concorrente, isolamento entre clientes, criptografia, PDFs, consentimentos e falhas dos provedores. Os serviços externos são simulados nos testes; não equivalem a homologação de entrega real. O lint global e `tests/structure.py` ainda contêm expectativas/componentes legados; use também a verificação dos arquivos alterados.

Para navegador, use uma base isolada, nunca o banco da operação:

```bash
CALORI_LOCAL_STATE_PATH=.sites-runtime/qa-state npm run db:local
CALORI_LOCAL_STATE_PATH=.sites-runtime/qa-state npm run dev -- --host 127.0.0.1 --port 5190
```

Mantenha um único servidor Vite por checkout para evitar cache concorrente. Encerre o servidor antes do build final. Se necessário, use `XDG_CONFIG_HOME` em diretório gravável; o helper de banco já prepara configuração local. `.sites-runtime`, `.wrangler`, arquivos de segredos e saídas de QA não fazem parte da entrega de código.

Backup e contingência ficaram para etapa posterior. Antes de usar dados reais, a operação precisa definir recuperação de D1/R2 **e da chave**, retenção, acessos e teste de restauração. Não há rotação automática de chaves, backup automático homologado ou feed de GPS presumido nesta entrega.
