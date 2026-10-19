CREATE OR REPLACE FUNCTION enforce_invoice_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' OR OLD."status" <> 'DRAFT' OR NEW."status" <> 'ISSUED' OR NEW."issuedAt" IS NULL THEN
        RAISE EXCEPTION 'Fatura imutável: apenas emissão de DRAFT é permitida';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','issuedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','issuedAt']) THEN
        RAISE EXCEPTION 'Dados históricos e financeiros da fatura são imutáveis';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_client_rate_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' OR OLD."validTo" IS NOT NULL OR NEW."validTo" IS NULL OR NEW."validTo" < OLD."validFrom" THEN
        RAISE EXCEPTION 'Tarifa imutável: apenas encerramento de vigência aberta é permitido';
    END IF;
    IF (to_jsonb(NEW) - 'validTo') IS DISTINCT FROM (to_jsonb(OLD) - 'validTo') THEN
        RAISE EXCEPTION 'Preço e identidade da tarifa são imutáveis';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
