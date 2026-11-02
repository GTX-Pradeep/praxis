# Praxis

**Proof-based research talent matching.**

Praxis matches university research labs with student interns by what students have *proven*, not what they claim: verified GitHub work, faculty-endorsed skills, and similarity to each lab's best past interns. Students and labs are permanent users, so the platform keeps matching as profiles grow.

DBMS Level 3 project · Next.js 16 · PostgreSQL 16 + pgvector · MongoDB 7

📄 **[Project report](docs/REPORT.md)** · [ER diagram](docs/diagrams/er-diagram.png) · [Data dictionary](docs/data-dictionary.md) · [Important queries](docs/queries.md) · [Testing](docs/testing.md) · [Semantic matching](docs/semantic-matching.md) · [Demo guide](docs/demo-guide.md)

---

## Features

**Students**
- Profile with skills and proficiency, resume PDF upload (text extracted and split into sections), GitHub sync
- **Proof-of-work score** (0–100) from GitHub history, computed by a MongoDB aggregation: consistency, volume, originality, authorship
- **Momentum** and a monthly growth chart from profile snapshots
- Search openings by keyword (**full-text**) and by meaning (**vector search**); exact reason shown when not eligible
- Recommendations with skill-gap hints; invitations from labs
- Apply, track each status change, accept an offer (**transaction**) or withdraw

**Faculty**
- Register into a lab or create a new one (admin verifies)
- Post openings with weighted skills, seats, CGPA cut-off, eligible semesters, deadline and alert threshold
- **Ranked candidates** for each opening, including students who never applied, with a breakdown: semantic similarity, similarity to the lab's best past interns, skills, proof-of-work
- **Evidence page** per student: repositories ranked by relevance, forks flagged, growth chart, verified skills, past ratings
- Shortlist, offer, reject; **invite** strong candidates; **match alerts** when a student grows into a match
- Complete internships with a rating and **skill endorsements**, which update the lab's **success profile**

**Admin**
- Verify faculty and new labs; overview of users, labs and vector coverage
- **Analytics** with a "Show query" button on every panel: materialized view, CTE, GROUP BY + HAVING, subquery, MongoDB pipelines
- Rebuild all matching data (vectors, scores, success profiles, alerts)

## Database concepts used

| Concept | Where |
|---|---|
| DDL: CREATE, ALTER, DROP, PK, FK, UNIQUE, CHECK, ENUM | `db/sql/01_schema.sql`, `02_alter.sql` (17 tables, 26 FKs, 30 CHECKs) |
| Indexes: B-tree, composite, partial, expression, GIN, HNSW | `db/sql/03_indexes.sql` |
| Triggers (9) | validation, status state machine, audit trail, auto-fill seats, endorsement and invitation rules, success-profile refresh |
| Stored functions and procedures | eligibility, hybrid match score, ranking, `sp_accept_offer`, success profile, alerts |
| Transactions with row locks | `sp_accept_offer` (`SELECT … FOR UPDATE`), `withTransaction()` in `src/lib/db.ts` |
| Views and a materialized view | `db/sql/06_views.sql` |
| Full-text search | generated `tsvector` column + GIN index |
| Vector similarity search | pgvector `vector(384)`, cosine distance `<=>`, HNSW |
| NoSQL validation and aggregation | `db/mongo/collections.mjs` (`$jsonSchema`, TTL index), `src/lib/proof.ts`, `src/lib/momentum.ts` |
| Least-privilege database role | `praxis_app`: no DDL, cannot write the audit table |

## Why three database paradigms

| Data | Store | Reason |
|---|---|---|
| Users, labs, openings, applications, internships, endorsements, invitations | PostgreSQL | Fixed structure, many relationships, rules that must never break (unique applications, seat limits, legal status changes), so it needs constraints, triggers and ACID transactions |
| Resumes, GitHub snapshots, monthly snapshots, activity logs | MongoDB | Shape varies per student (2 repos or 60, nested languages and topics); stored as fetched and analysed with aggregation pipelines |
| Embeddings of openings, resumes, repositories, lab success profiles | pgvector | Matching by meaning next to the relational data, so one query filters by eligibility and ranks by similarity |

Full justification: [report §7](docs/REPORT.md#7-database-choice-and-justification).

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js Route Handlers (`src/app/api/...`), zod validation |
| Relational + vector | PostgreSQL 16 with pgvector, raw parameterised SQL via `pg` |
| Document DB | MongoDB 7 |
| Embeddings | `all-MiniLM-L6-v2` (384-d) run locally with Transformers.js; no API key |
| Auth | bcrypt hashes, signed JWT in an httpOnly cookie, role checks in `src/proxy.ts` and every route |

## Prerequisites

- Node.js 20 or newer
- Docker Desktop (runs PostgreSQL and MongoDB)
- Git

## Setup

```bash
# 1. Install packages
npm install

# 2. Create your local config (never commit .env.local)
cp .env.example .env.local
#    edit .env.local: set AUTH_SECRET and SEED_ADMIN_PASSWORD
#    generate a secret with:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Start the databases (wait ~10 s the first time)
docker compose up -d

# 4. Create all tables, triggers, procedures, views and Mongo collections
npm run db:setup

# 5. Add the admin account, research centers and skills
npm run db:seed

# 6. Run the app
npm run dev
```

Open http://localhost:3000 and log in as the admin from `.env.local`, or register as a student or faculty member.

### Load the demo data (optional)

With the app running, in a second terminal:

```bash
npm run db:demo
```

This adds 48 students, 8 faculty, 12 open openings, applications at every stage, past internships with ratings, invitations and activity, then computes all vectors and scores. All demo accounts use the password `Demo@1234`. See the **[demo guide](docs/demo-guide.md)** for accounts and an 8-minute walkthrough.

> If you change the database passwords in `.env.local`, change them in `docker-compose.yml` too and run `docker compose down -v` once to reset the volumes.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Production build (type-checks everything) |
| `npm run lint` | ESLint |
| `npm run db:setup` | Drop and recreate the PostgreSQL schema, create the restricted app role, set up MongoDB collections |
| `npm run db:seed` | Insert the admin account, research centers and skill catalogue |
| `npm run db:demo` | Load the demo dataset and compute matching data (app must be running) |
| `npm run db:test` | 40 database tests on an in-memory PostgreSQL (no Docker needed) |

## Project structure

```
db/
  sql/
    01_schema.sql       DROP + CREATE: 17 tables, enums, keys, CHECK constraints
    02_alter.sql        ALTER: circular FK, generated full-text column
    03_indexes.sql      B-tree, composite, partial, unique, GIN and HNSW indexes
    04_triggers.sql     application rules, state machine, audit trail, auto-fill, endorsements, invitations
    05_procedures.sql   eligibility, match score, ranking, offer transaction, success profiles, alerts
    06_views.sql        dashboard views and a materialized view
  mongo/
    collections.mjs     collections, $jsonSchema validators, indexes (incl. TTL)
docs/                   report, ER + architecture diagrams, data dictionary, queries, testing, demo guide
scripts/
  db-setup.mjs  db-seed.mjs  db-test.mjs  db-demo.mjs  demo-data.mjs
src/
  proxy.ts              role-based route protection
  lib/                  db, mongo, session/token, validation, github, resume, embed, vectors,
                        proof, momentum, scores, rebuild
  components/           dashboard shell, score breakdown, growth chart, buttons
  app/
    api/                22 route handlers
    student/  faculty/  admin/   role dashboards
    login/  register/
```

## Security

- Passwords stored only as bcrypt hashes (a CHECK constraint rejects anything else)
- Sessions are signed JWTs in httpOnly, SameSite cookies; tampered or expired tokens are rejected
- Every protected page and API route re-checks the user's role in the database
- All SQL uses parameters (`$1, $2`), never string concatenation
- The app connects as a restricted PostgreSQL role with no DDL rights; the audit table is trigger-only
- Secrets live in `.env.local`, which git ignores


