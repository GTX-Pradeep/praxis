# Important queries

Every query here runs in the project, either from a SQL file under `db/sql/`, from the application code (file given), or on the admin **Analytics** page, where **Show query** displays it next to its live result.

To try them yourself:

```bash
docker exec -it praxis-postgres psql -U praxis_owner -d praxis
```

---

## 1. DDL

### CREATE: table with keys and constraints (`01_schema.sql`)

```sql
CREATE TABLE applications (
    application_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id      BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    opening_id      BIGINT NOT NULL REFERENCES openings(opening_id) ON DELETE CASCADE,
    sop             TEXT,
    match_score     NUMERIC(5,4),
    status          application_status NOT NULL DEFAULT 'applied',
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_application_once   UNIQUE (student_id, opening_id),
    CONSTRAINT chk_application_sop   CHECK (sop IS NULL OR length(sop) <= 2000),
    CONSTRAINT chk_application_score CHECK (match_score IS NULL OR match_score BETWEEN 0 AND 1)
);
```

### CREATE TYPE: closed value sets

```sql
CREATE TYPE application_status AS ENUM ('applied', 'shortlisted', 'offered',
                                        'accepted', 'rejected', 'withdrawn');
```

### ALTER: circular foreign key and generated column (`02_alter.sql`)

```sql
-- research_centers and faculty reference each other, so one FK is added afterwards
ALTER TABLE research_centers
    ADD CONSTRAINT fk_center_head
    FOREIGN KEY (head_faculty_id) REFERENCES faculty(faculty_id) ON DELETE SET NULL;

-- Full-text vector maintained by PostgreSQL itself
ALTER TABLE openings
    ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(domain, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;
```

### DROP: re-runnable setup (`01_schema.sql`)

```sql
DROP MATERIALIZED VIEW IF EXISTS mv_center_stats;
DROP TABLE IF EXISTS applications CASCADE;
DROP TYPE  IF EXISTS application_status CASCADE;
```

### CREATE INDEX: five kinds (`03_indexes.sql`)

```sql
CREATE UNIQUE INDEX uq_skills_name_lower ON skills (lower(name));                   -- expression, unique
CREATE INDEX idx_applications_opening_status ON applications (opening_id, status);   -- composite
CREATE INDEX idx_openings_open_deadline ON openings (deadline) WHERE status = 'open'; -- partial
CREATE INDEX idx_openings_search ON openings USING GIN (search_tsv);                  -- full-text
CREATE INDEX idx_openings_embedding ON openings USING hnsw (embedding vector_cosine_ops); -- vector
```

### Role with least privilege (`scripts/db-setup.mjs`)

```sql
CREATE ROLE praxis_app WITH LOGIN PASSWORD '…';
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO praxis_app;
REVOKE CREATE ON SCHEMA public FROM praxis_app;                         -- no DDL
REVOKE INSERT, UPDATE, DELETE ON application_status_history FROM praxis_app; -- trigger-only
```

---

## 2. DML

### INSERT: applying, with the score computed by a function (`api/applications/route.ts`)

```sql
INSERT INTO applications (student_id, opening_id, sop, match_score)
VALUES ($1, $2, $3, (SELECT total_score FROM fn_match_score($1, $2)))
RETURNING application_id;
```
The BEFORE INSERT trigger checks the deadline, CGPA, semester and ongoing internships; the AFTER INSERT triggers write the audit row and accept any invitation.

### INSERT … SELECT UNNEST: many rows in one statement (`api/student/skills/route.ts`)

```sql
INSERT INTO student_skills (student_id, skill_id, proficiency)
SELECT $1, s.skill_id, s.proficiency
FROM UNNEST($2::bigint[], $3::smallint[]) AS s(skill_id, proficiency);
```

### INSERT … ON CONFLICT: upsert (`05_procedures.sql`)

```sql
INSERT INTO center_success_profiles (center_id, embedding, intern_count, updated_at)
VALUES (p_center_id, v_vec, v_count, now())
ON CONFLICT (center_id) DO UPDATE
    SET embedding = EXCLUDED.embedding, intern_count = EXCLUDED.intern_count, updated_at = now();
```

### UPDATE: status change (state machine enforced by trigger) (`api/applications/[id]/route.ts`)

```sql
UPDATE applications SET status = 'shortlisted' WHERE application_id = $1;
-- UPDATE applications SET status = 'accepted' … from 'applied' fails:
-- ERROR: Illegal status change: applied -> accepted
```

### DELETE with a NOT EXISTS guard (`api/openings/[id]/route.ts`)

```sql
DELETE FROM openings o
WHERE o.opening_id = $1 AND o.faculty_id = $2
  AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.opening_id = o.opening_id);
```

---

## 3. Joins, grouping and aggregates

### Multi-table JOIN with LEFT JOIN + GROUP BY + FILTER: pipeline view (`06_views.sql`)

```sql
CREATE OR REPLACE VIEW v_opening_pipeline AS
SELECT o.opening_id, o.title, rc.name AS center_name, f.full_name AS faculty_name,
       o.status, o.seats_total, o.seats_filled,
       COUNT(a.application_id)                          AS total_applications,
       COUNT(*) FILTER (WHERE a.status = 'shortlisted') AS shortlisted,
       COUNT(*) FILTER (WHERE a.status = 'offered')     AS offered,
       COUNT(*) FILTER (WHERE a.status = 'accepted')    AS accepted,
       ROUND(AVG(a.match_score), 3)                     AS avg_match_score
FROM openings o
JOIN research_centers rc ON rc.center_id = o.center_id
JOIN faculty f           ON f.faculty_id = o.faculty_id
LEFT JOIN applications a ON a.opening_id = o.opening_id
GROUP BY o.opening_id, rc.center_id, rc.name, f.full_name;
```

### GROUP BY + HAVING: oversubscribed openings (Analytics)

```sql
SELECT o.title, rc.name AS center, o.seats_total, COUNT(a.application_id) AS applicants
FROM openings o
JOIN research_centers rc ON rc.center_id = o.center_id
JOIN applications a      ON a.opening_id = o.opening_id
GROUP BY o.opening_id, rc.name
HAVING COUNT(a.application_id) > o.seats_total
ORDER BY applicants DESC;
```

### Subquery: students above the average proof-of-work (Analytics)

```sql
SELECT full_name, branch, semester, proof_score, momentum_score
FROM students
WHERE proof_score > (SELECT AVG(proof_score) FROM students)
ORDER BY proof_score DESC
LIMIT 8;
```

### CTE with LEFT JOINs: skill demand vs supply (Analytics)

```sql
WITH demand AS (
  SELECT os.skill_id, SUM(os.weight) AS demand, COUNT(*) AS openings
  FROM opening_skills os JOIN openings o ON o.opening_id = os.opening_id
  WHERE o.status = 'open'
  GROUP BY os.skill_id
), supply AS (
  SELECT skill_id, COUNT(*) AS students FROM student_skills GROUP BY skill_id
)
SELECT s.name, COALESCE(d.openings, 0) AS openings, COALESCE(d.demand, 0) AS demand,
       COALESCE(sp.students, 0) AS students,
       ROUND(COALESCE(d.demand, 0)::numeric / GREATEST(COALESCE(sp.students, 0), 1), 2) AS pressure
FROM skills s
LEFT JOIN demand d  ON d.skill_id  = s.skill_id
LEFT JOIN supply sp ON sp.skill_id = s.skill_id
WHERE d.demand IS NOT NULL OR sp.students IS NOT NULL
ORDER BY pressure DESC, demand DESC
LIMIT 12;
```

### Selection funnel from the audit table (Analytics)

```sql
SELECT new_status AS stage, COUNT(DISTINCT application_id) AS applications
FROM application_status_history
GROUP BY new_status
ORDER BY ARRAY_POSITION(ARRAY['applied','shortlisted','offered','accepted',
                              'rejected','withdrawn']::application_status[], new_status);
```

### Audit trail of one application, with who changed it

```sql
SELECT h.old_status, h.new_status, u.email AS changed_by, h.changed_at
FROM application_status_history h
LEFT JOIN users u ON u.user_id = h.changed_by
WHERE h.application_id = 1
ORDER BY h.changed_at;
```

### Materialized view (`06_views.sql`)

```sql
CREATE MATERIALIZED VIEW mv_center_stats AS
SELECT rc.center_id, rc.name AS center_name,
       COUNT(DISTINCT o.opening_id)                                          AS openings,
       COUNT(DISTINCT a.application_id)                                      AS applications,
       COUNT(DISTINCT a.application_id) FILTER (WHERE a.status = 'accepted') AS accepted,
       ROUND(AVG(i.final_rating), 2)                                         AS avg_intern_rating,
       now()                                                                 AS refreshed_at
FROM research_centers rc
LEFT JOIN openings o     ON o.center_id      = rc.center_id
LEFT JOIN applications a ON a.opening_id     = o.opening_id
LEFT JOIN internships i  ON i.application_id = a.application_id
GROUP BY rc.center_id, rc.name;

REFRESH MATERIALIZED VIEW CONCURRENTLY mv_center_stats;   -- via fn_refresh_center_stats()
```

---

## 4. Stored routines and the transaction

### Ranking every eligible student: function + CROSS JOIN LATERAL (`05_procedures.sql`)

```sql
SELECT s.student_id, s.full_name, m.sem_score, m.success_score, m.skill_score,
       m.proof_part, m.total_score, m.matched_skills, a.status
FROM students s
CROSS JOIN LATERAL fn_match_score(s.student_id, p_opening_id) m
LEFT JOIN applications a ON a.student_id = s.student_id AND a.opening_id = p_opening_id
WHERE fn_is_eligible(s.student_id, p_opening_id)
ORDER BY m.total_score DESC, s.cgpa DESC
LIMIT p_limit;

-- Try it:
SELECT full_name, total_score, sem_score, success_score, skill_score, proof_part
FROM fn_rank_candidates((SELECT opening_id FROM openings WHERE title LIKE 'Brain MRI%'), 5);
```

### Transaction with row locks: accepting an offer (`sp_accept_offer`)

```sql
BEGIN;
SELECT set_config('app.current_user_id', '42', true);   -- who is acting, for the audit trigger
CALL sp_accept_offer(17, 42);
COMMIT;
```
Inside the procedure:
```sql
SELECT * INTO v_app     FROM applications WHERE application_id = p_application_id FOR UPDATE;
SELECT * INTO v_opening FROM openings     WHERE opening_id = v_app.opening_id     FOR UPDATE;
IF v_opening.seats_filled >= v_opening.seats_total THEN
    RAISE EXCEPTION 'No seats left in opening %', v_opening.opening_id USING ERRCODE = 'check_violation';
END IF;
UPDATE applications SET status = 'accepted' WHERE application_id = p_application_id;
UPDATE openings     SET seats_filled = seats_filled + 1 WHERE opening_id = v_opening.opening_id;
INSERT INTO internships (application_id, start_date) VALUES (p_application_id, CURRENT_DATE);
UPDATE applications SET status = 'withdrawn'
WHERE student_id = p_student_id AND application_id <> p_application_id
  AND status IN ('applied', 'shortlisted', 'offered');
```
A second student racing for the same seat waits on the `FOR UPDATE` lock, then sees `seats_filled = seats_total` and fails; their whole transaction rolls back.

### Trigger example: blocking an illegal status jump

```sql
UPDATE applications SET status = 'accepted'
WHERE application_id = (SELECT MIN(application_id) FROM applications WHERE status = 'applied');
-- ERROR: Illegal status change: applied -> accepted
```

---

## 5. Full-text and vector search

### Hybrid search: keywords OR meaning, in one query (`student/openings/page.tsx`)

```sql
WITH base AS (
  SELECT o.*,
         (o.search_tsv @@ plainto_tsquery('english', $2)) AS keyword_hit,
         1 - (o.embedding <=> $5::vector)                  AS similarity
  FROM openings o
  WHERE o.status = 'open' AND o.deadline > now()
)
SELECT b.opening_id, b.title, rc.name AS center_name,
       fn_is_eligible($1, b.opening_id) AS eligible, b.keyword_hit, b.similarity,
       m.total_score AS match
FROM base b
JOIN research_centers rc ON rc.center_id = b.center_id
CROSS JOIN LATERAL fn_match_score($1, b.opening_id) m
WHERE b.keyword_hit OR b.similarity > 0.25
ORDER BY b.similarity + CASE WHEN b.keyword_hit THEN 0.3 ELSE 0 END DESC;
```
`$5` is the search text turned into a vector by the same embedding model.

### Full-text ranking only

```sql
SELECT title, ts_rank(search_tsv, q) AS rank
FROM openings, plainto_tsquery('english', 'retinal image classification') q
WHERE search_tsv @@ q
ORDER BY rank DESC;
```

### Nearest openings to another opening, using the HNSW index

```sql
SET enable_seqscan = off;   -- the table is small, so force the index to show the plan
EXPLAIN SELECT title FROM openings
ORDER BY embedding <=> (SELECT embedding FROM openings LIMIT 1)
LIMIT 5;
-- Index Scan using idx_openings_embedding on openings
```

### Averaging vectors: a lab's success profile (`sp_refresh_success_profile`)

```sql
SELECT AVG(se.embedding), COUNT(DISTINCT se.student_id)
FROM student_embeddings se
WHERE se.student_id IN (
    SELECT a.student_id
    FROM internships i
    JOIN applications a ON a.application_id = i.application_id
    JOIN openings o     ON o.opening_id     = a.opening_id
    WHERE o.center_id = p_center_id AND i.final_rating >= 4
);
```

---

## 6. MongoDB

### Proof-of-work score (`src/lib/proof.ts`, simplified)

```js
db.github_profiles.aggregate([
  { $match: { student_id: NumberLong(42) } },
  { $project: {
      total_repos: { $size: "$repos" },
      original: { $filter: { input: "$repos", as: "r", cond: { $eq: ["$$r.is_fork", false] } } } } },
  { $set: {
      original_repos: { $size: "$original" },
      own_commits:   { $sum: "$original.own_commits" },
      total_commits: { $sum: "$original.total_commits" } } },
  { $set: {
      originality: { $divide: ["$original_repos", "$total_repos"] },
      authorship:  { $divide: ["$own_commits", "$total_commits"] },
      consistency: { $min: [1, { $divide: ["$active_weeks", 26] }] },
      volume:      { $min: [1, { $divide: ["$original_repos", 5] }] } } },
  { $set: { score: { $round: [{ $add: [
      { $multiply: ["$consistency", 40] }, { $multiply: ["$volume", 30] },
      { $multiply: ["$originality", 15] }, { $multiply: ["$authorship", 15] } ] }, 1] } } }
])
```

### Momentum from monthly snapshots (`src/lib/momentum.ts`, simplified)

```js
db.profile_snapshots.aggregate([
  { $match: { student_id: NumberLong(42), month: { $gte: "2026-05" } } },
  { $sort: { month: 1 } },
  { $group: { _id: "$student_id",
              first: { $first: { month: "$month", score: "$proof_score" } },
              last:  { $last:  { month: "$month", score: "$proof_score" } } } }
  // then: (last.score - first.score) / months between them
])
```

### Languages across all students (Analytics)

```js
db.github_profiles.aggregate([
  { $project: { student_id: 1, langs: { $objectToArray: "$language_totals" } } },
  { $unwind: "$langs" },
  { $group: { _id: "$langs.k", bytes: { $sum: "$langs.v" }, students: { $addToSet: "$student_id" } } },
  { $project: { language: "$_id", bytes: 1, students: { $size: "$students" } } },
  { $sort: { students: -1, bytes: -1 } },
  { $limit: 10 }
])
```

### Activity in the last 7 days (Analytics)

```js
db.activity_logs.aggregate([
  { $match: { ts: { $gte: ISODate("…7 days ago…") } } },
  { $group: { _id: "$action", count: { $sum: 1 }, last: { $max: "$ts" } } },
  { $sort: { count: -1 } }
])
```

### Upsert one resume per student (`api/student/resume/route.ts`)

```js
db.resumes.replaceOne(
  { student_id: NumberLong(42) },
  { student_id: NumberLong(42), raw_text: "…", file: { name: "cv.pdf", size: 81234 },
    sections: {…}, parsed_at: new Date() },
  { upsert: true }
)
```
