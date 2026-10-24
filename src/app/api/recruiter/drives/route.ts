
import { NextResponse } from 'next/server';
import { requireApi, jsonError, HttpError } from '@/lib/auth';
import { withTransaction, dbErrorMessage } from '@/lib/db';
import { embedText } from '@/lib/embeddings';

const JOB_TYPES = ['FTE', 'Internship', 'Intern+FTE'] as const;
const ROUND_TYPES = ['OA', 'GD', 'Technical', 'HR'] as const;

function positiveIds(value: unknown, field: string): number[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${field} must be an array`);
  }

  const ids = value.map((item) => {
    const id = typeof item === 'string' && item.trim() !== ''
      ? Number(item)
      : item;

    if (
      typeof id !== 'number' ||
      !Number.isSafeInteger(id) ||
      id <= 0
    ) {
      throw new HttpError(400, `${field} contains an invalid ID`);
    }

    return id;
  });

  return [...new Set(ids)];
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field} is required`);
  }

  const result = value.trim();

  if (!result || result.length > maxLength) {
    throw new HttpError(
      400,
      `${field} must contain 1–${maxLength} characters`,
    );
  }

  return result;
}

function numericField(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const number = typeof value === 'number' ? value : Number(value);

  if (
    value === undefined ||
    value === null ||
    value === '' ||
    !Number.isFinite(number) ||
    number < min ||
    number > max
  ) {
    throw new HttpError(400, `${field} must be between ${min} and ${max}`);
  }

  return number;
}

export async function POST(req: Request) {
  try {
    const s = await requireApi('recruiter');

    let body: unknown;

    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'Invalid JSON request body');
    }

    if (
      body === null ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      throw new HttpError(400, 'Request body must be an object');
    }

    const b = body as Record<string, unknown>;

    const title = requiredText(b.title, 'Job title', 100);
    const description = requiredText(b.description, 'Job description', 100000);

    if (description.length < 30) {
      throw new HttpError(400, 'Job description must contain at least 30 characters');
    }

    const location = requiredText(b.location, 'Location', 60);

    if (
      typeof b.job_type !== 'string' ||
      !JOB_TYPES.includes(b.job_type as (typeof JOB_TYPES)[number])
    ) {
      throw new HttpError(400, 'Invalid job type');
    }

    const ctc = numericField(b.ctc_lpa, 'CTC (LPA)', Number.MIN_VALUE, 499.99);
    const minCgpa = numericField(b.min_cgpa ?? 0, 'Minimum CGPA', 0, 10);
    const maxBacklogs = numericField(
      b.max_backlogs ?? 0,
      'Maximum backlogs',
      0,
      32767,
    );
    const batchYear = numericField(b.batch_year, 'Batch year', 2020, 2035);

    if (!Number.isSafeInteger(maxBacklogs) || !Number.isSafeInteger(batchYear)) {
      throw new HttpError(400, 'Maximum backlogs and batch year must be whole numbers');
    }

    if (typeof b.registration_deadline !== 'string' ||
        !b.registration_deadline.trim()) {
      throw new HttpError(400, 'Registration deadline is required');
    }

    const deadline = new Date(b.registration_deadline);

    if (Number.isNaN(deadline.getTime())) {
      throw new HttpError(400, 'Invalid registration deadline');
    }

    const depts = positiveIds(b.depts, 'Departments');
    const skills = positiveIds(b.skills, 'Skills');

    const rounds = [1, 2, 3, 4]
      .map((n) => ({
        name: typeof b[`round_name_${n}`] === 'string'
          ? (b[`round_name_${n}`] as string).trim()
          : '',
        type: b[`round_type_${n}`],
      }))
      .filter((round) => round.name !== '');

    if (!rounds.length) {
      throw new HttpError(400, 'At least one round is required');
    }

    for (const round of rounds) {
      if (round.name.length > 60) {
        throw new HttpError(400, 'Round names cannot exceed 60 characters');
      }

      if (
        typeof round.type !== 'string' ||
        !ROUND_TYPES.includes(round.type as (typeof ROUND_TYPES)[number])
      ) {
        throw new HttpError(400, `Invalid round type for "${round.name}"`);
      }
    }

    if (typeof b.publish !== 'undefined' && typeof b.publish !== 'boolean') {
      throw new HttpError(400, 'Publish must be a boolean');
    }

    const driveId = await withTransaction(s.userId, async (c) => {
      if (depts.length) {
        const { rows } = await c.query(
          'SELECT dept_id FROM departments WHERE dept_id = ANY($1::int[])',
          [depts],
        );

        if (rows.length !== depts.length) {
          throw new HttpError(400, 'One or more selected departments do not exist');
        }
      }

      let skillNames: string[] = [];

      if (skills.length) {
        const { rows } = await c.query(
          'SELECT skill_id, name FROM skills WHERE skill_id = ANY($1::int[])',
          [skills],
        );

        if (rows.length !== skills.length) {
          throw new HttpError(400, 'One or more selected skills do not exist');
        }

        skillNames = rows.map((row) => row.name as string);
      }

      const vector = await embedText(
        `${title}. ${description} Skills: ${skillNames.join(', ')}`,
      );

      const { rows: [drive] } = await c.query(
        `INSERT INTO drives (
           company_id, created_by, title, job_type, description, location,
           ctc_lpa, min_cgpa, max_backlogs, batch_year, status,
           registration_deadline, jd_embedding
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING drive_id`,
        [
          s.companyId,
          s.userId,
          title,
          b.job_type,
          description,
          location,
          ctc,
          minCgpa,
          maxBacklogs,
          batchYear,
          b.publish === false ? 'draft' : 'open',
          deadline,
          vector,
        ],
      );

      if (depts.length) {
        await c.query(
          'INSERT INTO drive_departments SELECT $1::int, unnest($2::int[])',
          [drive.drive_id, depts],
        );
      }

      if (skills.length) {
        await c.query(
          'INSERT INTO drive_skills SELECT $1::int, unnest($2::int[])',
          [drive.drive_id, skills],
        );
      }

      for (const [index, round] of rounds.entries()) {
        await c.query(
          `INSERT INTO rounds (drive_id, round_no, name, round_type)
           VALUES ($1,$2,$3,$4)`,
          [drive.drive_id, index + 1, round.name, round.type],
        );
      }

      return drive.drive_id as number;
    });

    return NextResponse.json(
      { redirect: `/recruiter/drives/${driveId}` },
      { status: 201 },
    );
  } catch (err) {
    return jsonError(err, dbErrorMessage);
  }
}
