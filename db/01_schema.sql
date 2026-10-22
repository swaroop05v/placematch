-- =====================================================================
-- PlaceMatch : Campus Placement Management with Semantic Resume-JD Matching
-- 01_schema.sql  -- DDL (DROP / CREATE / ALTER, keys, constraints)
-- Target: PostgreSQL 15+ with the pgvector extension (Neon has it built in)
-- =====================================================================

-- ---------- DROP (makes the script re-runnable) ----------------------
DROP VIEW  IF EXISTS v_drive_summary, v_dept_placement_stats, v_company_offer_stats,
                     v_student_overview CASCADE;
DROP TABLE IF EXISTS audit_log, offers, round_results, applications, rounds,
                     drive_skills, drive_departments, drives, recruiters, companies,
                     student_skills, skills, students, departments, users CASCADE;
DROP TYPE  IF EXISTS user_role, app_status, offer_status, drive_status CASCADE;

CREATE EXTENSION IF NOT EXISTS vector;     -- pgvector: vector(n) type + <=> operators

-- ---------- ENUM types (domain integrity) ----------------------------
CREATE TYPE user_role    AS ENUM ('admin', 'recruiter', 'student');
CREATE TYPE drive_status AS ENUM ('draft', 'open', 'closed', 'completed');
CREATE TYPE app_status   AS ENUM ('applied', 'in_process', 'selected', 'rejected', 'withdrawn');
CREATE TYPE offer_status AS ENUM ('pending', 'accepted', 'declined', 'revoked');

-- ---------- USERS (authentication + role) ----------------------------
CREATE TABLE users (
    user_id        SERIAL       PRIMARY KEY,
    email          VARCHAR(120) NOT NULL UNIQUE,
    password_hash  VARCHAR(100) NOT NULL,
    full_name      VARCHAR(80)  NOT NULL,
    role           user_role    NOT NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT chk_email_lower  CHECK (email = lower(email)),
    CONSTRAINT chk_name_len     CHECK (char_length(trim(full_name)) >= 2)
);

-- ---------- DEPARTMENTS ----------------------------------------------
CREATE TABLE departments (
    dept_id   SERIAL      PRIMARY KEY,
    code      VARCHAR(6)  NOT NULL UNIQUE,
    name      VARCHAR(80) NOT NULL UNIQUE,
    CONSTRAINT chk_dept_code CHECK (code ~ '^[A-Z]{2,6}$')
);

-- ---------- STUDENTS (1:1 specialisation of users) -------------------
CREATE TABLE students (
    student_id        INT           PRIMARY KEY,               -- = users.user_id
    srn               VARCHAR(13)   NOT NULL UNIQUE,
    dept_id           INT           NOT NULL,
    batch_year        SMALLINT      NOT NULL,
    cgpa              NUMERIC(4,2)  NOT NULL,
    active_backlogs   SMALLINT      NOT NULL DEFAULT 0,
    phone             VARCHAR(10),
    resume_text       TEXT          NOT NULL DEFAULT '',
    resume_embedding  vector(384),                              -- semantic vector of resume + skills
    resume_tsv        tsvector GENERATED ALWAYS AS (to_tsvector('english', resume_text)) STORED,
    is_placed         BOOLEAN       NOT NULL DEFAULT FALSE,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_srn       CHECK (srn ~ '^PES[12]UG[0-9]{2}[A-Z]{2}[0-9]{3}$'),
    CONSTRAINT chk_cgpa      CHECK (cgpa BETWEEN 0 AND 10),
    CONSTRAINT chk_backlogs  CHECK (active_backlogs >= 0),
    CONSTRAINT chk_batch     CHECK (batch_year BETWEEN 2020 AND 2035),
    CONSTRAINT chk_phone     CHECK (phone IS NULL OR phone ~ '^[6-9][0-9]{9}$')
);

-- ---------- SKILLS (M:N with students and drives) --------------------
CREATE TABLE skills (
    skill_id  SERIAL      PRIMARY KEY,
    name      VARCHAR(40) NOT NULL UNIQUE
);

CREATE TABLE student_skills (
    student_id   INT      NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    skill_id     INT      NOT NULL REFERENCES skills(skill_id)     ON DELETE CASCADE,
    proficiency  SMALLINT NOT NULL DEFAULT 3 CHECK (proficiency BETWEEN 1 AND 5),
    PRIMARY KEY (student_id, skill_id)
);

-- ---------- COMPANIES & RECRUITERS -----------------------------------
CREATE TABLE companies (
    company_id   SERIAL       PRIMARY KEY,
    name         VARCHAR(80)  NOT NULL UNIQUE,
    sector       VARCHAR(40)  NOT NULL,
    website      VARCHAR(120),
    about        TEXT,
    CONSTRAINT chk_website CHECK (website IS NULL OR website ~* '^https?://')
);

CREATE TABLE recruiters (
    recruiter_id  INT         PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    company_id    INT         NOT NULL REFERENCES companies(company_id) ON DELETE RESTRICT,
    designation   VARCHAR(60) NOT NULL DEFAULT 'Talent Acquisition'
);

-- ---------- DRIVES (a job opening run on campus) ---------------------
CREATE TABLE drives (
    drive_id               SERIAL        PRIMARY KEY,
    company_id             INT           NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    created_by             INT           REFERENCES users(user_id) ON DELETE SET NULL,
    title                  VARCHAR(100)  NOT NULL,
    job_type               VARCHAR(12)   NOT NULL,
    description            TEXT          NOT NULL,
    location               VARCHAR(60)   NOT NULL,
    ctc_lpa                NUMERIC(6,2)  NOT NULL,
    min_cgpa               NUMERIC(4,2)  NOT NULL DEFAULT 0,
    max_backlogs           SMALLINT      NOT NULL DEFAULT 0,
    batch_year             SMALLINT      NOT NULL,
    status                 drive_status  NOT NULL DEFAULT 'draft',
    registration_deadline  TIMESTAMPTZ   NOT NULL,
    jd_embedding           vector(384),                         -- semantic vector of the job description
    jd_tsv                 tsvector GENERATED ALWAYS AS
                             (setweight(to_tsvector('english', title), 'A') ||
                              setweight(to_tsvector('english', description), 'B')) STORED,
    created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT chk_job_type  CHECK (job_type IN ('FTE', 'Internship', 'Intern+FTE')),
    CONSTRAINT chk_ctc       CHECK (ctc_lpa > 0 AND ctc_lpa < 500),
    CONSTRAINT chk_min_cgpa  CHECK (min_cgpa BETWEEN 0 AND 10),
    CONSTRAINT chk_max_bl    CHECK (max_backlogs >= 0)
);

CREATE TABLE drive_departments (            -- which departments may apply
    drive_id  INT NOT NULL REFERENCES drives(drive_id)      ON DELETE CASCADE,
    dept_id   INT NOT NULL REFERENCES departments(dept_id)  ON DELETE CASCADE,
    PRIMARY KEY (drive_id, dept_id)
);

CREATE TABLE drive_skills (                 -- skills the JD asks for
    drive_id  INT NOT NULL REFERENCES drives(drive_id) ON DELETE CASCADE,
    skill_id  INT NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
    PRIMARY KEY (drive_id, skill_id)
);

-- ---------- ROUNDS (weak entity of a drive) --------------------------
CREATE TABLE rounds (
    round_id      SERIAL       PRIMARY KEY,
    drive_id      INT          NOT NULL REFERENCES drives(drive_id) ON DELETE CASCADE,
    round_no      SMALLINT     NOT NULL CHECK (round_no >= 1),
    name          VARCHAR(60)  NOT NULL,
    round_type    VARCHAR(12)  NOT NULL CHECK (round_type IN ('OA', 'GD', 'Technical', 'HR')),
    scheduled_at  TIMESTAMPTZ,
    CONSTRAINT uq_round_no UNIQUE (drive_id, round_no)
);

-- ---------- APPLICATIONS (student x drive) ---------------------------
CREATE TABLE applications (
    application_id  SERIAL        PRIMARY KEY,
    student_id      INT           NOT NULL,
    drive_id        INT           NOT NULL,
    status          app_status    NOT NULL DEFAULT 'applied',
    current_round   SMALLINT      NOT NULL DEFAULT 0,      -- 0 = not started, n = waiting on round n
    match_score     NUMERIC(5,4),                          -- cosine similarity resume<->JD at apply time
    applied_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_one_application UNIQUE (student_id, drive_id),
    CONSTRAINT chk_match CHECK (match_score IS NULL OR match_score BETWEEN -1 AND 1)
);

CREATE TABLE round_results (
    application_id  INT          NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
    round_id        INT          NOT NULL REFERENCES rounds(round_id)             ON DELETE CASCADE,
    result          VARCHAR(8)   NOT NULL CHECK (result IN ('cleared', 'rejected')),
    score           NUMERIC(5,2) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    remarks         VARCHAR(200),
    evaluated_by    INT          REFERENCES users(user_id) ON DELETE SET NULL,
    evaluated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (application_id, round_id)
);

-- ---------- OFFERS ---------------------------------------------------
CREATE TABLE offers (
    offer_id        SERIAL        PRIMARY KEY,
    application_id  INT           NOT NULL UNIQUE REFERENCES applications(application_id) ON DELETE CASCADE,
    ctc_lpa         NUMERIC(6,2)  NOT NULL CHECK (ctc_lpa > 0),
    status          offer_status  NOT NULL DEFAULT 'pending',
    offered_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    respond_by      TIMESTAMPTZ   NOT NULL DEFAULT now() + INTERVAL '7 days',
    responded_at    TIMESTAMPTZ,
    CONSTRAINT chk_respond_window CHECK (respond_by > offered_at),
    CONSTRAINT chk_responded CHECK ((status = 'pending') = (responded_at IS NULL) OR status = 'revoked')
);

-- ---------- AUDIT LOG (filled by triggers) ---------------------------
CREATE TABLE audit_log (
    log_id      BIGSERIAL    PRIMARY KEY,
    table_name  VARCHAR(40)  NOT NULL,
    operation   VARCHAR(6)   NOT NULL,
    row_pk      INT,
    actor_id    INT,
    old_data    JSONB,
    new_data    JSONB,
    logged_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- ALTER TABLE: FKs added after creation --------------------
-- (shown separately to demonstrate ALTER; students/applications FKs)
ALTER TABLE students
    ADD CONSTRAINT fk_students_user FOREIGN KEY (student_id) REFERENCES users(user_id)       ON DELETE CASCADE,
    ADD CONSTRAINT fk_students_dept FOREIGN KEY (dept_id)    REFERENCES departments(dept_id) ON DELETE RESTRICT;

ALTER TABLE applications
    ADD CONSTRAINT fk_app_student FOREIGN KEY (student_id) REFERENCES students(student_id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_app_drive   FOREIGN KEY (drive_id)   REFERENCES drives(drive_id)     ON DELETE CASCADE;

-- ALTER: add a column after the fact, with its own constraint
ALTER TABLE students ADD COLUMN linkedin_url VARCHAR(150);
ALTER TABLE students ADD CONSTRAINT chk_linkedin
    CHECK (linkedin_url IS NULL OR linkedin_url ~* '^https://(www\.)?linkedin\.com/');
