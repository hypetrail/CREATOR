# CaloriMob — site e administração de locações

**Nova instalação: branch `main`, raiz do repositório (`/`).** Os comandos da raiz instalam e compilam a aplicação de `site` automaticamente.

- [Começar novamente no Cloudflare](site/docs/COLOCAR-NO-AR-DO-ZERO.md)
- [Revisão do projeto e resultados dos testes](site/docs/REVISAO-PARA-NOVA-PUBLICACAO.md)
- [Fluxo atual sem conta de cliente](site/docs/NOVO-FLUXO-SEM-CADASTRO.md)
- [Como gerenciar frota e reservas](site/docs/COMO-GERENCIAR-A-FROTA.md)

| Campo | Valor |
| --- | --- |
| Repositório | `hypetrail/CREATOR` |
| Branch | `main` |
| Nome do Worker | `calori-go` |
| Caminho | `/` (raiz padrão) |
| Comando da build | `npm run build:cloudflare` |
| Comando de implantação | `npm run deploy:cloudflare` |

Node 24 é escolhido por `.node-version`. O novo D1 `calori-go-db`, ID `72584dd8-cc93-41f6-8495-b396a45a4d83`, está configurado no código. A instalação nova não precisa de variáveis de build para Node ou banco.

O cliente reserva com WhatsApp e nome opcional, sem conta. O administrador controla frota, preços, disponibilidade e operação. O envio real de mensagens depende da API oficial da Meta; publicar o site não ativa essa conexão automaticamente.

## Organização

- `site/`: aplicação completa, servidor, migrações, arquivos públicos e testes.
- `prototipos/`: demonstração HTML local, separada da aplicação publicada.
- `site/docs/`: instruções atuais e registros históricos identificados.

A branch de entrega anterior permanece preservada. Use `main` para esta nova instalação.

## Verificações locais

```sh
npm run build:cloudflare
npm test
npm run check:types
npm run deploy:cloudflare -- --dry-run
```

O build instala as dependências de `site` usando seu lockfile. O último comando valida o pacote sem migrar o banco remoto ou publicar. A publicação real aplica as migrações e exige um token Cloudflare com acesso ao Worker e ao D1.
