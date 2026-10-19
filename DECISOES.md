# DECISOES.md — Assiduidade e Faturação

Este documento regista as decisões de arquitetura e de domínio tomadas perante as ambiguidades do enunciado, privilegiando **exatidão financeira ao cêntimo daqui a dois anos**, **imutabilidade de auditoria** e **isolamento multi-tenant**.

---

## 1. Modelo Consolidado de `WorkRecord`, Arredondamentos e Rastreabilidade

- **Registo Consolidado por Trabalhador, Dia, Obra e Ofício (`WorkRecord`)**:
  - A grelha no telemóvel do trabalhador mantém marcações incompletas no dispositivo (`localStorage`) e **envia somente turnos completos (com entrada `in` e saída `out`)**, também validados pelo backend.
  - No `AttendanceService`, antes de salvar no banco, os pares `in`/`out` são agrupados por `(workDate, siteId, tradeId)`, os minutos de todos os turnos são somados e **o total de minutos (`totalMinutes: Int`, obrigatório) é arredondado (`Math.round`) antes de ser persistido**.
  - Os eventos originais (`eventsJson`) permanecem gravados no `WorkRecord` e a tabela `AttendanceEventDedup` garante idempotência caso o telemóvel reenvie o mesmo pacote.
  - Divergência de obra/ofício ou alocação vira `PENDING_CORRECTION`, sem dinheiro; ID igual/conteúdo diferente retorna 409, replay idêntico é ignorado.
- **Precisão Monetária (`DECIMAL(10, 2)`) e Snapshot Histórico**:
  - Todos os preços horários e montantes utilizam `DECIMAL(10, 2)` no PostgreSQL.
  - A tarifa aplicável é determinada pela **data/hora em que o trabalho ocorreu (`occurredAt` / `workDate`)**, congelando `clientRateId`, `hourlyRateSnapshot` e `totalAmount = round((totalMinutes / 60) * hourlyRateSnapshot, 2)`.
  - Cada `InvoiceLine` congela obra, ofício, tarifa horária, vigência (`validFrom`..`validTo`), minutos e subtotal, ligada aos `WorkRecord` via `InvoiceLineWorkRecord`.

---

## 2. Vigência de Preços, Mudanças a Meio do Mês e `PENDING_RATE`

- **Vigências Sem Sobreposição e Sem Retroatividade**:
  - Tarifas (`ClientRate`) são negociadas por `(clientId, tradeId)` com intervalo `[validFrom, validTo]`.
  - Ao registar um novo preço com `validFrom`, o sistema encerra automaticamente a tarifa anterior aberta (`validTo = novo.validFrom - 1ms`).
  - Nenhuma nova vigência pode sobrepor-se a outra nem alterar retroativamente o preço de horas já trabalhadas e precificadas (`ACTIVE`).
  - Depois da primeira tarifa, novos inícios só a partir de amanhã em Europe/Lisbon e depois da última vigência programada; a primeira pode ser histórica para resolver horas sem preço.
- **Trabalhador Nunca Bloqueado por Falta de Preço Cadastrado (`PENDING_RATE`)**:
  - Se não existir tarifa vigente na `workDate` para aquele `(clientId, tradeId)`, o `WorkRecord` é salvo com `totalMinutes` obrigatório e `status = PENDING_RATE` (`totalAmount = null`), ficando pendente para resolução do Encarregado/Administrativo sem entrar na cobrança até ser resolvido.

---

## 3. Imutabilidade e Histórico de Correções Garantidos por Triggers no PostgreSQL

- **Proteção no Banco (`BEFORE UPDATE OR DELETE`)**:
  - Todas as FKs usam `ON DELETE RESTRICT ON UPDATE RESTRICT`.
  - `AttendanceEventDedup`, `InvoiceLine` e `InvoiceLineWorkRecord` bloqueiam **100% de `UPDATE` e `DELETE`** (`forbid_update_and_delete()`).
  - Em `WorkRecord`, o trigger `enforce_work_record_immutability()` proíbe `DELETE` e permite no `UPDATE` **exclusivamente a transição válida do registo anterior para `SUPERSEDED`** (desde que ainda não esteja `SUPERSEDED` nem faturado em fatura `ISSUED`), preservando horários, minutos, tarifas e valores antigos intocados.
  - O índice único em `replacesRecordId` (`@unique`) impede duas substituições diretas do mesmo registo.
- **Correções ANTES da Emissão da Fatura**:
  - Em uma mesma transação (`prisma.$transaction`), marca a versão anterior como `SUPERSEDED` e cria uma nova versão de `WorkRecord` ligada por `replacesRecordId`, registando `correctionReason` e `createdById`.
- **Correções DEPOIS da Emissão da Fatura (`ISSUED`)**:
  - Preserva original; nova versão aponta `correctsInvoicedRecordId`. Nota CREDIT_NOTE/DEBIT_NOTE DRAFT (`parentInvoiceId`) cobra só diferença contra original + ajustes ISSUED; zero não gera documento. DRAFT pendente bloqueia nova correção; trocar cliente após emissão exige retificação comercial separada.
  - Fatura regular inclui todo trabalho ACTIVE ainda não emitido até o fim da competência, mesmo antigo; pendências não bloqueiam resolvidos. Prévia sem escrita/token de conteúdo; emissão atômica soma montantes já arredondados e exclui registros de correção.

---

## 4. Multi-Tenancy com Row-Level Security (RLS) e Enquadramento Legal (AT / SAF-T / IVA)

- **Dupla Camada de Isolamento Multi-Tenant (Aplicação + PostgreSQL RLS)**:
  - Sem login real, `x-user-id` simula persona; um único AccessGuard resolve os 4 papéis. Serviços aplicam escopo; bootstrap privilegiado é limite da demonstração.
  - No PostgreSQL, todas as tabelas têm **`ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`** com políticas (`CREATE POLICY`) baseadas na function `current_tenant_id()` (`current_setting('app.current_company_id')`) e na role `app_tenant_user` (`NOBYPASSRLS`), acionadas via `PrismaService.withTenant(companyId, ...)`.
- **Como encaixaria Certificação AT, SAF-T, IVA e Retenções em Produção**:
  - Como faturas `ISSUED` são imutáveis por trigger e correções pós-fatura usam documentos retificativos (`CREDIT_NOTE` / `DEBIT_NOTE` com `parentInvoiceId`), bastaria adicionar em `Invoice`/`InvoiceLine` taxa/isenção de IVA (ex: autoliquidação na construção civil), retenção na fonte, série/numeração sequencial, `ATCUD` e assinatura RSA encadeada (`hash`, `previousInvoiceHash`) no momento da emissão para exportação SAF-T (PT).

---

## 5. O Que Ficou Fora de Âmbito

- Autenticação real (JWT/OAuth), geração de PDFs/emails, CI/CD e CRUDs acessórios de cadastro inicial (populados via `seed.ts`).
