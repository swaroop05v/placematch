// Database test cases: constraints, triggers, procedures, transactions, views,
// full-text and vector search. Every test runs inside BEGIN ... ROLLBACK, so the
// database is left exactly as it was. Results are also written to docs/test-results.md.
import fs from 'node:fs';
import { getClient } from './lib.mjs';

const client = getClient();
await client.connect();
const q = (text, params) => client.query(text, params);

// ---------- fixtures (created inside each test's transaction) ----------
let seq = 0;
async function makeStudent({ cgpa = 8.5, backlogs = 0, batch = 2027, dept = 'CS', vec = 1 } = {}) {
  seq++;
  const { rows: [u] } = await q(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, 'x', 'Test Student', 'student') RETURNING user_id`,
    [`t${seq}_${Date.now()}@placematch.test`]);
  await q(
    `INSERT INTO students (student_id, srn, dept_id, batch_year, cgpa, active_backlogs, resume_text, resume_embedding)
     VALUES ($1, $2, (SELECT dept_id FROM departments WHERE code = $3), $4, $5, $6, 'test resume', $7)`,
    [u.user_id, `PES2UG23CS${String(900 + seq).slice(-3)}`, dept, batch, cgpa, backlogs, oneHot(vec)]);
  return u.user_id;
}
async function makeDrive({ ctc = 12, minCgpa = 7, status = 'open', batch = 2027, rounds = 2, vec = 1, depts = [] } = {}) {
  const { rows: [d] } = await q(
    `INSERT INTO drives (company_id, title, job_type, description, location, ctc_lpa, min_cgpa, max_backlogs,
                         batch_year, status, registration_deadline, jd_embedding)
     VALUES ((SELECT MIN(company_id) FROM companies), 'Test Drive', 'FTE', 'test description', 'Test', $1, $2, 0,
             $3, $4, now() + interval '5 days', $5) RETURNING drive_id`,
    [ctc, minCgpa, batch, status, oneHot(vec)]);
  for (let i = 1; i <= rounds; i++) {
    await q(`INSERT INTO rounds (drive_id, round_no, name, round_type) VALUES ($1, $2, $3, 'Technical')`, [d.drive_id, i, `R${i}`]);
  }
  for (const code of depts) {
    await q(`INSERT INTO drive_departments SELECT $1::int, dept_id FROM departments WHERE code = $2`, [d.drive_id, code]);
  }
  return d.drive_id;
}
// 384-d unit vector with a 1 in position i (makes similarity values predictable)
function oneHot(i) {
  const v = new Array(384).fill(0);
  v[i] = 1;
  return `[${v.join(',')}]`;
}
async function apply(student, drive) {
  const { rows: [a] } = await q('INSERT INTO applications (student_id, drive_id) VALUES ($1,$2) RETURNING *', [student, drive]);
  return a;
}
async function expectError(fn, pattern) {
  await q('SAVEPOINT expect_error');
  try {
    await fn();
  } catch (err) {
    await q('ROLLBACK TO SAVEPOINT expect_error');
    if (pattern && !pattern.test(err.message)) throw new Error(`wrong error: ${err.message}`);
    return err.message;
  }
  throw new Error('expected an error but the statement succeeded');
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ---------- test cases ----------
const tests = [
  ['CHECK: malformed SRN is rejected', 'Constraint', async () =>
    expectError(() => q(`UPDATE students SET srn = 'ABC123' WHERE student_id = (SELECT MIN(student_id) FROM students)`), /chk_srn/)],

  ['CHECK: CGPA above 10 is rejected', 'Constraint', async () =>
    expectError(() => q(`UPDATE students SET cgpa = 11 WHERE student_id = (SELECT MIN(student_id) FROM students)`), /chk_cgpa|numeric field overflow/)],

  ['CHECK: invalid email format is rejected', 'Constraint', async () =>
    expectError(() => q(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('not-an-email', 'x', 'Bad', 'student')`), /chk_email_format/)],

  ['UNIQUE: duplicate email is rejected', 'Constraint', async () =>
    expectError(() => q(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('admin@placematch.test', 'x', 'Dup', 'admin')`), /duplicate key/)],

  ['FOREIGN KEY: student in a non-existent department is rejected', 'Constraint', async () => {
    const { rows: [u] } = await q(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('fk@placematch.test','x','FK Test','student') RETURNING user_id`);
    return expectError(() => q(`INSERT INTO students (student_id, srn, dept_id, batch_year, cgpa) VALUES ($1, 'PES1UG23CS999', 9999, 2027, 8)`, [u.user_id]), /fk_students_dept/);
  }],

  ['ENUM: unknown application status is rejected', 'Constraint', async () =>
    expectError(() => q(`UPDATE applications SET status = $1 WHERE application_id = (SELECT MIN(application_id) FROM applications)`, ['hired']), /invalid input value for enum/)],

  ['TRIGGER: eligible student can apply; match score is stamped automatically', 'Trigger', async () => {
    const s = await makeStudent({ vec: 5 });
    const d = await makeDrive({ vec: 5 });
    const a = await apply(s, d);
    assert(a.status === 'applied' && a.current_round === 1, 'application not initialised');
    assert(Number(a.match_score) === 1, `identical vectors should give match 1, got ${a.match_score}`);
    return `match_score = ${a.match_score}`;
  }],

  ['TRIGGER: CGPA below drive minimum is blocked', 'Trigger', async () => {
    const s = await makeStudent({ cgpa: 6.1 });
    const d = await makeDrive({ minCgpa: 8 });
    return expectError(() => apply(s, d), /Minimum CGPA/);
  }],

  ['TRIGGER: department not in the drive list is blocked', 'Trigger', async () => {
    const s = await makeStudent({ dept: 'ME' });
    const d = await makeDrive({ depts: ['CS', 'EC'] });
    return expectError(() => apply(s, d), /department is not eligible/);
  }],

  ['TRIGGER: applying to a draft drive is blocked', 'Trigger', async () => {
    const s = await makeStudent();
    const d = await makeDrive({ status: 'draft' });
    return expectError(() => apply(s, d), /not open/);
  }],

  ['TRIGGER: duplicate application is blocked', 'Trigger', async () => {
    const s = await makeStudent();
    const d = await makeDrive();
    await apply(s, d);
    return expectError(() => apply(s, d), /already applied/);
  }],

  ['PROCEDURE: clearing round 1 of 2 advances the candidate', 'Procedure', async () => {
    const s = await makeStudent();
    const d = await makeDrive({ rounds: 2 });
    const a = await apply(s, d);
    await q(`CALL sp_record_round_result($1, 'cleared', 80, 'ok', NULL)`, [a.application_id]);
    const { rows: [r] } = await q('SELECT status, current_round FROM applications WHERE application_id = $1', [a.application_id]);
    assert(r.status === 'in_process' && r.current_round === 2, JSON.stringify(r));
    return `status=${r.status}, current_round=${r.current_round}`;
  }],

  ['PROCEDURE: clearing the last round selects the candidate and creates an offer', 'Procedure', async () => {
    const s = await makeStudent();
    const d = await makeDrive({ rounds: 1, ctc: 14 });
    const a = await apply(s, d);
    await q(`CALL sp_record_round_result($1, 'cleared', 90, 'great', NULL)`, [a.application_id]);
    const { rows: [o] } = await q('SELECT o.status, o.ctc_lpa, a.status AS app FROM offers o JOIN applications a USING (application_id) WHERE a.application_id = $1', [a.application_id]);
    assert(o && o.status === 'pending' && Number(o.ctc_lpa) === 14 && o.app === 'selected', JSON.stringify(o));
    return `offer ${o.ctc_lpa} LPA, ${o.status}`;
  }],

  ['PROCEDURE: rejection ends the application; grading it again fails', 'Procedure', async () => {
    const s = await makeStudent();
    const d = await makeDrive();
    const a = await apply(s, d);
    await q(`CALL sp_record_round_result($1, 'rejected', 20, 'no', NULL)`, [a.application_id]);
    return expectError(() => q(`CALL sp_record_round_result($1, 'cleared', 90, '', NULL)`, [a.application_id]), /already rejected/);
  }],

  ['TRIGGER: an offer cannot be inserted for a non-selected application', 'Trigger', async () => {
    const s = await makeStudent();
    const d = await makeDrive();
    const a = await apply(s, d);
    return expectError(() => q('INSERT INTO offers (application_id, ctc_lpa) VALUES ($1, 10)', [a.application_id]), /selected candidates/);
  }],

  ['TRANSACTION: accepting an offer places the student, declines other offers, withdraws non-dream applications', 'Transaction', async () => {
    const s = await makeStudent();
    const d1 = await makeDrive({ rounds: 1, ctc: 12 });
    const d2 = await makeDrive({ rounds: 1, ctc: 9 });
    const d3 = await makeDrive({ rounds: 2, ctc: 11 });   // still in process, not Dream -> withdrawn
    const d4 = await makeDrive({ rounds: 2, ctc: 30 });   // Dream and >= 1.5x -> kept
    const a1 = await apply(s, d1); const a2 = await apply(s, d2);
    const a3 = await apply(s, d3); const a4 = await apply(s, d4);
    await q(`CALL sp_record_round_result($1, 'cleared', 90, '', NULL)`, [a1.application_id]);
    await q(`CALL sp_record_round_result($1, 'cleared', 90, '', NULL)`, [a2.application_id]);
    const { rows: [o1] } = await q('SELECT offer_id FROM offers WHERE application_id = $1', [a1.application_id]);
    const { rows: [res] } = await q('CALL sp_accept_offer($1, $2, NULL)', [o1.offer_id, s]);
    const { rows } = await q(
      `SELECT a.application_id, a.status, o.status AS offer FROM applications a LEFT JOIN offers o USING (application_id)
       WHERE a.student_id = $1 ORDER BY a.application_id`, [s]);
    const { rows: [st] } = await q('SELECT is_placed FROM students WHERE student_id = $1', [s]);
    const by = Object.fromEntries(rows.map((r) => [r.application_id, r]));
    assert(st.is_placed, 'student not marked placed');
    assert(by[a1.application_id].offer === 'accepted', 'offer 1 not accepted');
    assert(by[a2.application_id].offer === 'declined', 'offer 2 not auto-declined');
    assert(by[a3.application_id].status === 'withdrawn', 'non-dream application not withdrawn');
    assert(by[a4.application_id].status === 'applied', 'dream application should be kept');
    return `withdrawn=${res.p_withdrawn}; offer2=declined; dream app kept`;
  }],

  ['POLICY: a placed student cannot apply to a non-Dream drive', 'Trigger', async () => {
    const s = await makeStudent();
    const d1 = await makeDrive({ rounds: 1, ctc: 12 });
    const a1 = await apply(s, d1);
    await q(`CALL sp_record_round_result($1, 'cleared', 90, '', NULL)`, [a1.application_id]);
    const { rows: [o] } = await q('SELECT offer_id FROM offers WHERE application_id = $1', [a1.application_id]);
    await q('CALL sp_accept_offer($1, $2, NULL)', [o.offer_id, s]);
    const d2 = await makeDrive({ ctc: 15 });
    return expectError(() => apply(s, d2), /Already placed/);
  }],

  ['TRANSACTION: failure inside a transaction rolls back earlier statements', 'Transaction', async () => {
    await q('SAVEPOINT tx');
    try {
      await q(`INSERT INTO companies (name, sector) VALUES ('Atomic Test Co', 'Test')`);
      await q(`INSERT INTO users (email, password_hash, full_name, role) VALUES ('admin@placematch.test', 'x', 'Dup', 'recruiter')`);
    } catch {
      await q('ROLLBACK TO SAVEPOINT tx');
    }
    const { rows } = await q(`SELECT 1 FROM companies WHERE name = 'Atomic Test Co'`);
    assert(rows.length === 0, 'company insert was not rolled back');
    return 'company insert undone after duplicate recruiter email';
  }],

  ['TRIGGER: final application states cannot change', 'Trigger', async () => {
    const s = await makeStudent();
    const d = await makeDrive();
    const a = await apply(s, d);
    await q(`UPDATE applications SET status = 'withdrawn' WHERE application_id = $1`, [a.application_id]);
    return expectError(() => q(`UPDATE applications SET status = 'applied' WHERE application_id = $1`, [a.application_id]), /already withdrawn/);
  }],

  ['TRIGGER: a completed drive cannot be reopened', 'Trigger', async () => {
    const d = await makeDrive();
    await q(`UPDATE drives SET status = 'completed' WHERE drive_id = $1`, [d]);
    return expectError(() => q(`UPDATE drives SET status = 'open' WHERE drive_id = $1`, [d]), /cannot be reopened/);
  }],

  ['TRIGGER: editing resume text clears the stale embedding', 'Trigger', async () => {
    const s = await makeStudent();
    await q(`UPDATE students SET resume_text = 'completely new resume' WHERE student_id = $1`, [s]);
    const { rows: [r] } = await q('SELECT resume_embedding IS NULL AS cleared FROM students WHERE student_id = $1', [s]);
    assert(r.cleared, 'embedding still present');
    return 'resume_embedding set to NULL';
  }],

  ['AUDIT: updates are logged with the acting user (app.user_id)', 'Trigger', async () => {
    const s = await makeStudent();
    const d = await makeDrive();
    const a = await apply(s, d);
    await q(`SELECT set_config('app.user_id', $1, true)`, [String(s)]);
    await q(`UPDATE applications SET status = 'withdrawn' WHERE application_id = $1`, [a.application_id]);
    const { rows: [l] } = await q(
      `SELECT actor_id, old_data->>'status' AS old, new_data->>'status' AS new FROM audit_log
       WHERE table_name = 'applications' AND row_pk = $1 AND operation = 'UPDATE' ORDER BY log_id DESC LIMIT 1`, [a.application_id]);
    assert(l && l.actor_id === s && l.old === 'applied' && l.new === 'withdrawn', JSON.stringify(l));
    return `logged ${l.old} -> ${l.new} by user ${l.actor_id}`;
  }],

  ['VECTOR: nearest-neighbour search ranks the most similar resume first', 'Vector', async () => {
    const s1 = await makeStudent({ vec: 200 });
    await makeStudent({ vec: 201 });
    const { rows } = await q(
      `SELECT student_id, 1 - (resume_embedding <=> $1::vector) AS sim FROM students
       WHERE resume_embedding IS NOT NULL ORDER BY resume_embedding <=> $1::vector LIMIT 1`, [oneHot(200)]);
    assert(rows[0].student_id === s1 && Math.abs(rows[0].sim - 1) < 1e-6, JSON.stringify(rows[0]));
    return 'exact match ranked #1 with similarity 1.0';
  }],

  ['VECTOR: real resume embeddings rank a relevant student above an unrelated one', 'Vector', async () => {
    const { rows } = await q(
      `SELECT s.resume_text ILIKE '%machine learning%' AS is_ml
       FROM students s, drives d
       WHERE d.title = 'ML Engineer - NLP' AND s.resume_embedding IS NOT NULL
       ORDER BY s.resume_embedding <=> d.jd_embedding LIMIT 5`);
    assert(rows.length > 0, 'no seeded embeddings found (run npm run db:seed)');
    const hits = rows.filter((r) => r.is_ml).length;
    assert(hits >= 3, `only ${hits}/5 nearest resumes are ML profiles`);
    return `${hits}/5 nearest resumes to the NLP job are ML profiles`;
  }],

  ['FULL-TEXT: keyword search finds matching job descriptions', 'Search', async () => {
    const { rows } = await q(`SELECT title FROM drives WHERE jd_tsv @@ websearch_to_tsquery('english', 'kubernetes')`);
    assert(rows.some((r) => /Reliability|Platform/.test(r.title)), JSON.stringify(rows));
    return rows.map((r) => r.title).join(', ');
  }],

  ['VIEW: v_drive_summary counts match the base tables', 'View', async () => {
    const { rows: [r] } = await q(
      `SELECT (SELECT SUM(applicants) FROM v_drive_summary)::int AS view_total,
              (SELECT COUNT(*) FROM applications WHERE status <> 'withdrawn')::int AS raw_total`);
    assert(r.view_total === r.raw_total, JSON.stringify(r));
    return `${r.view_total} = ${r.raw_total}`;
  }],
];

// ---------- runner ----------
const results = [];
for (const [name, area, fn] of tests) {
  if (process.env.TRACE) console.error('>>', name);
  await q('BEGIN');
  try {
    const detail = await fn();
    results.push({ name, area, pass: true, detail: String(detail ?? '') });
  } catch (err) {
    results.push({ name, area, pass: false, detail: err.message });
  } finally {
    await q('ROLLBACK');
  }
}
await client.end();

const passed = results.filter((r) => r.pass).length;
for (const [i, r] of results.entries()) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${String(i + 1).padStart(2)}. [${r.area}] ${r.name}\n        ${r.detail}`);
}
console.log(`\n${passed}/${results.length} tests passed`);

const md = [
  '# Database test results',
  '',
  `Generated by \`npm run test:db\` on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. ${passed}/${results.length} passed.`,
  '',
  '| # | Area | Test case | Result | Observed |',
  '|---|------|-----------|--------|----------|',
  ...results.map((r, i) => `| ${i + 1} | ${r.area} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | ${r.detail.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |`),
  '',
];
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/test-results.md', md.join('\n'));
process.exitCode = passed === results.length ? 0 : 1;
