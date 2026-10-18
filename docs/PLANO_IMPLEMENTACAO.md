# Plano de Implementação — Exercício Técnico: Assiduidade e Faturação

Este plano descreve a implementação mínima, auditável e focada nas regras financeiras e de isolamento exigidas em [enunciado.pdf](./enunciado.pdf), utilizando **NestJS + Next.js + Prisma + PostgreSQL**.

---

## 1. Decisões Tomadas no `/grill-me` e Regras de Consolidação

1. **Modelo Consolidado de `WorkRecord` e Validação de Turnos Completos**:
   - Mantemos `WorkRecord` como registo consolidado por trabalhador, dia (`workDate`), obra (`siteId`) e ofício (`tradeId`), sem tabela separada `Shift`.
   - No telemóvel do trabalhador, a grelha mantém marcações incompletas localmente (`localStorage`) e **envia somente turnos completos (com entrada `in` e saída `out`)**, que também são validados pelo backend.
   - Os minutos dos turnos são somados e **arredondados antes de salvar no banco** (`totalMinutes: Int` obrigatório).
   - A deduplicação de eventos (`AttendanceEventDedup`) garante idempotência em reenvios do telemóvel.

2. **Estados do `WorkRecord` (`ACTIVE`, `PENDING_RATE`, `SUPERSEDED`)**:
   - `ACTIVE`: Registo atual completo e precificado (`clientRateId`, `hourlyRateSnapshot` e `totalAmount` calculados pela vigência da data em que o trabalho ocorreu `occurredAt`).
   - `PENDING_RATE`: Registo atual completo (`totalMinutes` preenchido), mas sem tarifa vigente cadastrada na `workDate` para aquele `(clientId, tradeId)`. O trabalhador não é bloqueado; o registo vai para resolução do Encarregado/Administrativo e não entra na fatura enquanto pendente.
   - `SUPERSEDED`: Registo anterior que foi substituído por uma correção/resolução antes da emissão da fatura.

3. **Histórico de Correções e Imutabilidade no PostgreSQL (Triggers e Functions)**:
   - **Antes da emissão da fatura**: Uma correção cria uma **nova versão de `WorkRecord`** ligada à anterior por `replacesRecordId` (`@unique`, impedindo duas substituições diretas do mesmo registo), guardando `correctionReason` e `createdById`, e **marca a versão anterior como `SUPERSEDED` na mesma transação (`prisma.$transaction`)**.
   - **Proteção por Trigger no Banco (`enforce_work_record_immutability`)**:
     - Proíbe `DELETE` sempre.
     - No `UPDATE`, permite **somente** a transição válida de `ACTIVE` ou `PENDING_RATE` para `SUPERSEDED` (desde que o registo ainda não esteja `SUPERSEDED` nem faturado em fatura `ISSUED`), mantendo horários (`eventsJson`, `workDate`), minutos (`totalMinutes`), tarifas, valores e autor estritamente imutáveis.
   - **Depois da emissão da fatura (`ISSUED`)**: Preserva o registo faturado e a fatura original intactos; cria um novo `WorkRecord` ligado por `correctsInvoicedRecordId` e gera na tabela `Invoice` (`parentInvoiceId`) uma **Nota de Crédito (`CREDIT_NOTE`)** ou **Nota de Débito (`DEBIT_NOTE`)** pela diferença.

4. **Vigência de Preços (`ClientRate`) e `DECIMAL(10, 2)`**:
   - Valores monetários usam `DECIMAL(10, 2)`.
   - Ao cadastrar nova tarifa para `(clientId, tradeId)` com `validFrom`, encerra automaticamente a tarifa anterior aberta (`validTo = validFrom - 1ms`).
   - Vigências não podem se sobrepor nem alterar retroativamente o preço de horas já trabalhadas e precificadas.

5. **Multi-Tenancy com Row-Level Security (RLS) no PostgreSQL**:
   - Todas as tabelas possuem `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY` com políticas (`CREATE POLICY`) usando a function `current_tenant_id()` (`current_setting('app.current_company_id')`) e a role `app_tenant_user` (`NOBYPASSRLS`), executadas via `PrismaService.withTenant(companyId, ...)`.
   - Na UI, um *Persona Switcher* no topo envia `x-user-id`, validado por Guards no NestJS para os 4 papéis (`WORKER`, `FOREMAN`, `ADMIN`, `CLIENT`).

6. **Escopo Mínimo de Frontend (4 Vistas + Dados Base via Seed) e Docker Compose**:
   - Dados base populados via `prisma db seed` para 2 empresas.
   - 4 vistas no Next.js: (1) Ponto Mobile do Trabalhador, (2) Obras, Alocações e Correção de Horas, (3) Preços e Faturação Mensal, (4) Detalhe e Explicação da Fatura.
   - `docker-compose.yml` apenas com PostgreSQL durante o desenvolvimento via `npm`, e completo (`postgres` + `backend` + `frontend`) na Fase 5.

---

## 2. Fases de Execução

1. **Fase 1 (Concluída)**: PostgreSQL no `docker-compose.yml`, setup do `backend/` (NestJS + Prisma), `schema.prisma`, migration inicial com Triggers de Imutabilidade + RLS e `seed.ts` com 2 empresas completas.
2. **Fase 2**: Módulos do Backend (`Users`, `Allocations`, `Rates`, `Attendance`, `Invoices`) e Guards de Multi-tenancy/Roles.
3. **Fase 3**: Suíte de Testes Automatizados no Backend cobrindo isolamento RLS, soma/arredondamento de minutos e tarifas a meio do mês, `PENDING_RATE`, substituição `SUPERSEDED` e notas de ajuste pós-fatura.
4. **Fase 4**: Frontend Next.js com Persona Switcher e as 4 vistas mínimas.
5. **Fase 5**: Docker Compose final completo (`postgres` + `backend` + `frontend`) e revisão final de `README.md` e `DECISOES.md`.
