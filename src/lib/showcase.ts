// Read-only showcase queries for the admin "SQL Lab" page (used during the demo / viva).
// Only these fixed statements can run there, never user-typed SQL.

export type Showcase = { key: string; title: string; concepts: string[]; sql: string; setup?: string };

export const showcases: Showcase[] = [
  {
    key: 'join',
    title: 'Applications with student, drive and company (multi-table JOIN)',
    concepts: ['INNER JOIN', 'ORDER BY'],
    sql: `SELECT u.full_name, s.srn, c.name AS company, d.title, a.status, a.match_score
FROM applications a
JOIN students s   ON s.student_id = a.student_id
JOIN users u      ON u.user_id    = s.student_id
JOIN drives d     ON d.drive_id   = a.drive_id
JOIN companies c  ON c.company_id = d.company_id
ORDER BY a.applied_at DESC
LIMIT 50;`,
  },
  {
    key: 'having',
    title: 'Drives with at least 3 applicants and their average match (GROUP BY + HAVING)',
    concepts: ['GROUP BY', 'HAVING', 'aggregate functions'],
    sql: `SELECT c.name AS company, d.title,
       COUNT(*)                     AS applicants,
       ROUND(AVG(a.match_score), 3) AS avg_match,
       MAX(a.match_score)           AS best_match
FROM applications a
JOIN drives d    ON d.drive_id   = a.drive_id
JOIN companies c ON c.company_id = d.company_id
GROUP BY c.name, d.title
HAVING COUNT(*) >= 3
ORDER BY avg_match DESC
LIMIT 50;`,
  },
  {
    key: 'correlated',
    title: 'Students whose CGPA is above their department average (correlated subquery)',
    concepts: ['correlated subquery', 'AVG'],
    sql: `SELECT u.full_name, dp.code AS dept, s.cgpa,
       (SELECT ROUND(AVG(s2.cgpa), 2) FROM students s2 WHERE s2.dept_id = s.dept_id) AS dept_avg
FROM students s
JOIN users u        ON u.user_id  = s.student_id
JOIN departments dp ON dp.dept_id = s.dept_id
WHERE s.cgpa > (SELECT AVG(s2.cgpa) FROM students s2 WHERE s2.dept_id = s.dept_id)
ORDER BY dept, s.cgpa DESC
LIMIT 50;`,
  },
  {
    key: 'not-exists',
    title: 'Unplaced students who have never applied anywhere (NOT EXISTS)',
    concepts: ['NOT EXISTS', 'anti-join'],
    sql: `SELECT u.full_name, s.srn, s.cgpa, s.batch_year
FROM students s
JOIN users u ON u.user_id = s.student_id
WHERE NOT s.is_placed
  AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.student_id = s.student_id)
ORDER BY s.cgpa DESC
LIMIT 50;`,
  },
  {
    key: 'window',
    title: 'Top 3 applicants per drive by match score (window function)',
    concepts: ['RANK() OVER (PARTITION BY)', 'CTE'],
    sql: `WITH ranked AS (
  SELECT d.title, u.full_name, a.match_score, a.status,
         RANK() OVER (PARTITION BY a.drive_id ORDER BY a.match_score DESC) AS rnk
  FROM applications a
  JOIN drives d ON d.drive_id = a.drive_id
  JOIN users u  ON u.user_id  = a.student_id
)
SELECT * FROM ranked WHERE rnk <= 3 ORDER BY title, rnk LIMIT 50;`,
  },
  {
    key: 'funnel',
    title: 'Conversion at each round position across all drives (CTE + FILTER)',
    concepts: ['CTE', 'COUNT FILTER', 'percentage'],
    sql: `WITH per_round AS (
  SELECT r.round_no, rr.result
  FROM round_results rr JOIN rounds r ON r.round_id = rr.round_id
)
SELECT round_no,
       COUNT(*)                                   AS evaluated,
       COUNT(*) FILTER (WHERE result = 'cleared') AS cleared,
       ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'cleared') / COUNT(*), 1) AS pass_pct
FROM per_round
GROUP BY round_no
ORDER BY round_no
LIMIT 50;`,
  },
  {
    key: 'except',
    title: 'Skills students list that no drive asks for (EXCEPT)',
    concepts: ['set operations', 'EXCEPT'],
    sql: `SELECT sk.name FROM student_skills ss JOIN skills sk ON sk.skill_id = ss.skill_id
EXCEPT
SELECT sk.name FROM drive_skills ds JOIN skills sk ON sk.skill_id = ds.skill_id
ORDER BY 1
LIMIT 100;`,
  },
  {
    key: 'fts',
    title: 'Full-text search over job descriptions with ranking',
    concepts: ['tsvector', 'GIN index', 'ts_rank', 'websearch_to_tsquery'],
    sql: `SELECT d.title, c.name AS company,
       ROUND(ts_rank(d.jd_tsv, websearch_to_tsquery('english', 'python data'))::numeric, 4) AS rank
FROM drives d JOIN companies c ON c.company_id = d.company_id
WHERE d.jd_tsv @@ websearch_to_tsquery('english', 'python data')
ORDER BY rank DESC
LIMIT 50;`,
  },
  {
    key: 'vector',
    title: 'Top-3 nearest students for every open drive (pgvector + LATERAL)',
    concepts: ['vector similarity', 'cosine distance <=>', 'LATERAL join'],
    sql: `SELECT d.title, m.full_name, m.similarity
FROM drives d
CROSS JOIN LATERAL (
  SELECT u.full_name,
         ROUND((1 - (s.resume_embedding <=> d.jd_embedding))::numeric, 4) AS similarity
  FROM students s JOIN users u ON u.user_id = s.student_id
  WHERE s.resume_embedding IS NOT NULL
  ORDER BY s.resume_embedding <=> d.jd_embedding
  LIMIT 3
) m
WHERE d.status = 'open'
ORDER BY d.title, m.similarity DESC;`,
  },
  {
    key: 'eligibility',
    title: 'Eligibility function evaluated for one student against every open drive',
    concepts: ['stored function', 'set-returning function', 'LATERAL'],
    sql: `SELECT d.title, d.min_cgpa, d.batch_year, e.eligible, e.reason
FROM drives d
CROSS JOIN LATERAL fn_check_eligibility(
  (SELECT user_id FROM users WHERE email = 'student@placematch.test'), d.drive_id) e
WHERE d.status = 'open'
ORDER BY e.eligible DESC, d.title
LIMIT 50;`,
  },
  {
    key: 'explain',
    title: 'Query plan showing the HNSW vector index being used',
    concepts: ['EXPLAIN', 'HNSW index'],
    setup: 'SET LOCAL enable_seqscan = off',
    sql: `EXPLAIN
SELECT student_id
FROM students
ORDER BY resume_embedding <=> (SELECT jd_embedding FROM drives LIMIT 1)
LIMIT 5;`,
  },
  {
    key: 'view',
    title: 'Department placement view (VIEW with LATERAL + FILTER)',
    concepts: ['VIEW', 'LEFT JOIN LATERAL'],
    sql: `SELECT * FROM v_dept_placement_stats ORDER BY batch_year, placed_pct DESC LIMIT 100;`,
  },
];
