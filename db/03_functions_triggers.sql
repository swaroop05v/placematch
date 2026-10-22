-- =====================================================================
-- 03_functions_triggers.sql  -- functions, stored procedures and triggers
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: placement tier of a CTC (used in policy checks and reports)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_drive_tier(p_ctc NUMERIC)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p_ctc >= 20 THEN 'Dream'
                WHEN p_ctc >= 10 THEN 'Core'
                ELSE 'Mass' END;
$$;

-- ---------------------------------------------------------------------
-- Semantic match between a student's resume and a drive's JD.
-- Cosine similarity = 1 - cosine distance (<=> operator from pgvector).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_match_score(p_student INT, p_drive INT)
RETURNS NUMERIC
LANGUAGE sql STABLE AS $$
    SELECT ROUND((1 - (s.resume_embedding <=> d.jd_embedding))::NUMERIC, 4)
    FROM students s, drives d
    WHERE s.student_id = p_student AND d.drive_id = p_drive
      AND s.resume_embedding IS NOT NULL AND d.jd_embedding IS NOT NULL;
$$;

-- ---------------------------------------------------------------------
-- Eligibility rules for a student applying to a drive.
-- Returns (eligible, reason). Used by the UI *and* enforced by a trigger,
-- so the rule lives in exactly one place: the database.
--
-- Placement policy ("one student one job, dream exception"):
--   once a student has accepted an offer they may only apply to Dream
--   drives (CTC >= 20 LPA) paying at least 1.5x their accepted CTC.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_eligibility(p_student INT, p_drive INT)
RETURNS TABLE (eligible BOOLEAN, reason TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    s         students%ROWTYPE;
    d         drives%ROWTYPE;
    best_ctc  NUMERIC;
BEGIN
    SELECT * INTO s FROM students WHERE student_id = p_student;
    IF NOT FOUND THEN RETURN QUERY SELECT FALSE, 'Student profile not found'; RETURN; END IF;

    SELECT * INTO d FROM drives WHERE drive_id = p_drive;
    IF NOT FOUND THEN RETURN QUERY SELECT FALSE, 'Drive not found'; RETURN; END IF;

    IF d.status <> 'open' THEN
        RETURN QUERY SELECT FALSE, 'Drive is not open for registration'; RETURN;
    END IF;
    IF now() > d.registration_deadline THEN
        RETURN QUERY SELECT FALSE, 'Registration deadline has passed'; RETURN;
    END IF;
    IF s.batch_year <> d.batch_year THEN
        RETURN QUERY SELECT FALSE, format('Only for the %s batch', d.batch_year); RETURN;
    END IF;
    IF EXISTS (SELECT 1 FROM drive_departments WHERE drive_id = p_drive)
       AND NOT EXISTS (SELECT 1 FROM drive_departments
                       WHERE drive_id = p_drive AND dept_id = s.dept_id) THEN
        RETURN QUERY SELECT FALSE, 'Your department is not eligible'; RETURN;
    END IF;
    IF s.cgpa < d.min_cgpa THEN
        RETURN QUERY SELECT FALSE, format('Minimum CGPA is %s (yours: %s)', d.min_cgpa, s.cgpa); RETURN;
    END IF;
    IF s.active_backlogs > d.max_backlogs THEN
        RETURN QUERY SELECT FALSE, format('At most %s active backlog(s) allowed', d.max_backlogs); RETURN;
    END IF;

    SELECT MAX(o.ctc_lpa) INTO best_ctc
    FROM offers o JOIN applications a ON a.application_id = o.application_id
    WHERE a.student_id = p_student AND o.status = 'accepted';

    IF best_ctc IS NOT NULL
       AND (fn_drive_tier(d.ctc_lpa) <> 'Dream' OR d.ctc_lpa < 1.5 * best_ctc) THEN
        RETURN QUERY SELECT FALSE,
            format('Already placed at %s LPA: only Dream drives paying >= %s LPA allowed',
                   best_ctc, ROUND(1.5 * best_ctc, 2));
        RETURN;
    END IF;

    IF EXISTS (SELECT 1 FROM applications WHERE student_id = p_student AND drive_id = p_drive) THEN
        RETURN QUERY SELECT FALSE, 'You have already applied to this drive'; RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, 'Eligible';
END;
$$;

-- ---------------------------------------------------------------------
-- PROCEDURE: record the result of the application's current round.
-- Runs as one transaction:  lock application -> insert result ->
-- advance / reject / select -> create offer when the last round is cleared.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_record_round_result(
    p_application INT,
    p_result      TEXT,
    p_score       NUMERIC,
    p_remarks     TEXT,
    p_evaluator   INT
)
LANGUAGE plpgsql AS $$
DECLARE
    a          applications%ROWTYPE;
    r          rounds%ROWTYPE;
    last_round SMALLINT;
    drive_ctc  NUMERIC;
BEGIN
    -- row lock: two recruiters cannot grade the same application concurrently
    SELECT * INTO a FROM applications WHERE application_id = p_application FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Application % not found', p_application;
    END IF;
    IF a.status NOT IN ('applied', 'in_process') THEN
        RAISE EXCEPTION 'Application is already %', a.status;
    END IF;

    SELECT * INTO r FROM rounds WHERE drive_id = a.drive_id AND round_no = a.current_round;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Round % is not configured for this drive', a.current_round;
    END IF;

    INSERT INTO round_results (application_id, round_id, result, score, remarks, evaluated_by)
    VALUES (p_application, r.round_id, p_result, p_score, p_remarks, p_evaluator);

    SELECT MAX(round_no) INTO last_round FROM rounds WHERE drive_id = a.drive_id;

    IF p_result = 'rejected' THEN
        UPDATE applications SET status = 'rejected' WHERE application_id = p_application;
    ELSIF a.current_round < last_round THEN
        UPDATE applications SET status = 'in_process', current_round = current_round + 1
        WHERE application_id = p_application;
    ELSE
        UPDATE applications SET status = 'selected' WHERE application_id = p_application;
        SELECT ctc_lpa INTO drive_ctc FROM drives WHERE drive_id = a.drive_id;
        INSERT INTO offers (application_id, ctc_lpa) VALUES (p_application, drive_ctc);
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- PROCEDURE: student accepts an offer.  All-or-nothing transaction:
--   1. lock the offer row and validate ownership / deadline
--   2. mark it accepted, mark the student placed
--   3. auto-decline the student's other pending offers
--   4. withdraw applications that the placement policy no longer allows
-- p_withdrawn (INOUT) reports how many applications were withdrawn.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_accept_offer(
    p_offer      INT,
    p_student    INT,
    INOUT p_withdrawn INT DEFAULT 0
)
LANGUAGE plpgsql AS $$
DECLARE
    o_status   offer_status;
    o_ctc      NUMERIC;
    o_deadline TIMESTAMPTZ;
    o_owner    INT;
BEGIN
    SELECT o.status, o.ctc_lpa, o.respond_by, a.student_id
      INTO o_status, o_ctc, o_deadline, o_owner
    FROM offers o JOIN applications a ON a.application_id = o.application_id
    WHERE o.offer_id = p_offer
    FOR UPDATE OF o;

    IF NOT FOUND OR o_owner <> p_student THEN
        RAISE EXCEPTION 'Offer not found for this student';
    END IF;
    IF o_status <> 'pending' THEN
        RAISE EXCEPTION 'Offer is already %', o_status;
    END IF;
    IF now() > o_deadline THEN
        RAISE EXCEPTION 'The response window for this offer has closed';
    END IF;

    UPDATE offers   SET status = 'accepted', responded_at = now() WHERE offer_id = p_offer;
    UPDATE students SET is_placed = TRUE WHERE student_id = p_student;

    UPDATE offers o SET status = 'declined', responded_at = now()
    FROM applications a
    WHERE a.application_id = o.application_id
      AND a.student_id = p_student AND o.offer_id <> p_offer AND o.status = 'pending';

    UPDATE applications a SET status = 'withdrawn'
    FROM drives d
    WHERE d.drive_id = a.drive_id
      AND a.student_id = p_student
      AND a.status IN ('applied', 'in_process')
      AND (fn_drive_tier(d.ctc_lpa) <> 'Dream' OR d.ctc_lpa < 1.5 * o_ctc);
    GET DIAGNOSTICS p_withdrawn = ROW_COUNT;
END;
$$;

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- T1. Enforce eligibility at the database level and stamp the match score
CREATE OR REPLACE FUNCTION trg_fn_application_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    ok  BOOLEAN;
    why TEXT;
BEGIN
    SELECT eligible, reason INTO ok, why FROM fn_check_eligibility(NEW.student_id, NEW.drive_id);
    IF NOT ok THEN
        RAISE EXCEPTION 'Not eligible: %', why USING ERRCODE = 'check_violation';
    END IF;
    NEW.status        := 'applied';
    NEW.current_round := 1;
    NEW.match_score   := COALESCE(NEW.match_score, fn_match_score(NEW.student_id, NEW.drive_id));
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_application_eligibility
BEFORE INSERT ON applications
FOR EACH ROW EXECUTE FUNCTION trg_fn_application_before_insert();

-- T2. Only allow legal status transitions on an application
CREATE OR REPLACE FUNCTION trg_fn_application_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IN ('rejected', 'withdrawn', 'selected') AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'Cannot change an application that is already %', OLD.status
            USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_application_status_guard
BEFORE UPDATE ON applications
FOR EACH ROW EXECUTE FUNCTION trg_fn_application_status_guard();

-- T3. An offer can only be created for a selected application
CREATE OR REPLACE FUNCTION trg_fn_offer_before_insert()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT status FROM applications WHERE application_id = NEW.application_id) <> 'selected' THEN
        RAISE EXCEPTION 'Offers can only be made to selected candidates'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_offer_requires_selection
BEFORE INSERT ON offers
FOR EACH ROW EXECUTE FUNCTION trg_fn_offer_before_insert();

-- T4. Editing resume text invalidates the stored embedding
--     (unless the same UPDATE also supplies a fresh embedding)
CREATE OR REPLACE FUNCTION trg_fn_student_resume_changed()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.resume_text IS DISTINCT FROM OLD.resume_text
       AND NEW.resume_embedding IS NOT DISTINCT FROM OLD.resume_embedding THEN
        NEW.resume_embedding := NULL;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_student_resume_changed
BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION trg_fn_student_resume_changed();

-- T5. A completed drive can never be reopened
CREATE OR REPLACE FUNCTION trg_fn_drive_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'completed' AND NEW.status <> 'completed' THEN
        RAISE EXCEPTION 'A completed drive cannot be reopened' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_drive_status_guard
BEFORE UPDATE OF status ON drives
FOR EACH ROW EXECUTE FUNCTION trg_fn_drive_status_guard();
