# Plano da fase 3 — revisão e ampliação de testes

Base: main `42acffb`, depois das fases 1 → 2 → 4. A extensão experimental de ajustes entre clientes não faz parte desta fase nem da entrega. Não se altera aplicação/schema/migrations para tornar testes verdes. O guia de estudo e alterações locais do checkout original ficam fora deste trabalho.

## Decisões de execução

- Ambiente oficial exclusivamente Docker/Compose: PostgreSQL 16, Node 22.14.0, Playwright 1.62.1 e Chromium instalado pela versão do lockfile. Host só precisa de shell, Docker e Compose; internet no primeiro build.
- Um comando: `sh scripts/test.sh`. Cria projeto/rede/volume exclusivos por execução, sem portas do host, sem nomes fixos e sem docker.sock ou Docker CLI no runner. Evidências em `.test-results/<execução>/`; cleanup com down --volumes somente do projeto criado, inclusive em falha/interrupção tratável.
- Harness permite somente host DNS postgres, role fonsat_test_admin e banco de controlo fonsat_test_control, com sinalização explícita de teste. Cada suite/API QA cria banco próprio com prefixo fonsat_test e aplica o SQL versionado por psql no container, sem chamar Docker dentro do runner. Não usa o banco de demonstração.
- Reutilizar Jest/Supertest, testes nativos Node e Playwright. Revisar lacunas, sem meta artificial de cobertura ou repetição para aumentar contagem. PG real para RLS/triggers; interceções de rede apenas para falhas controladas.
- Defeitos de produção são documentados e reproduzidos em diagnósticos separados. Não alterar services/controllers/DTOs/UI/schema/migrations. Sem skip e sem inverter a expectativa para aprovar um defeito.
- O comando completo executa os grupos independentes e diagnósticos, agrega os resultados e retorna erro se algum falhar. Falha de infraestrutura é distinta de falha de verificação. Diagnóstico registado não significa aplicação aprovada.

## Etapas e branches

1. `fase-3.1/base-testes`: Docker, harness seguro, orquestração, baseline executado e matriz de regras/lacunas. [Relatório 3.1](relatorio-fase-3.1.md).
2. `fase-3.2/isolamento-integridade`: permissões/RLS, constraints e triggers que ainda não tenham verificação significativa. [Relatório 3.2](relatorio-fase-3.2.md).
3. `fase-3.3/regras-financeiras`: lacunas de fronteiras, concorrência, idempotência e snapshots; preservar os testes financeiros existentes. [Relatório 3.3](relatorio-fase-3.3.md).
4. `fase-3.4/fluxos-integrados`: fluxos essenciais do browser, diagnósticos e comando completo final.

Cada etapa nasce da anterior, possui commit e relatório próprios. PRs futuros seguem esta ordem, depois da integração da fase 4.5; a fase 5 de infraestrutura de produção continua pendente.

## Matriz de revisão inicial

| Regra | Cobertura existente | Lacuna a verificar |
| --- | --- | --- |
| Bootstrap, quatro papéis, whitelist e recursos | backend/src/api.spec.ts | Complementar somente projeções/escopos não cobertos |
| Company A/B em paralelo e pool connection_limit=1 | api.spec.ts | Role restrita sem contexto e todas as tabelas/relações |
| RLS escrita cruzada | api.spec.ts: Trade | UPDATE company e linhas InvoiceLine/vínculos |
| Imutabilidade de WorkRecord/PK e rollback de dedup | attendance.spec.ts | Matriz de estados/DELETE e registo já faturado |
| Invoice/ClientRate imutáveis | Regras exercidas pelos fluxos | Testes diretos das transições efetivas, incluindo campos extra |
| Unicidade e FKs RESTRICT | Casos indiretos | Verificar pares reais e direção das referências, sem prometer garantias inexistentes |
| Alocações: fronteiras, transfer/end e concorrência | operations.spec.ts | Fronteira de DST em período real e invariantes completas |
| Tarifas: histórico, D+1, overlap, fecho -1ms | rates.spec.ts | Relógio de fronteira controlado e preço histórico após alterações |
| Eventos: pares, divergências, replay e rollback | attendance.spec.ts | Replay simultâneo com contagens/invariantes, sem sleeps |
| Correções: versões, DRAFT, delta zero e concorrência | corrections.spec.ts | Acrescentar apenas caminhos de rollback ou snapshots ausentes |
| Faturação: 80→70→crédito10→débito5=65, atrasados, token, centavos | invoices.spec.ts | Snapshots completos e cenários não cobertos pela cadeia atual |
| Datas, dinheiro, storage, famílias e distribuição | frontend/src/lib/*.test.ts | Rever asserts e preservar regras do fluxo original |
| Browser: quatro papéis/offline/storage/persona | frontend/qa/smoke.mjs | Ambiente Docker/DNS, falhas reais da UI como diagnósticos |
| Distribuição semanal | frontend/qa/distribution.mjs | Fixtures independentes; copiar sem sobrescrever e 409 conserva formulário |

Resultados e alterações na matriz serão registados nos relatórios de cada subfase e em defeitos-fase-3.md.
