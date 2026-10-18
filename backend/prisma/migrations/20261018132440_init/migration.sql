-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('WORKER', 'FOREMAN', 'ADMIN', 'CLIENT');

-- CreateEnum
CREATE TYPE "WorkRecordStatus" AS ENUM ('ACTIVE', 'PENDING_RATE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('REGULAR', 'CREDIT_NOTE', 'DEBIT_NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED');

-- CreateTable
CREATE TABLE "Company" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "defaultTradeId" INTEGER,
    "clientId" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "foremanId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "tradeId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRate" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "tradeId" INTEGER NOT NULL,
    "hourlyRate" DECIMAL(10,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkRecord" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "workerId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "tradeId" INTEGER NOT NULL,
    "workDate" TIMESTAMP(3) NOT NULL,
    "eventsJson" JSONB NOT NULL,
    "totalMinutes" INTEGER NOT NULL,
    "clientRateId" INTEGER,
    "hourlyRateSnapshot" DECIMAL(10,2),
    "totalAmount" DECIMAL(10,2),
    "status" "WorkRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "replacesRecordId" INTEGER,
    "correctsInvoicedRecordId" INTEGER,
    "correctionReason" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceEventDedup" (
    "id" TEXT NOT NULL,
    "companyId" INTEGER NOT NULL,
    "shiftId" TEXT NOT NULL,
    "workRecordId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceEventDedup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" SERIAL NOT NULL,
    "companyId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'REGULAR',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "parentInvoiceId" INTEGER,
    "notes" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" SERIAL NOT NULL,
    "invoiceId" INTEGER NOT NULL,
    "siteId" INTEGER NOT NULL,
    "siteNameSnapshot" TEXT NOT NULL,
    "tradeId" INTEGER NOT NULL,
    "tradeNameSnapshot" TEXT NOT NULL,
    "clientRateId" INTEGER NOT NULL,
    "hourlyRateSnapshot" DECIMAL(10,2) NOT NULL,
    "rateValidFromSnapshot" TIMESTAMP(3) NOT NULL,
    "rateValidToSnapshot" TIMESTAMP(3),
    "totalMinutes" INTEGER NOT NULL,
    "lineAmount" DECIMAL(10,2) NOT NULL,
    "description" TEXT,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLineWorkRecord" (
    "id" SERIAL NOT NULL,
    "invoiceLineId" INTEGER NOT NULL,
    "workRecordId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLineWorkRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Trade_companyId_name_key" ON "Trade"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_companyId_name_key" ON "Client"("companyId", "name");

-- CreateIndex (Impede duas substituições diretas do mesmo WorkRecord)
CREATE UNIQUE INDEX "WorkRecord_replacesRecordId_key" ON "WorkRecord"("replacesRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLineWorkRecord_invoiceLineId_workRecordId_key" ON "InvoiceLineWorkRecord"("invoiceLineId", "workRecordId");

-- AddForeignKey
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultTradeId_fkey" FOREIGN KEY ("defaultTradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_foremanId_fkey" FOREIGN KEY ("foremanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientRate" ADD CONSTRAINT "ClientRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientRate" ADD CONSTRAINT "ClientRate_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientRate" ADD CONSTRAINT "ClientRate_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_clientRateId_fkey" FOREIGN KEY ("clientRateId") REFERENCES "ClientRate"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_replacesRecordId_fkey" FOREIGN KEY ("replacesRecordId") REFERENCES "WorkRecord"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "WorkRecord" ADD CONSTRAINT "WorkRecord_correctsInvoicedRecordId_fkey" FOREIGN KEY ("correctsInvoicedRecordId") REFERENCES "WorkRecord"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AttendanceEventDedup" ADD CONSTRAINT "AttendanceEventDedup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AttendanceEventDedup" ADD CONSTRAINT "AttendanceEventDedup_workRecordId_fkey" FOREIGN KEY ("workRecordId") REFERENCES "WorkRecord"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_tradeId_fkey" FOREIGN KEY ("tradeId") REFERENCES "Trade"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_clientRateId_fkey" FOREIGN KEY ("clientRateId") REFERENCES "ClientRate"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InvoiceLineWorkRecord" ADD CONSTRAINT "InvoiceLineWorkRecord_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "InvoiceLine"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "InvoiceLineWorkRecord" ADD CONSTRAINT "InvoiceLineWorkRecord_workRecordId_fkey" FOREIGN KEY ("workRecordId") REFERENCES "WorkRecord"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- =============================================================================
-- RESTRIÇÕES DE IMUTABILIDADE (DATABASE-LEVEL TRIGGERS E FUNCTIONS)
-- =============================================================================

-- 1. Proibição total de UPDATE e DELETE em tabelas estritamente Append-Only:
--    "AttendanceEventDedup", "InvoiceLine", "InvoiceLineWorkRecord"
CREATE OR REPLACE FUNCTION forbid_update_and_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Operação % proibida na tabela "%": os registos são estritamente imutáveis (append-only).', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_attendance_event_dedup_immutable
BEFORE UPDATE OR DELETE ON "AttendanceEventDedup"
FOR EACH ROW EXECUTE FUNCTION forbid_update_and_delete();

CREATE TRIGGER trg_invoice_line_immutable
BEFORE UPDATE OR DELETE ON "InvoiceLine"
FOR EACH ROW EXECUTE FUNCTION forbid_update_and_delete();

CREATE TRIGGER trg_invoice_line_work_record_immutable
BEFORE UPDATE OR DELETE ON "InvoiceLineWorkRecord"
FOR EACH ROW EXECUTE FUNCTION forbid_update_and_delete();

-- 2. Imutabilidade de "WorkRecord":
--    - DELETE é sempre proibido.
--    - UPDATE permite SOMENTE a transição autorizada de status (ACTIVE ou PENDING_RATE -> SUPERSEDED),
--      desde que o registo ainda não esteja SUPERSEDED, não esteja faturado em fatura ISSUED,
--      e todos os restantes campos (horários, minutos, tarifas, valores, autor, etc.) permaneçam intactos.
CREATE OR REPLACE FUNCTION enforce_work_record_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Operação DELETE proibida na tabela "WorkRecord": registos de trabalho nunca podem ser apagados.';
    END IF;

    IF OLD."status" = 'SUPERSEDED' THEN
        RAISE EXCEPTION 'Operação UPDATE proibida: o registo de trabalho já foi substituído (SUPERSEDED) e não pode sofrer novas alterações.';
    END IF;

    IF NEW."status" <> 'SUPERSEDED' THEN
        RAISE EXCEPTION 'Operação UPDATE proibida em "WorkRecord": apenas a transição para SUPERSEDED é permitida.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "InvoiceLineWorkRecord" ilwr
        JOIN "InvoiceLine" il ON il."id" = ilwr."invoiceLineId"
        JOIN "Invoice" i ON i."id" = il."invoiceId"
        WHERE ilwr."workRecordId" = OLD."id"
          AND i."status" = 'ISSUED'
    ) THEN
        RAISE EXCEPTION 'Operação UPDATE proibida: um registo já faturado (ISSUED) não pode ser marcado como SUPERSEDED.';
    END IF;

    IF NEW."companyId" <> OLD."companyId"
       OR NEW."workerId" <> OLD."workerId"
       OR NEW."siteId" <> OLD."siteId"
       OR NEW."tradeId" <> OLD."tradeId"
       OR NEW."workDate" <> OLD."workDate"
       OR NEW."eventsJson"::text <> OLD."eventsJson"::text
       OR NEW."totalMinutes" <> OLD."totalMinutes"
       OR NEW."clientRateId" IS DISTINCT FROM OLD."clientRateId"
       OR NEW."hourlyRateSnapshot" IS DISTINCT FROM OLD."hourlyRateSnapshot"
       OR NEW."totalAmount" IS DISTINCT FROM OLD."totalAmount"
       OR NEW."replacesRecordId" IS DISTINCT FROM OLD."replacesRecordId"
       OR NEW."correctsInvoicedRecordId" IS DISTINCT FROM OLD."correctsInvoicedRecordId"
       OR NEW."correctionReason" IS DISTINCT FROM OLD."correctionReason"
       OR NEW."createdById" <> OLD."createdById"
       OR NEW."createdAt" <> OLD."createdAt" THEN
        RAISE EXCEPTION 'Operação UPDATE proibida em "WorkRecord": horários, minutos, tarifas e valores antigos são estritamente imutáveis.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_record_immutable
BEFORE UPDATE OR DELETE ON "WorkRecord"
FOR EACH ROW EXECUTE FUNCTION enforce_work_record_immutability();

-- 3. Imutabilidade de "Invoice":
--    - DELETE é sempre proibido.
--    - UPDATE em fatura já emitida (status = 'ISSUED') é proibido.
--    - Quando ainda em 'DRAFT', apenas permite a transição de status para 'ISSUED' e preenchimento de 'issuedAt'.
CREATE OR REPLACE FUNCTION enforce_invoice_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Operação DELETE proibida na tabela "Invoice": faturas não podem ser apagadas.';
    END IF;

    IF OLD."status" = 'ISSUED' THEN
        RAISE EXCEPTION 'Operação UPDATE proibida: uma fatura emitida (ISSUED) não pode ser alterada.';
    END IF;

    IF NEW."companyId" <> OLD."companyId"
       OR NEW."clientId" <> OLD."clientId"
       OR NEW."year" <> OLD."year"
       OR NEW."month" <> OLD."month"
       OR NEW."type" <> OLD."type"
       OR NEW."parentInvoiceId" IS DISTINCT FROM OLD."parentInvoiceId"
       OR NEW."totalAmount" <> OLD."totalAmount" THEN
        RAISE EXCEPTION 'Operação UPDATE proibida: os dados financeiros da fatura não podem ser alterados; apenas a emissão (DRAFT -> ISSUED) é permitida.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_immutable
BEFORE UPDATE OR DELETE ON "Invoice"
FOR EACH ROW EXECUTE FUNCTION enforce_invoice_immutability();

-- 4. Imutabilidade de "ClientRate":
--    - DELETE é sempre proibido.
--    - UPDATE do preço horário ou data inicial (validFrom) é proibido; apenas permite fechar uma vigência aberta (validTo: NULL -> NOT NULL).
CREATE OR REPLACE FUNCTION enforce_client_rate_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Operação DELETE proibida na tabela "ClientRate": vigências de preço não podem ser apagadas.';
    END IF;

    IF NEW."companyId" <> OLD."companyId"
       OR NEW."clientId" <> OLD."clientId"
       OR NEW."tradeId" <> OLD."tradeId"
       OR NEW."hourlyRate" <> OLD."hourlyRate"
       OR NEW."validFrom" <> OLD."validFrom"
       OR OLD."validTo" IS NOT NULL THEN
        RAISE EXCEPTION 'Operação UPDATE proibida em "ClientRate": tarifas são imutáveis (apenas o fecho de validTo anteriormente NULL é permitido).';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_rate_immutable
BEFORE UPDATE OR DELETE ON "ClientRate"
FOR EACH ROW EXECUTE FUNCTION enforce_client_rate_immutability();

-- =============================================================================
-- ROW-LEVEL SECURITY (RLS) PARA ISOLAMENTO MULTI-TENANT NO POSTGRESQL
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant_user') THEN
        CREATE ROLE app_tenant_user NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_tenant_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_tenant_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_tenant_user;

CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS INTEGER AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_company_id', true), '')::INTEGER;
END;
$$ LANGUAGE plpgsql STABLE;

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Trade" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Trade" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" FORCE ROW LEVEL SECURITY;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Site" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Site" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Allocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Allocation" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ClientRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientRate" FORCE ROW LEVEL SECURITY;

ALTER TABLE "WorkRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkRecord" FORCE ROW LEVEL SECURITY;

ALTER TABLE "AttendanceEventDedup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceEventDedup" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invoice" FORCE ROW LEVEL SECURITY;

ALTER TABLE "InvoiceLine" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLine" FORCE ROW LEVEL SECURITY;

ALTER TABLE "InvoiceLineWorkRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InvoiceLineWorkRecord" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_company ON "Company"
    FOR ALL TO app_tenant_user
    USING ("id" = current_tenant_id())
    WITH CHECK ("id" = current_tenant_id());

CREATE POLICY tenant_isolation_trade ON "Trade"
    FOR ALL TO app_tenant_user
    USING ("companyId" = current_tenant_id())
    WITH CHECK ("companyId" = current_tenant_id());

CREATE POLICY tenant_isolation_client ON "Client"
    FOR ALL TO app_tenant_user
    USING ("companyId" = current_tenant_id())
    WITH CHECK ("companyId" = current_tenant_id());

CREATE POLICY tenant_isolation_user ON "User"
    FOR ALL TO app_tenant_user
    USING ("companyId" = current_tenant_id())
    WITH CHECK ("companyId" = current_tenant_id());

CREATE POLICY tenant_isolation_site ON "Site"
    FOR ALL TO app_tenant_user
    USING ("companyId" = current_tenant_id())
    WITH CHECK ("companyId" = current_tenant_id());

CREATE POLICY tenant_isolation_allocation ON "Allocation"
    FOR ALL TO app_tenant_user
    USING ("companyId" = current_tenant_id())
    WITH CHECK ("companyId" = current_tenant_id());

CREATE POLICY tenant_isolation_client_rate ON "ClientRate"
    FOR ALL TO app_tenant_user
    USING ("companyId" = current_tenant_id())
    WITH CHECK ("companyId" = current_tenant_id());

CREATE POLICY tenant_isolation_work_record ON "WorkRecord"
    FOR ALL TO app_tenant_user
    USING ("companyId" = current_tenant_id())
    WITH CHECK ("companyId" = current_tenant_id());

CREATE POLICY tenant_isolation_event_dedup ON "AttendanceEventDedup"
    FOR ALL TO app_tenant_user
    USING ("companyId" = current_tenant_id())
    WITH CHECK ("companyId" = current_tenant_id());

CREATE POLICY tenant_isolation_invoice ON "Invoice"
    FOR ALL TO app_tenant_user
    USING ("companyId" = current_tenant_id())
    WITH CHECK ("companyId" = current_tenant_id());

CREATE POLICY tenant_isolation_invoice_line ON "InvoiceLine"
    FOR ALL TO app_tenant_user
    USING (
        EXISTS (
            SELECT 1 FROM "Invoice" i
            WHERE i."id" = "InvoiceLine"."invoiceId"
              AND i."companyId" = current_tenant_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "Invoice" i
            WHERE i."id" = "InvoiceLine"."invoiceId"
              AND i."companyId" = current_tenant_id()
        )
    );

CREATE POLICY tenant_isolation_invoice_line_work_record ON "InvoiceLineWorkRecord"
    FOR ALL TO app_tenant_user
    USING (
        EXISTS (
            SELECT 1 FROM "WorkRecord" w
            WHERE w."id" = "InvoiceLineWorkRecord"."workRecordId"
              AND w."companyId" = current_tenant_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "WorkRecord" w
            WHERE w."id" = "InvoiceLineWorkRecord"."workRecordId"
              AND w."companyId" = current_tenant_id()
        )
    );
