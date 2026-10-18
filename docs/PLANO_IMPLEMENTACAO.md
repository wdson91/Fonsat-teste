# Plano de Implementação — Exercício Técnico: Assiduidade e Faturação

Este plano descreve a implementação mínima, auditável e focada nas regras financeiras e de isolamento exigidas em [enunciado.pdf](./enunciado.pdf), utilizando **NestJS + Next.js + Prisma + PostgreSQL**.

---

## 1. Decisões Tomadas no `/grill-me` e Regras de Consolidação

1. **Modelo Consolidado de `WorkRecord` e Validação de Turnos Completos**:
   - Mantemos `WorkRecord` como registo consolidado por trabalhador, dia (`workDate`), obra (`siteId`) e ofício (`tradeId`), sem tabela separada `Shift`.
   - No telemóvel do trabalhador, a grelha mantém marcações incompletas localmente (`localStorage`) e **envia somente turnos completos (com entrada `in` e saída `out`)**, que também são validados pelo backend.
   - Os minutos dos turnos são somados e **arredondados antes de salvar no banco** (`totalMinutes: Int` obrigatório).
   - A deduplicação de eventos (`AttendanceEventDedup`) garante idempotência em reenvios do telemóvel.

2. **Estados do `WorkRecord` (`ACTIVE`, `PENDING_RATE`, `PENDING_CORRECTION`, `SUPERSEDED`)**:
   - `ACTIVE`: Registo atual completo e precificado (`clientRateId`, `hourlyRateSnapshot` e `totalAmount` calculados pela vigência da data em que o trabalho ocorreu `occurredAt`).
   - `PENDING_RATE`: Registo atual completo (`totalMinutes` preenchido), mas sem tarifa vigente cadastrada na `workDate` para aquele `(clientId, tradeId)`. O trabalhador não é bloqueado; o registo vai para resolução do Encarregado/Administrativo e não entra na fatura enquanto pendente.
   - `SUPERSEDED`: Registo anterior que foi substituído por uma correção/resolução antes da emissão da fatura.
   - `PENDING_CORRECTION`: turno completo com divergência de obra/ofício ou sem alocação compatível; minutos/eventos preservados e valores nulos até correção com motivo.

3. **Histórico de Correções e Imutabilidade no PostgreSQL (Triggers e Functions)**:
   - **Antes da emissão da fatura**: Uma correção cria uma **nova versão de `WorkRecord`** ligada à anterior por `replacesRecordId` (`@unique`, impedindo duas substituições diretas do mesmo registo), guardando `correctionReason` e `createdById`, e **marca a versão anterior como `SUPERSEDED` na mesma transação (`prisma.$transaction`)**.
   - **Proteção por Trigger no Banco (`enforce_work_record_immutability`)**:
     - Proíbe `DELETE` sempre.
     - No `UPDATE`, permite **somente** a transição de uma versão atual para `SUPERSEDED` (desde que não esteja faturada em fatura `ISSUED`), mantendo todos os demais campos, inclusive id, horários, minutos, tarifas, valores e autor imutáveis.
   - **Depois da emissão da fatura (`ISSUED`)**: Preserva o registo faturado e a fatura original intactos; cria um novo `WorkRecord` ligado por `correctsInvoicedRecordId` e gera na tabela `Invoice` (`parentInvoiceId`) uma **Nota de Crédito (`CREDIT_NOTE`)** ou **Nota de Débito (`DEBIT_NOTE`)** pela diferença.

4. **Vigência de Preços (`ClientRate`) e `DECIMAL(10, 2)`**:
   - Valores monetários usam `DECIMAL(10, 2)`.
   - Ao cadastrar nova tarifa para `(clientId, tradeId)` com `validFrom`, encerra automaticamente a tarifa anterior aberta (`validTo = validFrom - 1ms`).
   - Vigências não podem se sobrepor nem alterar retroativamente o preço de horas já trabalhadas e precificadas.
   - Primeira tarifa pode ser histórica; demais inícios somente de amanhã em Lisboa em diante, após a última vigência programada.

5. **Multi-Tenancy com Row-Level Security (RLS) no PostgreSQL**:
   - Todas as tabelas possuem `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` com políticas (`CREATE POLICY`) usando a function `current_tenant_id()` (`current_setting('app.current_company_id')`) e a role `app_tenant_user` (`NOBYPASSRLS`), executadas via `PrismaService.withTenant(companyId, ...)`.
   - O futuro *Persona Switcher* envia `x-user-id`; um único AccessGuard resolve identidade simulada e papéis. Não é autenticação real.

6. **Escopo Mínimo de Frontend (4 Vistas + Dados Base via Seed) e Docker Compose**:
   - Dados base populados via `prisma db seed` para 2 empresas.
   - 4 vistas no Next.js: (1) Ponto Mobile do Trabalhador, (2) Obras, Alocações e Correção de Horas, (3) Preços e Faturação Mensal, (4) Detalhe e Explicação da Fatura.
   - `docker-compose.yml` apenas com PostgreSQL durante o desenvolvimento via `npm`, e completo (`postgres` + `backend` + `frontend`) na Fase 5.

---

## 2. Fases de Execução

1. **Fase 1 (Concluída)**: PostgreSQL no `docker-compose.yml`, setup do `backend/` (NestJS + Prisma), `schema.prisma`, migration inicial com Triggers de Imutabilidade + RLS e `seed.ts` com 2 empresas completas.
2. **Fase 2 (implementada em branches encadeadas 2.1–2.6)**: serviços/controllers simples de personas, alocações, tarifas, apontamentos, correções e faturação; guard único, sem paginação. Contratos e limites nos relatórios em `docs/relatorio-fase-2.*.md`. Prévia sem escrita, token contra obsolescência, atrasados sem limite inferior, pendências separadas e ajustes por diferença líquida já emitida.
3. **Fase 3**: revisão/ampliação dos testes; os testes significativos de regras, segurança, concorrência e regressão já acompanham cada subfase 2 em bancos descartáveis. Não se adia a validação financeira para o fim.
4. **Fase 4**: Frontend Next.js com Persona Switcher e as 4 vistas mínimas.
5. **Fase 5**: Docker Compose final completo (`postgres` + `backend` + `frontend`) e revisão final de `README.md` e `DECISOES.md`.
