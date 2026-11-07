# Publicar no Cloudflare pelo painel e GitHub

Use o roteiro consolidado [Nova instalação da CaloriMob no Cloudflare](COLOCAR-NO-AR-DO-ZERO.md), atualizado para o reinício solicitado pelo proprietário.

| Campo | Valor atual |
| --- | --- |
| Repositório | `hypetrail/CREATOR` |
| Branch | `main` |
| Worker | `calori-go` |
| Caminho | `/` (raiz do repositório) |
| Build | `npm run build:cloudflare` |
| Implantação | `npm run deploy:cloudflare` |
| Node | 24, pelo arquivo `.node-version` |
| D1 | `calori-go-db` |
| Database ID novo | `72584dd8-cc93-41f6-8495-b396a45a4d83` |

Node e banco estão no código; não são necessárias variáveis de build na instalação nova. As chaves do administrador e da Meta são segredos de execução.

Use **Criar novo token** na criação do Worker e acrescente **Conta → D1 → Editar** pelo perfil, conforme o guia completo.
