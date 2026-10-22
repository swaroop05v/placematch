-- =====================================================================
-- 02_indexes.sql  -- B-tree, partial, GIN (full-text) and HNSW (vector) indexes
-- =====================================================================

-- B-tree indexes on foreign keys that are joined / filtered on often
CREATE INDEX idx_students_dept        ON students (dept_id);
CREATE INDEX idx_recruiters_company   ON recruiters (company_id);
CREATE INDEX idx_drives_company       ON drives (company_id);
CREATE INDEX idx_applications_drive   ON applications (drive_id, status);
CREATE INDEX idx_applications_student ON applications (student_id, status);
CREATE INDEX idx_rounds_drive         ON rounds (drive_id, round_no);
CREATE INDEX idx_audit_table_time     ON audit_log (table_name, logged_at DESC);

-- Partial index: the student "browse drives" page only ever looks at open drives
CREATE INDEX idx_drives_open_deadline ON drives (registration_deadline)
    WHERE status = 'open';

-- Composite index used by eligibility filtering (cgpa / backlogs per batch)
CREATE INDEX idx_students_batch_cgpa  ON students (batch_year, cgpa DESC);

-- GIN indexes for full-text search (keyword search on JDs and resumes)
CREATE INDEX idx_drives_jd_tsv        ON drives   USING GIN (jd_tsv);
CREATE INDEX idx_students_resume_tsv  ON students USING GIN (resume_tsv);

-- HNSW indexes for approximate nearest-neighbour search with cosine distance (<=>)
CREATE INDEX idx_students_resume_vec  ON students USING hnsw (resume_embedding vector_cosine_ops);
CREATE INDEX idx_drives_jd_vec        ON drives   USING hnsw (jd_embedding vector_cosine_ops);
