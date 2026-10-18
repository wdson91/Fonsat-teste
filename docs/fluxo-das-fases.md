# Fluxo das fases

A `main` contém inicialmente somente README e documentação. Não há backend executável nessa base. A implementação entra por PRs em ordem de dependência.

1. `fase-1/base-banco`: estrutura inicial do backend, schema Prisma, migration com RLS/triggers, seed e configuração local do PostgreSQL.
2. `fase-2.1/contexto-autorizacao`: parte da fase 1 e acrescenta contexto de persona e autorização.
3. `fase-2.2/obras-alocacoes`: parte da fase 2.1 e acrescenta consultas operacionais e alocações.

O PR de uma fase para `main` deve aguardar a integração da anterior para não misturar diffs. A existência de uma branch não significa que essa implementação já entrou na `main`.

Cada branch de implementação contém em `docs/relatorio-fase-<fase>.md` o que foi feito, contratos, verificações e limites da fase, além dos relatórios herdados. A base documental não apresenta fases como concluídas.

A organização inicial foi feita localmente, sem push ou PR. Login real, frontend e funções posteriores só devem ser considerados prontos quando constarem no relatório da fase correspondente.
