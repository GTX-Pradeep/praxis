# Demo guide

How to load the demo dataset, who to log in as, and an 8-minute walkthrough that shows every feature and the database concept behind it.

## Load the demo data

Start from a clean database (this deletes all existing data):

```bash
npm run db:setup      # recreate PostgreSQL schema and MongoDB collections
npm run db:seed       # admin account, 5 research centers, 31 skills
npm run dev           # terminal 1: start the app and leave it running
npm run db:demo       # terminal 2: load demo data, then compute vectors and scores
```

`db:demo` loads the data, then asks the running app to **rebuild matching data** (vectors, proof-of-work, momentum, success profiles, match alerts). The first run downloads the embedding model (~23 MB), so allow a minute. If the app wasn't running, log in as admin and click **Rebuild matching data** on the Overview page.

### What gets loaded

| Data | Amount |
|---|---|
| Research labs | 6 (5 seeded + 1 new lab awaiting approval) |
| Faculty | 8 (7 verified, 1 pending) |
| Students | 48, each with skills; 45 resumes and 44 GitHub profiles in MongoDB |
| Monthly growth snapshots | ~235 documents (up to 6 months per student) |
| Open openings | 12, with about 40 applications at every stage (applied, shortlisted, offered, rejected, withdrawn) |
| Completed internships | 5, rated 3–5, with skill endorsements |
| Ongoing internship | 1 (to complete live) |
| Invitations | 3 (2 pending, 1 declined) |
| Activity log | 140 entries over the last 7 days |

Everything is inserted through the real tables, constraints and triggers (status changes, `sp_accept_offer`, ratings, endorsements). Only timestamps are moved into the past afterwards so the history looks natural. All names, emails and GitHub accounts are invented.

## Accounts

All demo accounts use the password **`Demo@1234`** (set `DEMO_PASSWORD` in `.env.local` before running `db:demo` to change it). The admin uses `SEED_ADMIN_PASSWORD` from `.env.local`.

| Role | Email | Why they're interesting |
|---|---|---|
| Admin | `admin@praxis.local` | Approvals, analytics, rebuild |
| Faculty, Medical AI head | `meera.krishnan@praxis.demo` | Main demo account: 2 open openings, success profile, ongoing intern, match alerts |
| Faculty, NLP | `neha.gupta@praxis.demo` | Campus Q&A opening, where Sneha applied |
| Faculty, NLP head | `lakshmi.venkatesh@praxis.demo` | Kannada speech and legal summarisation openings |
| Faculty, Cloud head | `farhan.siddiqui@praxis.demo` | Kubernetes and Spark openings |
| Faculty, Robotics head | `anitha.raghavan@praxis.demo` | Intern rated 3, so no success profile yet |
| Faculty, Cyber Security | `rajesh.kumar@praxis.demo` | Malware and intrusion-detection openings |
| Faculty, **pending** | `kavya.nair@praxis.demo` | Registered a new "Quantum Computing Lab", waiting for admin |
| Student | `ananya.iyer@praxis.demo` | Past intern rated 5, verified skills |
| Student | `vikram.hegde@praxis.demo` | Past intern rated 5, ranks #1 for Brain MRI |
| Student | `karthik.rao@praxis.demo` | Holds an offer for the 1-seat retinopathy opening |
| Student | `divya.menon@praxis.demo` | Holds an offer for the **same** seat |
| Student | `rahul.verma@praxis.demo` | Impressive resume, but GitHub is forks + one night of commits (proof 14/100) |
| Student | `sneha.patil@praxis.demo` | 2nd-year, momentum +18 proof points/month |
| Student | `arjun.shetty@praxis.demo` | Currently interning with Dr. Meera |
| Student | `nikhil.agarwal@praxis.demo` | Strong web developer, wrong field for medical imaging |
| Student | `tara.fernandes@praxis.demo` | Strong candidate who hadn't applied; Dr. Meera has invited her |

Use a normal window for one account and an incognito window for another.

## 8-minute walkthrough

### 1. The problem and the idea (30 s)
Labs recruit by forwarding PDFs; resumes are claims. Praxis ranks students by **proven** work: GitHub history, faculty endorsements, and similarity to each lab's best past interns.

### 2. Faculty sees ranked candidates (1.5 min)
Log in as **Dr. Meera** → open **Brain MRI tumour segmentation intern**.

- **Suggested candidates** ranks every eligible student, including those who haven't applied. Point at the four bars: semantic similarity (pgvector), similarity to past top interns, required skills, proof-of-work (MongoDB aggregation).
- Scroll to **Rahul Verma**: his resume is the most similar text of anyone, but his GitHub is 7 forks and one copied repo pushed in a single week (proof-of-work **14%**), so his self-claimed skills count for less. He ranks below every real medical student.
- **Nikhil Agarwal** has high proof-of-work but builds web apps, so he ranks near the bottom.
- Click **Like my best interns**: the ranking reorders by similarity to the lab's success profile, the average vector of interns rated 4–5.
- Click **Rahul's name** to open his **evidence page**: 7 forks flagged as not his work, one repo where he wrote 46 of 160 commits in a single week, only two months of history, and every skill only "self-rated". Compare with **Ananya**: repos ranked by relevance to this opening, skills **✓ verified by Dr. Meera**, a 5-star internship with remarks.

*Database concepts: stored function `fn_rank_candidates` with `CROSS JOIN LATERAL`, pgvector cosine distance `<=>`, HNSW index.*

### 3. Two students, one seat (1 min)
Window A: **Karthik**; window B: **Divya**. Both open **Applications** → **Accept offer** on Diabetic retinopathy grading. Click both as close together as you can.

One succeeds; the other gets **"No seats left"**, and their application stays "offered" (the failed transaction rolled back). The opening is now "filled".

*Concepts: transaction in `sp_accept_offer`, `SELECT … FOR UPDATE` row lock, trigger `trg_auto_fill_opening`, rollback.*

> This uses up the seat. To run it again, reload the demo (see the end).

### 4. Inviting a candidate who hasn't applied (45 s)
Still on Brain MRI: **Tara Fernandes** shows **Invited · pending**. Click **Invite to apply** on any other strong candidate to show the form.

Log in as **Tara**: the dashboard says *A lab invited you to apply* with Dr. Meera's note. Open it, apply, and the invitation becomes **accepted** automatically.

*Concepts: `invitations` table with a UNIQUE pair constraint, `trg_validate_invitation` (only the opening's owner, only eligible students, never someone who already applied) and `trg_accept_invitation_on_apply`.*

### 5. Outcomes feed back into matching (1 min)
As **Dr. Meera** → **Interns** → **Arjun Shetty** → **Complete & rate**: give 5 stars, endorse PyTorch, save.

- The rating trigger calls `sp_refresh_success_profile`, which recomputes the lab's success profile.
- Arjun's profile now shows **✓ Verified** skills, which count double in future matching.
- Trying to endorse before the internship ends, or as another faculty member, is rejected by `trg_validate_endorsement`.

### 6. Student side (1 min)
Log in as **Sneha**:
- **Openings** → search *deep learning on brain scans*: results come from both full-text search and meaning (tagged "Matches by meaning"). Brain MRI shows **Not eligible** with the exact reason (semester 3).
- **Dashboard**: recommendations, each with a skill-gap hint (e.g. "adding Networking would raise your match").
- **Profile**: growth chart and momentum from monthly snapshots in MongoDB.

### 7. Match alerts (30 s)
Back as **Dr. Meera** → **Alerts**: students whose updated profiles crossed each opening's threshold (`fn_check_alerts`). Sneha's **↑ +18/month** also appears next to her name in candidate lists.

### 8. Admin (1 min)
Log in as **admin**:
- **Overview**: approve **Dr. Kavya Nair**, who registered a new lab (tagged "new lab, head").
- **Analytics**: each panel has **Show query**: materialized view, CTE with LEFT JOIN, GROUP BY + HAVING, subquery, and two MongoDB aggregation pipelines.

## Queries to run live in psql (optional)

```bash
docker exec -it praxis-postgres psql -U praxis_owner -d praxis
```

```sql
-- Ranked candidates with the score breakdown
SELECT full_name, total_score, sem_score, success_score, skill_score, proof_part
FROM fn_rank_candidates((SELECT opening_id FROM openings WHERE title LIKE 'Brain MRI%'), 5);

-- Full audit trail of one application, written by a trigger
SELECT h.old_status, h.new_status, u.email AS changed_by, h.changed_at
FROM application_status_history h
LEFT JOIN users u ON u.user_id = h.changed_by
WHERE h.application_id = (SELECT MIN(application_id) FROM applications)
ORDER BY h.changed_at;

-- A trigger blocking an illegal status jump (applied → accepted)
UPDATE applications SET status = 'accepted'
WHERE application_id = (SELECT MIN(application_id) FROM applications WHERE status = 'applied');

-- The vector index in use (small tables default to a sequential scan, so turn it off to show the plan)
SET enable_seqscan = off;
EXPLAIN SELECT title FROM openings
ORDER BY embedding <=> (SELECT embedding FROM openings LIMIT 1) LIMIT 5;
```

## Notes

- Demo GitHub usernames (`praxis-demo-…`) are invented, so **Sync GitHub** won't find them for demo students. To show a live sync, register your own student account with your real GitHub username.
- Resume upload works for any account: upload a text-based PDF.
- To reset everything and load the demo again, repeat the four commands at the top.
