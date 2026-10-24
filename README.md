# PlaceMatch: Campus Placement Management with Semantic Resume–JD Matching

DBMS Experiential Learning, Level 3 project (Dept. of CSE, PES University)

| Name | SRN |
|------|-----|
| Swaroop Venkateshwar | PES1UG24CS923 |
| Shreesh S A | PES1UG24CS441 |

PlaceMatch runs a college placement season end to end. The placement office onboards companies. Recruiters publish drives with eligibility rules and interview rounds. Students apply, recruiters grade each round, and offers flow back to students.

On top of that workflow, every resume and job description is converted into a **vector embedding** stored in PostgreSQL with **pgvector**. That lets the system:

- recommend the best-fitting open drives to each student,
- rank a drive's applicants by how well their resume matches the JD,
- surface eligible students who haven't applied but match well, and
- run a plain-English talent search ("someone who has built chatbots with language models") that finds relevant resumes even when they use different words.

## Tech stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 16 (App Router, React 19, Tailwind CSS 4) |
| Backend / API | Next.js Route Handlers (`src/app/api/**`) + server components using a `pg` connection pool |
| SQL database | PostgreSQL 16 (hosted on Neon) |
| Vector database | pgvector extension on the same PostgreSQL instance (HNSW index, cosine distance) |
| Embeddings | `Xenova/all-MiniLM-L6-v2` (384-d) run locally with `@huggingface/transformers`, so no API key is needed |
| Auth | bcrypt password hashes + signed JWT in an httpOnly cookie; three roles: **admin**, **recruiter**, **student** |

## Database features at a glance

| Requirement | Where |
|-------------|-------|
| DDL: CREATE / ALTER / DROP, PK, FK, CHECK, UNIQUE, ENUM | [`db/01_schema.sql`](db/01_schema.sql) |
| Indexes: B-tree, composite, partial, GIN (full-text), HNSW (vector) | [`db/02_indexes.sql`](db/02_indexes.sql) |
| Functions, stored procedures, triggers | [`db/03_functions_triggers.sql`](db/03_functions_triggers.sql) |
| Views | [`db/04_views.sql`](db/04_views.sql) |
| Audit trail (trigger + actor tracking) | [`db/05_audit.sql`](db/05_audit.sql) |
| Transactions with row locks | `sp_accept_offer`, `sp_record_round_result`, all multi-statement API routes (`withTransaction` in [`src/lib/db.ts`](src/lib/db.ts)) |
| Full-text search | `tsvector` generated columns + GIN, used in student drive search and recruiter talent search |
| Vector similarity search | `<=>` cosine distance on `vector(384)` columns, used for recommendations, ranking and talent search |
| JOIN / GROUP BY / HAVING / subqueries / window functions / set ops | Admin **SQL Lab** page ([`src/lib/showcase.ts`](src/lib/showcase.ts)) and dashboards |
| Validation at DB level | CHECK constraints, ENUMs, eligibility trigger, status-transition triggers |
| Audit trail | Generic JSONB audit trigger on `applications`, `offers` and `drives` |

The full write-up (ER diagram, schema, data dictionary, design justification, queries, testing) is in [`docs/REPORT.md`](docs/REPORT.md).

## Setup

### 1. Prerequisites
- Node.js 20+ (tested on Node 22)
- A PostgreSQL database with pgvector. The easiest option is a free [Neon](https://neon.tech) project, which has pgvector built in.

### 2. Install
```bash
git clone <this-repo-url>
cd placematch
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env`:
- `DATABASE_URL`: in the Neon dashboard, open your project, click **Connect**, and copy the connection string.
- `AUTH_SECRET`: any long random string. You can generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

Credentials are read only from environment variables and `.env` is git-ignored.

### 4. Create the schema and load demo data
```bash
npm run db:setup     # runs db/01..05 *.sql (drops and recreates everything)
npm run db:seed      # demo data + embeddings (first run downloads the ~25 MB model)
npm run test:db      # 26 database test cases, writes docs/test-results.md
```

### 5. Run
```bash
npm run dev
```
Open http://localhost:3000.

| Role | Email | Password |
|------|-------|----------|
| Admin (placement office) | admin@placematch.test | Admin@123 |
| Recruiter (Cobalt AI Labs) | recruiter@placematch.test | Recruiter@123 |
| Student | student@placematch.test | Student@123 |

All seeded students use `Student@123`, and every other company's recruiter is `hr.<companyname>@placematch.test` / `Recruiter@123`.

### Offline fallback (no Neon)
`npm run db:local` starts an embedded PostgreSQL (PGlite + pgvector) on port 5433 and keeps running. In another terminal, point `.env` at it and use the same commands:
```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable
```
This is handy if the network fails during the demo. Neon is the primary target.

## Project structure
```
db/                     SQL: schema, indexes, functions/procedures/triggers, views, audit
scripts/                db-setup, seed (+ seed-data), test-db, local-db
src/proxy.ts            role-based route protection
src/lib/db.ts           pg pool, transactions (sets app.user_id for the audit trigger), error mapping
src/lib/embeddings.ts   local sentence-embedding model
src/app/api/**          backend API (auth, student, recruiter, admin)
src/app/student|recruiter|admin/**   role dashboards
docs/                   report, test results, screenshots
```

## Demo walkthrough
1. **Student**: the dashboard shows recommended drives (vector search) and applications with their round progress. Under **Drives**, compare *Semantic* and *Keyword* search and try applying to a drive you're not eligible for (the trigger blocks it with a reason). Under **Profile**, editing the resume recomputes the embedding.
2. **Recruiter**: open *ML Engineer - NLP* to see applicants ranked by match score. Record round results (this calls the stored procedure). Clearing the last round creates an offer automatically. **Talent Search** puts semantic and full-text results side by side.
3. **Student**: accept the offer. The `sp_accept_offer` transaction declines other offers and withdraws applications the placement policy no longer allows.
4. **Admin**: the dashboard is built from views. **SQL Lab** runs the important queries live, **Audit Log** shows the trigger-written history, and **Companies** demonstrates an atomic insert and an FK RESTRICT on delete.
