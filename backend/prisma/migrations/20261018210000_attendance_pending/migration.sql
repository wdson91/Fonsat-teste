ALTER TYPE "WorkRecordStatus" ADD VALUE IF NOT EXISTS 'PENDING_CORRECTION';

-- Apenas status pode mudar. Inclui a PK e quaisquer campos adicionados no futuro.
CREATE OR REPLACE FUNCTION enforce_work_record_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' OR OLD."status" = 'SUPERSEDED' OR NEW."status" <> 'SUPERSEDED' THEN
        RAISE EXCEPTION 'Registo imutável: apenas substituição de versão atual é permitida';
    END IF;
    IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
        RAISE EXCEPTION 'Registo imutável: somente status pode mudar';
    END IF;
    IF EXISTS (
        SELECT 1 FROM "InvoiceLineWorkRecord" link
        JOIN "InvoiceLine" line ON line."id" = link."invoiceLineId"
        JOIN "Invoice" invoice ON invoice."id" = line."invoiceId"
        WHERE link."workRecordId" = OLD."id" AND invoice."status" = 'ISSUED'
    ) THEN
        RAISE EXCEPTION 'Registo faturado é imutável';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
