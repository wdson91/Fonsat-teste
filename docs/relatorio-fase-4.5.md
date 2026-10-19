# Relatório da fase 4.5 — integração visual e funcional

Frontend concluído em branches encadeadas 4.1–4.5, sobre `fase-2.6/faturacao`. Esta fase valida os quatro papéis contra os endpoints reais, corrige persistência/concorrência de persona, acessibilidade dos selects, navegação semanal e apresentação de erros. O detalhe usa “Valores da emissão”. Não foram criados mocks de negócio, cálculos financeiros no navegador, push, PR ou merge.

## Verificação executada

- Build de produção Next.js e TypeScript concluídos em checkout isolado do código versionado.
- 8 testes unitários do frontend: datas de Lisboa/DST, valores monetários exatos, correções, seleção das famílias atuais, persistência e erros.
- 45 testes do backend em 6 suites, bancos descartáveis, todos aprovados (`--runInBand --testTimeout=30000`). Uma execução concorrente anterior atingiu o timeout de limpeza de 5 segundos; a repetição com 30 segundos terminou sem falhas.
- 12 cenários Playwright contra API real, Chromium 156.0.8078.4, desktop 1440×1000 e móvel 390×844, sem erros JavaScript. O navegador usa America/Los_Angeles para verificar independência das datas de Lisboa.
- Prova adicional do cliente em Asia/Tokyo: líquido €65, sem identidade do trabalhador, controlos administrativos ou transbordamento horizontal móvel.

Cenários: rascunho incompleto/reload/envio; correção do encarregado sem preços; prévia com pendências separadas e conflito 409; €80 → correção €70 → crédito €10 → débito €5 = €65; tarifa histórica e trabalho atrasado na competência seguinte; atribuição administrativa do responsável e escopo do encarregado; criação/transferência/encerramento com fim exclusivo; offline/reload/reenvio com UUID estável; resposta perdida após commit e replay sem duplicação; armazenamento corrompido preservado e separação por empresa; resposta tardia da persona anterior descartada; quota de armazenamento impede POST sem persistência prévia.

Capturas locais ignoradas pelo Git, em `frontend/.qa/`: `desktop-worker.png`, `mobile-worker.png`, `desktop-sites.png`, `desktop-billing.png`, `desktop-invoice.png`, `desktop-client.png` e `mobile-client.png`. Foram revistas visualmente as vistas trabalhador móvel, gestão e faturação desktop e detalhe da fatura; o cliente desktop também recebeu revisão independente. Resultados em `results.json`, `client-check.json`, `backend-tests.log` e `build.log`. As capturas precedem apenas a troca de texto do selo.

## Reprodução local

Requer Node >=22.14, PostgreSQL e variáveis do backend conforme README. Usar checkout sem alterações externas e dependências instaladas. O harness cria banco descartável e fixtures próprias, sem reset do seed de demonstração.

```sh
cd backend
QA_FIXTURES_PATH=../frontend/.qa/fixtures.json node -r ts-node/register test/frontend-preview.ts
```

Em outro terminal:

```sh
cd frontend
NEXT_PUBLIC_API_URL=http://localhost:3101 npm run dev -- --port 3100
```

E em outro terminal de `frontend`:

```sh
npx playwright install chromium
npm run smoke
```

Nesta execução foi reutilizado Chromium já instalado, passando `PLAYWRIGHT_CHROMIUM_PATH`; não foi necessário descarregar navegador. `QA_FRONTEND_URL` e `QA_FIXTURES_PATH` permitem mudar os caminhos. O smoke altera suas fixtures: reiniciar o harness antes de repetir. Ctrl+C encerra o harness e elimina seu banco. Os serviços de QA 3100/3101 são próprios; os serviços existentes 3000/3001 não são encerrados.

## Preservação e limites

A validação foi realizada em checkout temporário do backend versionado e das alterações desta fase. Foram preservadas fora dos commits alterações paralelas em `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`, `backend/src/operations/operations.dto.ts`, `backend/src/operations/operations.spec.ts`, `backend/tsconfig.json`, `frontend/src/app/management.css`, `frontend/src/lib/corrections.ts` e a grelha semanal/data-only de `frontend/src/components/sites-page.tsx`. Este último contém também pequenos ajustes desta fase, comitados pela cópia isolada para não incorporar a grelha externa. `docs/fase2-plan.md` continua não rastreado; `frontend/next-env.d.ts` pode refletir o servidor Next local em execução. Não se declara validada a combinação com essas alterações paralelas.

Offline funciona depois de carregar a aplicação; não há PWA/cache para arranque sem rede. Limpar dados do navegador perde rascunhos locais. A persona por `x-user-id` é demonstração, sem autenticação real. Não há PDF/email/pagamentos. A fase 3 de revisão ampliada e a fase 5 de infraestrutura continuam pendentes. Main e branches anteriores permanecem inalteradas.
