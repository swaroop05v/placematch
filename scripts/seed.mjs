// Seeds PlaceMatch with demo data and computes all embeddings.
// Every write goes through the real constraints, triggers and procedures,
// so the seeded history is exactly what the app itself would have produced.
import bcrypt from 'bcryptjs';
import { getClient, embed, toPgVector } from './lib.mjs';
import { departments, skills, companies, drives, buildStudents } from './seed-data.mjs';

const client = getClient();
await client.connect();
const q = (text, params) => client.query(text, params);

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

try {
  console.log('Loading embedding model (first run downloads ~25 MB) ...');
  await embed(['warm up']);

  await q('BEGIN');
  await q(`TRUNCATE audit_log, offers, round_results, applications, rounds, drive_skills,
           drive_departments, drives, recruiters, companies, student_skills, skills,
           students, departments, users RESTART IDENTITY CASCADE`);

  const [adminHash, recruiterHash, studentHash] = await Promise.all(
    ['Admin@123', 'Recruiter@123', 'Student@123'].map((p) => bcrypt.hash(p, 10)),
  );

  // ---- lookup tables ------------------------------------------------
  const deptId = {};
  for (const [code, name] of departments) {
    const { rows } = await q('INSERT INTO departments (code, name) VALUES ($1, $2) RETURNING dept_id', [code, name]);
    deptId[code] = rows[0].dept_id;
  }
  const skillId = {};
  for (const name of skills) {
    const { rows } = await q('INSERT INTO skills (name) VALUES ($1) RETURNING skill_id', [name]);
    skillId[name] = rows[0].skill_id;
  }

  // ---- admin --------------------------------------------------------
  const { rows: [admin] } = await q(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ('admin@placematch.test', $1, 'Placement Office', 'admin') RETURNING user_id`, [adminHash]);
  await q(`SELECT set_config('app.user_id', $1, false)`, [String(admin.user_id)]);

  // ---- companies + one recruiter each --------------------------------
  const companyId = {};
  const recruiterOf = {};
  for (const c of companies) {
    const { rows: [co] } = await q(
      'INSERT INTO companies (name, sector, website, about) VALUES ($1,$2,$3,$4) RETURNING company_id',
      [c.name, c.sector, c.website, c.about]);
    companyId[c.name] = co.company_id;
    // the demo recruiter login belongs to Cobalt AI Labs
    const email = c.name === 'Cobalt AI Labs' ? 'recruiter@placematch.test' : `hr.${slug(c.name)}@placematch.test`;
    const { rows: [u] } = await q(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,'recruiter') RETURNING user_id`,
      [email, recruiterHash, `${c.name.split(' ')[0]} HR`]);
    await q('INSERT INTO recruiters (recruiter_id, company_id) VALUES ($1,$2)', [u.user_id, co.company_id]);
    recruiterOf[c.name] = u.user_id;
  }

  // ---- students (+ demo student) ------------------------------------
  const students = buildStudents(40);
  students.unshift({
    name: 'Demo Student', email: 'student@placematch.test', srn: 'PES1UG23CS001', dept: 'CS', batch: 2027,
    cgpa: 8.62, backlogs: 0, phone: '9876543210', skills: ['Python', 'PyTorch', 'NLP', 'React', 'SQL', 'Docker'],
    resume: `Demo Student - CS student. Built a semantic search engine for research papers using sentence-transformer embeddings and PostgreSQL with pgvector, served through a Next.js frontend. Fine-tuned a BERT model for question classification in PyTorch and deployed it with Docker. Comfortable with SQL, REST APIs and React.`,
  });

  console.log(`Embedding ${students.length} resumes ...`);
  const resumeVecs = await embed(students.map((s) => `${s.resume} Skills: ${s.skills.join(', ')}`));

  for (const [i, s] of students.entries()) {
    const { rows: [u] } = await q(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,$2,$3,'student') RETURNING user_id`,
      [s.email, studentHash, s.name]);
    await q(
      `INSERT INTO students (student_id, srn, dept_id, batch_year, cgpa, active_backlogs, phone, resume_text, resume_embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [u.user_id, s.srn, deptId[s.dept], s.batch, s.cgpa, s.backlogs, s.phone, s.resume, toPgVector(resumeVecs[i])]);
    for (const [k, name] of s.skills.entries()) {
      await q('INSERT INTO student_skills (student_id, skill_id, proficiency) VALUES ($1,$2,$3)',
        [u.user_id, skillId[name], 3 + (k % 3)]);
    }
  }

  // ---- drives -------------------------------------------------------
  console.log(`Embedding ${drives.length} job descriptions ...`);
  const jdVecs = await embed(drives.map((d) => `${d.title}. ${d.jd} Skills: ${d.skills.join(', ')}`));
  const driveIds = [];
  for (const [i, d] of drives.entries()) {
    const { rows: [row] } = await q(
      `INSERT INTO drives (company_id, created_by, title, job_type, description, location, ctc_lpa, min_cgpa,
                           max_backlogs, batch_year, status, registration_deadline, jd_embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now() + make_interval(days => $12::int), $13) RETURNING drive_id`,
      [companyId[d.company], recruiterOf[d.company], d.title, d.job_type, d.jd, d.loc, d.ctc, d.min_cgpa, d.max_bl,
       d.batch, d.phase === 'draft' ? 'draft' : 'open', String(10 + i * 2), toPgVector(jdVecs[i])]);
    driveIds.push(row.drive_id);
    for (const code of d.depts) await q('INSERT INTO drive_departments VALUES ($1,$2)', [row.drive_id, deptId[code]]);
    for (const name of d.skills) await q('INSERT INTO drive_skills VALUES ($1,$2)', [row.drive_id, skillId[name]]);
    for (const [k, [name, type]] of d.rounds.entries()) {
      await q(`INSERT INTO rounds (drive_id, round_no, name, round_type, scheduled_at)
               VALUES ($1,$2,$3,$4, now() + make_interval(days => $5::int))`,
        [row.drive_id, k + 1, name, type, String(15 + i * 2 + k)]);
    }
  }

  // ---- applications: eligible students whose resume fits the JD ------
  // (the BEFORE INSERT trigger re-checks eligibility and stamps match_score)
  // The demo student is kept out of finished drives so their account starts unplaced.
  const applyTop = async (driveId, limit, minScore, includeDemo) => q(
    `INSERT INTO applications (student_id, drive_id)
     SELECT s.student_id, $1::int FROM students s JOIN users u ON u.user_id = s.student_id
     WHERE (SELECT eligible FROM fn_check_eligibility(s.student_id, $1::int))
       AND ($4::boolean OR u.email <> 'student@placematch.test')
       AND fn_match_score(s.student_id, $1::int) >= $3::numeric
     ORDER BY fn_match_score(s.student_id, $1::int) DESC
     LIMIT $2::int`,
    [driveId, limit, minScore, includeDemo]);

  // Grade every active application of a drive for its current round:
  // the better half (by match score) clears, the rest are rejected.
  const gradeRound = async (driveId, evaluator) => {
    const { rows } = await q(
      `SELECT application_id FROM applications
       WHERE drive_id = $1 AND status IN ('applied','in_process') ORDER BY match_score DESC`, [driveId]);
    const pass = Math.max(1, Math.ceil(rows.length * 0.6));
    for (const [k, r] of rows.entries()) {
      const cleared = k < pass;
      await q('CALL sp_record_round_result($1,$2,$3,$4,$5)', [
        r.application_id, cleared ? 'cleared' : 'rejected', cleared ? 70 + ((k * 7) % 25) : 35 + ((k * 5) % 20),
        cleared ? 'Good problem solving' : 'Below cut-off', evaluator]);
    }
  };

  for (const [i, d] of drives.entries()) {
    const id = driveIds[i];
    if (d.phase === 'completed') await applyTop(id, 9, 0.2, false);
    if (d.phase === 'inprocess') await applyTop(id, 9, 0.2, true);
    if (d.phase === 'open' && i % 2 === 1) await applyTop(id, 3, 0.25, false);
  }

  // completed drives: run every round, then students accept their offers
  for (const [i, d] of drives.entries()) {
    if (d.phase !== 'completed') continue;
    for (let r = 0; r < d.rounds.length; r++) await gradeRound(driveIds[i], recruiterOf[d.company]);
    const acceptOffers = d.company !== 'Orbitron Semiconductors'; // leave these pending for the demo
    if (acceptOffers) {
      const { rows } = await q(
        `SELECT o.offer_id, a.student_id FROM offers o JOIN applications a USING (application_id)
         WHERE a.drive_id = $1 AND o.status = 'pending'`, [driveIds[i]]);
      for (const o of rows) await q('CALL sp_accept_offer($1,$2)', [o.offer_id, o.student_id]);
    }
  }
  // in-process drives: only the first round has been evaluated
  for (const [i, d] of drives.entries()) {
    if (d.phase === 'inprocess') await gradeRound(driveIds[i], recruiterOf[d.company]);
  }

  // close out finished drives (deadline moved into the past)
  for (const [i, d] of drives.entries()) {
    if (d.phase !== 'completed') continue;
    const status = d.company === 'Orbitron Semiconductors' ? 'closed' : 'completed';
    await q(`UPDATE drives SET status = $2, registration_deadline = now() - interval '30 days' WHERE drive_id = $1`,
      [driveIds[i], status]);
  }

  await q('COMMIT');

  const { rows: [c] } = await q(`SELECT
      (SELECT COUNT(*) FROM students) students, (SELECT COUNT(*) FROM drives) drives,
      (SELECT COUNT(*) FROM applications) applications, (SELECT COUNT(*) FROM offers) offers,
      (SELECT COUNT(*) FROM offers WHERE status = 'accepted') accepted`);
  console.log('Seeded:', c);
  console.log('Logins  admin@placematch.test / Admin@123 | recruiter@placematch.test / Recruiter@123 | student@placematch.test / Student@123');
} catch (err) {
  await q('ROLLBACK').catch(() => {});
  console.error('Seed FAILED:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
