-- =====================================================================
-- 05_audit.sql  -- audit trail: who changed what, written by triggers
-- Runs after 01-04 (needs the audit_log table from 01_schema.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: id of the logged-in app user, set per transaction by the API
-- with  SELECT set_config('app.user_id', '<id>', true)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_current_actor()
RETURNS INT
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.user_id', true), '')::INT;
$$;

-- Generic audit trail (JSONB snapshot of old/new rows, minus vectors)
CREATE OR REPLACE FUNCTION trg_fn_audit()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    old_j JSONB := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
    new_j JSONB := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) END;
    pk    INT;
BEGIN
    old_j := old_j - 'jd_embedding' - 'jd_tsv';
    new_j := new_j - 'jd_embedding' - 'jd_tsv';
    pk := (COALESCE(new_j, old_j) ->> TG_ARGV[0])::INT;
    INSERT INTO audit_log (table_name, operation, row_pk, actor_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, TG_OP, pk, fn_current_actor(), old_j, new_j);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_applications
AFTER INSERT OR UPDATE OR DELETE ON applications
FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('application_id');

CREATE TRIGGER trg_audit_offers
AFTER INSERT OR UPDATE OR DELETE ON offers
FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('offer_id');

CREATE TRIGGER trg_audit_drives
AFTER INSERT OR UPDATE OF status, ctc_lpa, min_cgpa, registration_deadline OR DELETE ON drives
FOR EACH ROW EXECUTE FUNCTION trg_fn_audit('drive_id');
