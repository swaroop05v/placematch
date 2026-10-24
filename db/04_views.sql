-- =====================================================================
-- 04_views.sql  -- reporting views used by the dashboards
-- =====================================================================

-- One row per drive with funnel counts (LEFT JOIN + GROUP BY + FILTER)
CREATE OR REPLACE VIEW v_drive_summary AS
SELECT d.drive_id,
       d.title,
       c.company_id,
       c.name                                   AS company,
       d.job_type,
       d.location,
       d.ctc_lpa,
       fn_drive_tier(d.ctc_lpa)                 AS tier,
       d.min_cgpa,
       d.max_backlogs,
       d.batch_year,
       d.status,
       d.registration_deadline,
       COUNT(a.application_id)                                        AS applicants,
       COUNT(a.application_id) FILTER (WHERE a.status = 'in_process') AS in_process,
       COUNT(a.application_id) FILTER (WHERE a.status = 'selected')   AS selected,
       COUNT(a.application_id) FILTER (WHERE a.status = 'rejected')   AS rejected,
       ROUND(AVG(a.match_score), 3)                                   AS avg_match
FROM drives d
JOIN companies c         ON c.company_id = d.company_id
LEFT JOIN applications a ON a.drive_id   = d.drive_id AND a.status <> 'withdrawn'
GROUP BY d.drive_id, c.company_id;

-- Department-wise placement statistics for a batch
CREATE OR REPLACE VIEW v_dept_placement_stats AS
SELECT dp.code                                                   AS dept,
       dp.name                                                   AS dept_name,
       s.batch_year,
       COUNT(*)                                                  AS students,
       COUNT(*) FILTER (WHERE s.is_placed)                       AS placed,
       ROUND(100.0 * COUNT(*) FILTER (WHERE s.is_placed) / COUNT(*), 1) AS placed_pct,
       ROUND(AVG(acc.ctc_lpa), 2)                                AS avg_ctc,
       MAX(acc.ctc_lpa)                                          AS max_ctc
FROM students s
JOIN departments dp ON dp.dept_id = s.dept_id
LEFT JOIN LATERAL (                       -- best accepted offer of each student
    SELECT MAX(o.ctc_lpa) AS ctc_lpa
    FROM offers o JOIN applications a ON a.application_id = o.application_id
    WHERE a.student_id = s.student_id AND o.status = 'accepted'
) acc ON TRUE
GROUP BY dp.code, dp.name, s.batch_year;

-- Companies that have made at least one offer (GROUP BY + HAVING)
CREATE OR REPLACE VIEW v_company_offer_stats AS
SELECT c.company_id,
       c.name                                            AS company,
       c.sector,
       COUNT(DISTINCT d.drive_id)                        AS drives,
       COUNT(o.offer_id)                                 AS offers,
       COUNT(o.offer_id) FILTER (WHERE o.status = 'accepted') AS accepted,
       MAX(o.ctc_lpa)                                    AS highest_ctc
FROM companies c
JOIN drives d       ON d.company_id = c.company_id
JOIN applications a ON a.drive_id   = d.drive_id
JOIN offers o       ON o.application_id = a.application_id
GROUP BY c.company_id, c.name, c.sector
HAVING COUNT(o.offer_id) >= 1;

-- Student profile with aggregated skills and application counters
CREATE OR REPLACE VIEW v_student_overview AS
SELECT s.student_id,
       u.full_name,
       u.email,
       s.srn,
       dp.code                                AS dept,
       s.batch_year,
       s.cgpa,
       s.active_backlogs,
       s.is_placed,
       (s.resume_embedding IS NOT NULL)       AS has_embedding,
       COALESCE((SELECT string_agg(sk.name, ', ' ORDER BY sk.name)
                 FROM student_skills ss JOIN skills sk ON sk.skill_id = ss.skill_id
                 WHERE ss.student_id = s.student_id), '')        AS skills,
       (SELECT COUNT(*) FROM applications a
        WHERE a.student_id = s.student_id AND a.status <> 'withdrawn') AS applications,
       (SELECT MAX(o.ctc_lpa) FROM offers o
        JOIN applications a ON a.application_id = o.application_id
        WHERE a.student_id = s.student_id AND o.status = 'accepted') AS accepted_ctc
FROM students s
JOIN users u        ON u.user_id  = s.student_id
JOIN departments dp ON dp.dept_id = s.dept_id;
