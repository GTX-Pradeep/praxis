# Praxis

**Proof-based research talent matching.**

Praxis matches university research labs with student interns by what students have *proven*, not what they claim: verified GitHub work, faculty-endorsed skills, and similarity to each lab's best past interns. Students and labs are permanent users, so the platform keeps matching as profiles grow.

DBMS Level 3 project — Next.js, PostgreSQL + pgvector, MongoDB.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js Route Handlers (`src/app/api/...`) |
| Relational DB | PostgreSQL 16 with pgvector, raw parameterized SQL via `pg` |
| Document DB | MongoDB 7 |
| Auth | bcrypt password hashes, signed JWT in an httpOnly cookie, role checks in `src/proxy.ts` and every route |

## Prerequisites

- Node.js 20 or newer
- Docker Desktop (runs PostgreSQL and MongoDB locally)
- Git

## Setup

```bash
# 1. Install packages
npm install

# 2. Create your local config (never commit .env.local)
cp .env.example .env.local
#    then edit .env.local: set AUTH_SECRET and SEED_ADMIN_PASSWORD
#    generate a secret with:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Start the databases
docker compose up -d

# 4. Create all tables, triggers, procedures, views and Mongo collections
npm run db:setup

# 5. Add the admin account, research centers and skills
npm run db:seed

# 6. Run the app
npm run dev
```

Open http://localhost:3000. Log in as the admin from `.env.local`, or register as a student or faculty member.

> If you change the database passwords in `.env.local`, change them in `docker-compose.yml` too (and run `docker compose down -v` once to reset the volumes).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Production build (type-checks everything) |
| `npm run db:setup` | Drop and recreate the PostgreSQL schema, create the restricted app user, set up MongoDB collections |
| `npm run db:seed` | Insert the admin account, research centers and skill catalogue |
| `npm run db:test` | Run 28 database tests on an in-memory PostgreSQL (no Docker needed) |

## Project structure

```
db/
  sql/
    01_schema.sql       CREATE/DROP: 16 tables, enums, keys, CHECK constraints
    02_alter.sql        ALTER: circular FK, generated full-text column
    03_indexes.sql      B-tree, partial, unique, GIN and HNSW (vector) indexes
    04_triggers.sql     application rules, status state machine, audit trail, auto-fill
    05_procedures.sql   match score, ranking, offer transaction, success profiles, alerts
    06_views.sql        dashboard views and a materialized view
  mongo/
    collections.mjs     collections, $jsonSchema validators, indexes (incl. TTL)
scripts/
  db-setup.mjs  db-seed.mjs  db-test.mjs
src/
  proxy.ts              role-based route protection
  lib/                  db.ts (pool + transactions), mongo.ts, session.ts, token.ts, validation.ts
  app/
    api/                auth, centers, admin route handlers
    student/ faculty/ admin/   role dashboards
    login/ register/
```

## Why three database paradigms

| Data | Store | Reason |
|---|---|---|
| Users, openings, applications, internships | PostgreSQL | Fixed structure, many relationships, strict rules (unique applications, seat limits, one accepted offer) that need constraints and ACID transactions |
| Resumes, GitHub snapshots, monthly profile snapshots, activity logs | MongoDB | Shape varies per student (2 repos or 60, nested languages and topics); stored as fetched, analysed with aggregation pipelines |
| Embeddings of openings, resumes and repos | pgvector | Matching by meaning; lives next to relational data so one query can filter by eligibility and rank by similarity |

## Security

- Passwords stored only as bcrypt hashes (enforced by a CHECK constraint)
- Sessions are signed JWTs in httpOnly, SameSite cookies; tampered or expired tokens are rejected
- Every protected page and API route re-checks the user's role in the database
- All SQL uses parameters (`$1, $2`), never string concatenation
- The app connects as a restricted PostgreSQL role with no DDL rights; the audit table is trigger-only
- Secrets live in `.env.local`, which git ignores

## Team

| Member | Responsibilities |
|---|---|
| _Name 1_ | |
| _Name 2_ | |
