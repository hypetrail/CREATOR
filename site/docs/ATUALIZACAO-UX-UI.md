# Atualização de navegação e apresentação — 17/11/2026

A página de locação e o painel passaram a compartilhar cores, componentes de marca e padrões de navegação. A atualização melhora oito pontos:

1. **Primeira tela:** foto do modelo, tarifas e acesso à escolha de datas aparecem juntos, inclusive no celular.
2. **Preços:** a T1 apresenta R$ 60 para uma diária e R$ 45/dia para duas ou mais. Após consultar as datas, o cartão mostra o total do período. O cálculo usa as regras existentes; a confirmação continua dependendo da cotação do servidor.
3. **Reserva no celular:** resumo compacto, contato mais próximo do início e condições completas em áreas expansíveis. As autorizações de contato e aceite das condições continuam separadas. Pagamento presencial e liberação posterior da moto ficam explícitos.
4. **Escolha de datas:** o botão do cartão leva ao formulário e posiciona o foco no campo de retirada.
5. **Catálogo:** o único modelo ocupa a largura disponível, sem busca nem comparação desnecessárias. Esses recursos continuam disponíveis quando houver mais modelos.
6. **Administração no celular:** unidades em cartões com situação e botão de edição; seletor de seção e menu de conta compactos.
7. **Operação:** cartões de retiradas de hoje, devoluções de hoje, atrasadas e em preparação abrem as reservas correspondentes. A data usa Brasília e o relógio do servidor. O filtro visual preserva os dados completos usados para verificar disponibilidade. O alerta de atraso não calcula nem altera multas.
8. **Identidade visual:** verde escuro, verde e laranja, tipografia consistente, botões com área de toque maior, foco visível e ícones uniformes.

## Verificação

- 198 testes automatizados passaram, incluindo 12 novos testes de preços exibidos e filtros operacionais.
- TypeScript, compilação de produção para Cloudflare e simulação de publicação (`--dry-run`) passaram.
- ESLint dos arquivos TypeScript alterados: nenhum erro; cinco avisos de uso de imagens HTML, sem serviço de otimização adicional.
- 32 verificações no navegador passaram contra o Worker compilado, com banco local isolado e dados fictícios: tarifas de um e dois dias, caso de mínimo de um dia com tarifa especial, consulta, reserva, confirmação, preparação, filtros, edição mobile, imagens e largura das páginas.
- A 390 px de largura, o campo de contato aparece a aproximadamente 748 px do início da etapa de confirmação, ante 1.480 px na versão anterior.
- Não foram enviados WhatsApps reais. Sem provedor configurado, a confirmação informa que o envio automático está indisponível.

## Logo e publicação

Em 18/11/2026, a logo original recebida no arquivo `CODEX PROJETO.zip` foi aplicada em `public/brand/calori-go.png`, preservando o PNG e sua transparência. O componente `components/brand-logo.tsx` exibe a arte completa no cabeçalho, rodapé e painel administrativo, com tamanho responsivo e sem o texto “Go” provisório.

O envio à branch `main` aciona a integração existente de compilação e implantação do Cloudflare. A conclusão pública deve ser conferida em **Workers e Pages → creator → Implantações**. Esta mudança não altera o esquema do banco, as regras contratuais, as credenciais nem a configuração do WhatsApp.
