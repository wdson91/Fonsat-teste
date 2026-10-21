# Fluxo das fases

A `main` contém inicialmente somente README e documentação. Não há backend executável nessa base. A implementação entra por PRs em ordem de dependência.

1. `fase-1/base-banco`: estrutura inicial do backend, schema Prisma, migration com RLS/triggers, seed e configuração local do PostgreSQL.
2. `fase-2.1/contexto-autorizacao`: parte da fase 1 e acrescenta contexto de persona e autorização.
3. `fase-2.2/obras-alocacoes`: parte da fase 2.1 e acrescenta consultas operacionais e alocações.
4. `fase-2.3/tarifas`: tarifas históricas por cliente/ofício.
5. `fase-2.4/registros-horas`: apontamentos completos, deduplicação e pendências.
6. `fase-2.5/correcoes`: versões e retificações financeiras.
7. `fase-2.6/faturacao`: prévia, emissão atômica, atrasados e explicação de valores.

O PR de uma fase para `main` deve aguardar a integração da anterior para não misturar diffs. A existência de uma branch não significa que essa implementação já entrou na `main`.

Cada branch de implementação contém em `docs/relatorio-fase-<fase>.md` o que foi feito, contratos, verificações e limites da fase, além dos relatórios herdados. A base documental não apresenta fases como concluídas.

A organização inicial foi feita localmente, sem push ou PR. Login real, frontend e funções posteriores só devem ser considerados prontos quando constarem no relatório da fase correspondente.

## Frontend e próximas etapas

Depois de 2.6, executar 4 antes de 3 e 5, sem renumerar: `fase-4.1/base-frontend` -> `fase-4.2/grelha-trabalhador` -> `fase-4.3/gestao-obras` -> `fase-4.4/faturacao` -> `fase-4.5/integracao`. A fase 3 será revisão/ampliação de testes e a fase 5 integração de infraestrutura; nenhuma delas está concluída por antecipação.

Futuros PRs para main seguem essa dependência, aguardando a integração da branch anterior. Não foram criados PRs nem publicados commits por este fluxo local.

As branches 4.1–4.5 possuem implementação e relatórios locais. A integração visual/funcional está documentada em [relatorio-fase-4.5.md](relatorio-fase-4.5.md); isso não significa merge em main nem conclusão das fases 3 e 5.


Depois da 4.5, os PRs de testes seguem `fase-3.1/base-testes` → `fase-3.2/isolamento-integridade` → `fase-3.3/regras-financeiras` → `fase-3.4/fluxos-integrados`. A próxima parte da anterior. O ambiente Docker de testes não antecipa a fase 5 de produção. A extensão experimental de ajustes entre clientes não entra nesta cadeia.

## Entrega local da fase 5

A branch `fase-5/execucao-docker` parte de main `c3a1a01`, já com fases 4 e 3 integradas. Implementa Compose local completo e pode ser integrada **antes de ajustes**, sem depender das correções de UI, seed ou documentos dessa branch. Relatório: [fase 5](relatorio-fase-5.md). As referências anteriores a etapas futuras registam a sequência histórica; deploy de produção não faz parte desta entrega. Não foi executado merge, push ou PR nesta fase.
