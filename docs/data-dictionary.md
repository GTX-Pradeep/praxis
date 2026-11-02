# Data dictionary

Generated from the live schema (`db/sql/*.sql`) so it always matches the database. Key: **PK** primary key, **FK** foreign key, **UQ** unique, **NN** not null.

## Enumerated types

| Type | Values |
|---|---|
| `application_status` | applied, shortlisted, offered, accepted, rejected, withdrawn |
| `embedding_source` | resume, github |
| `invitation_status` | pending, accepted, declined |
| `opening_status` | open, closed, filled |
| `user_role` | admin, faculty, student |

## Tables

### 1. `users`

Login account for every person. Role decides which dashboard they get.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `user_id` | bigint | PK, NN | `identity` | Surrogate key; also the PK of the matching students/faculty row |
| `email` | character varying(255) | UQ, NN |  | Login email, stored lowercase |
| `password_hash` | character(60) | NN |  | bcrypt hash (60 chars); plain text is rejected by a CHECK |
| `role` | user_role | NN |  | admin, faculty or student |
| `is_active` | boolean | NN | `true` | Deactivated users can't log in and are never ranked |
| `created_at` | timestamp with time zone | NN | `now()` | Registration time |

**CHECK constraints**

- `chk_users_email_format`: `(((email)::text ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'::text))`
- `chk_users_email_lowercase`: `(((email)::text = lower((email)::text)))`
- `chk_users_bcrypt`: `((password_hash ~~ '$2%'::text))`

### 2. `research_centers`

A research lab or centre at the university.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `center_id` | bigint | PK, NN | `identity` | Surrogate key |
| `name` | character varying(150) | UQ, NN |  | Lab name |
| `description` | text |  |  | What the lab works on |
| `head_faculty_id` | bigint | FK → faculty.faculty_id |  | Faculty member who heads the lab (circular FK, added by ALTER) |
| `created_at` | timestamp with time zone | NN | `now()` | When the lab was created |

**CHECK constraints**

- `chk_center_name_len`: `((length(TRIM(BOTH FROM name)) >= 3))`

**On delete:** head_faculty_id → SET NULL

### 3. `faculty`

Faculty profile (1:1 subtype of users).

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `faculty_id` | bigint | PK, FK → users.user_id, NN |  | Same value as users.user_id |
| `center_id` | bigint | FK → research_centers.center_id |  | Lab the faculty member belongs to |
| `full_name` | character varying(120) | NN |  | Display name |
| `designation` | character varying(80) |  |  | e.g. Associate Professor |
| `is_verified` | boolean | NN | `false` | Set by an admin; only verified faculty can post openings |

**On delete:** faculty_id → CASCADE; center_id → SET NULL

### 4. `students`

Student profile (1:1 subtype of users). Permanent: it keeps growing across semesters.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `student_id` | bigint | PK, FK → users.user_id, NN |  | Same value as users.user_id |
| `srn` | character varying(20) | UQ, NN |  | University registration number |
| `full_name` | character varying(120) | NN |  | Display name |
| `branch` | character varying(60) | NN |  | e.g. CSE, ECE |
| `semester` | smallint | NN |  | Current semester 1–8 |
| `cgpa` | numeric(4,2) | NN |  | 0–10 |
| `github_username` | character varying(39) | UQ |  | Linked GitHub account (validated format) |
| `proof_score` | numeric(5,2) | NN | `0` | Proof-of-work 0–100, computed by a MongoDB aggregation |
| `momentum_score` | numeric(6,2) | NN | `0` | Change in proof score per month over the last 6 months |
| `profile_updated_at` | timestamp with time zone | NN | `now()` | Touched by a trigger whenever skills change |

**CHECK constraints**

- `chk_students_semester`: `(((semester >= 1) AND (semester <= 8)))`
- `chk_students_cgpa`: `(((cgpa >= (0)::numeric) AND (cgpa <= (10)::numeric)))`
- `chk_students_proof`: `(((proof_score >= (0)::numeric) AND (proof_score <= (100)::numeric)))`
- `chk_students_github`: `(((github_username)::text ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$'::text))`

**On delete:** student_id → CASCADE

### 5. `skills`

Catalogue of skills.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `skill_id` | bigint | PK, NN | `identity` | Surrogate key |
| `name` | character varying(60) | NN |  | Skill name (unique ignoring case) |
| `category` | character varying(40) | NN | `'general'` | Group shown in the UI, e.g. ml, web |

**CHECK constraints**

- `chk_skill_name_len`: `((length(TRIM(BOTH FROM name)) >= 1))`

### 6. `student_skills`

Skills a student claims, with self-rated level (M:N students–skills).

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `student_id` | bigint | PK, FK → students.student_id, NN |  | Student |
| `skill_id` | bigint | PK, FK → skills.skill_id, NN |  | Skill |
| `proficiency` | smallint | NN |  | Self-rated 1–5 |

**CHECK constraints**

- `chk_student_skill_prof`: `(((proficiency >= 1) AND (proficiency <= 5)))`

**On delete:** student_id → CASCADE; skill_id → CASCADE

### 7. `openings`

An internship requirement posted by a lab.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `opening_id` | bigint | PK, NN | `identity` | Surrogate key |
| `center_id` | bigint | FK → research_centers.center_id, NN |  | Lab offering it |
| `faculty_id` | bigint | FK → faculty.faculty_id, NN |  | Faculty member who posted it and supervises |
| `title` | character varying(150) | NN |  | Short title |
| `description` | text | NN |  | Full description (embedded as a vector) |
| `domain` | character varying(80) | NN |  | Research area |
| `seats_total` | smallint | NN |  | Seats offered, 1–50 |
| `seats_filled` | smallint | NN | `0` | Seats taken; never above seats_total |
| `min_cgpa` | numeric(4,2) | NN | `0` | Eligibility cut-off |
| `duration_weeks` | smallint | NN |  | 1–52 |
| `stipend` | integer | NN | `0` | INR per month |
| `deadline` | timestamp with time zone | NN |  | Last moment to apply; must be after creation |
| `status` | opening_status | NN | `'open'` | open, closed or filled (set to filled by trigger) |
| `alert_threshold` | numeric(4,3) | NN | `0.750` | Match score that triggers an alert to the faculty |
| `embedding` | vector(384) |  |  | 384-d vector of title + domain + description |
| `created_at` | timestamp with time zone | NN | `now()` | Posting time |
| `search_tsv` | tsvector |  | `generated` | Generated full-text vector (title/domain weight A, description B) |

**CHECK constraints**

- `chk_openings_title`: `((length(TRIM(BOTH FROM title)) >= 5))`
- `chk_openings_desc`: `((length(TRIM(BOTH FROM description)) >= 30))`
- `chk_openings_seats`: `(((seats_total >= 1) AND (seats_total <= 50)))`
- `chk_openings_filled`: `(((seats_filled >= 0) AND (seats_filled <= seats_total)))`
- `chk_openings_cgpa`: `(((min_cgpa >= (0)::numeric) AND (min_cgpa <= (10)::numeric)))`
- `chk_openings_duration`: `(((duration_weeks >= 1) AND (duration_weeks <= 52)))`
- `chk_openings_stipend`: `((stipend >= 0))`
- `chk_openings_deadline`: `((deadline > created_at))`
- `chk_openings_threshold`: `(((alert_threshold >= (0)::numeric) AND (alert_threshold <= (1)::numeric)))`

**On delete:** center_id → RESTRICT; faculty_id → RESTRICT

### 8. `opening_skills`

Skills an opening needs, with importance (M:N openings–skills).

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `opening_id` | bigint | PK, FK → openings.opening_id, NN |  | Opening |
| `skill_id` | bigint | PK, FK → skills.skill_id, NN |  | Skill |
| `weight` | smallint | NN | `3` | Importance 1–5 |

**CHECK constraints**

- `chk_opening_skill_weight`: `(((weight >= 1) AND (weight <= 5)))`

**On delete:** opening_id → CASCADE; skill_id → RESTRICT

### 9. `opening_eligible_semesters`

Semesters allowed to apply (multi-valued attribute). No rows = all semesters.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `opening_id` | bigint | PK, FK → openings.opening_id, NN |  | Opening |
| `semester` | smallint | PK, NN |  | Allowed semester 1–8 |

**CHECK constraints**

- `chk_eligible_semester`: `(((semester >= 1) AND (semester <= 8)))`

**On delete:** opening_id → CASCADE

### 10. `applications`

A student's application to an opening.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `application_id` | bigint | PK, NN | `identity` | Surrogate key |
| `student_id` | bigint | UQ(student_id, opening_id), FK → students.student_id, NN |  | Applicant |
| `opening_id` | bigint | UQ(student_id, opening_id), FK → openings.opening_id, NN |  | Opening |
| `sop` | text |  |  | Statement of purpose, max 2000 chars |
| `match_score` | numeric(5,4) |  |  | Hybrid score 0–1 at the time of applying |
| `status` | application_status | NN | `'applied'` | applied → shortlisted → offered → accepted, or rejected/withdrawn (state machine trigger) |
| `applied_at` | timestamp with time zone | NN | `now()` | When the student applied |
| `updated_at` | timestamp with time zone | NN | `now()` | Last status change (set by trigger) |

**CHECK constraints**

- `chk_application_sop`: `(((sop IS NULL) OR (length(sop) <= 2000)))`
- `chk_application_score`: `(((match_score IS NULL) OR ((match_score >= (0)::numeric) AND (match_score <= (1)::numeric))))`

**On delete:** student_id → CASCADE; opening_id → CASCADE

### 11. `application_status_history`

Audit trail of every status change. Written only by a trigger.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `history_id` | bigint | PK, NN | `identity` | Surrogate key |
| `application_id` | bigint | FK → applications.application_id, NN |  | Application |
| `old_status` | application_status |  |  | Previous status (NULL for the first row) |
| `new_status` | application_status | NN |  | New status |
| `changed_by` | bigint | FK → users.user_id |  | User who caused the change (from app.current_user_id) |
| `changed_at` | timestamp with time zone | NN | `now()` | When |

**On delete:** application_id → CASCADE; changed_by → SET NULL

### 12. `internships`

An accepted application becomes an internship.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `internship_id` | bigint | PK, NN | `identity` | Surrogate key |
| `application_id` | bigint | UQ, FK → applications.application_id, NN |  | The accepted application (1:1) |
| `start_date` | date | NN | `CURRENT_DATE` | Start date |
| `end_date` | date |  |  | Set when completed; not before start_date |
| `final_rating` | smallint |  |  | Supervisor rating 1–5, only after end_date is set |
| `remarks` | text |  |  | Supervisor's comments |

**CHECK constraints**

- `chk_internship_dates`: `(((end_date IS NULL) OR (end_date >= start_date)))`
- `chk_internship_rating`: `(((final_rating IS NULL) OR ((final_rating >= 1) AND (final_rating <= 5))))`
- `chk_rating_after_end`: `(((final_rating IS NULL) OR (end_date IS NOT NULL)))`

**On delete:** application_id → RESTRICT

### 13. `skill_endorsements`

Skills a supervisor verified after a completed internship.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `internship_id` | bigint | PK, FK → internships.internship_id, NN |  | Completed internship |
| `skill_id` | bigint | PK, FK → skills.skill_id, NN |  | Endorsed skill |
| `endorsed_by` | bigint | FK → faculty.faculty_id, NN |  | Supervising faculty (checked by trigger) |
| `endorsed_at` | timestamp with time zone | NN | `now()` | When |

**On delete:** internship_id → CASCADE; skill_id → CASCADE; endorsed_by → CASCADE

### 14. `student_embeddings`

Vectors for a student: one from the resume, one from GitHub repos.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `student_id` | bigint | PK, FK → students.student_id, NN |  | Student |
| `source` | embedding_source | PK, NN |  | resume or github |
| `embedding` | vector(384) | NN |  | 384-d normalised vector |
| `updated_at` | timestamp with time zone | NN | `now()` | Last recomputed |

**On delete:** student_id → CASCADE

### 15. `center_success_profiles`

Average vector of a lab's interns rated 4–5 ("what a great intern looks like here").

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `center_id` | bigint | PK, FK → research_centers.center_id, NN |  | Lab |
| `embedding` | vector(384) | NN |  | Average 384-d vector |
| `intern_count` | integer | NN |  | Number of interns averaged |
| `updated_at` | timestamp with time zone | NN | `now()` | Last refreshed (by procedure) |

**CHECK constraints**

- `chk_success_count`: `((intern_count >= 1))`

**On delete:** center_id → CASCADE

### 16. `match_alerts`

A student whose profile now matches an opening above its threshold.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `alert_id` | bigint | PK, NN | `identity` | Surrogate key |
| `opening_id` | bigint | UQ(opening_id, student_id), FK → openings.opening_id, NN |  | Opening |
| `student_id` | bigint | UQ(opening_id, student_id), FK → students.student_id, NN |  | Student |
| `score` | numeric(5,4) | NN |  | Match score 0–1 |
| `is_seen` | boolean | NN | `false` | Faculty has seen it |
| `created_at` | timestamp with time zone | NN | `now()` | When raised or last improved |

**CHECK constraints**

- `chk_alert_score`: `(((score >= (0)::numeric) AND (score <= (1)::numeric)))`

**On delete:** opening_id → CASCADE; student_id → CASCADE

### 17. `invitations`

Faculty invite a strong candidate who hasn't applied.

| Column | Type | Keys / null | Default | Description |
|---|---|---|---|---|
| `invitation_id` | bigint | PK, NN | `identity` | Surrogate key |
| `opening_id` | bigint | UQ(opening_id, student_id), FK → openings.opening_id, NN |  | Opening |
| `student_id` | bigint | UQ(opening_id, student_id), FK → students.student_id, NN |  | Invited student |
| `invited_by` | bigint | FK → faculty.faculty_id, NN |  | Faculty who owns the opening (checked by trigger) |
| `message` | text |  |  | Optional note, max 500 chars |
| `status` | invitation_status | NN | `'pending'` | pending, accepted (by trigger on apply) or declined |
| `created_at` | timestamp with time zone | NN | `now()` | Sent at |
| `responded_at` | timestamp with time zone |  |  | Set exactly when status leaves pending |

**CHECK constraints**

- `chk_invitation_message`: `(((message IS NULL) OR (length(message) <= 500)))`
- `chk_invitation_response`: `(((status = 'pending'::invitation_status) = (responded_at IS NULL)))`

**On delete:** opening_id → CASCADE; student_id → CASCADE; invited_by → CASCADE

## Indexes

| Table | Index | Definition |
|---|---|---|
| application_status_history | `idx_history_application` | `USING btree (application_id, changed_at)` |
| applications | `idx_applications_opening_status` | `USING btree (opening_id, status)` |
| applications | `idx_applications_student_status` | `USING btree (student_id, status)` |
| applications | `uq_application_once` | `UNIQUE USING btree (student_id, opening_id)` |
| faculty | `idx_faculty_center` | `USING btree (center_id)` |
| internships | `internships_application_id_key` | `UNIQUE USING btree (application_id)` |
| invitations | `idx_invitations_opening` | `USING btree (opening_id)` |
| invitations | `idx_invitations_student_status` | `USING btree (student_id, status)` |
| invitations | `uq_invitation_once` | `UNIQUE USING btree (opening_id, student_id)` |
| match_alerts | `idx_alerts_student` | `USING btree (student_id)` |
| match_alerts | `idx_alerts_unseen` | `USING btree (opening_id) WHERE (is_seen = false)` |
| match_alerts | `uq_alert_once` | `UNIQUE USING btree (opening_id, student_id)` |
| mv_center_stats | `uq_mv_center_stats` | `UNIQUE USING btree (center_id)` |
| opening_skills | `idx_opening_skills_skill` | `USING btree (skill_id)` |
| openings | `idx_openings_center` | `USING btree (center_id)` |
| openings | `idx_openings_embedding` | `USING hnsw (embedding vector_cosine_ops)` |
| openings | `idx_openings_faculty` | `USING btree (faculty_id)` |
| openings | `idx_openings_open_deadline` | `USING btree (deadline) WHERE (status = 'open'::opening_status)` |
| openings | `idx_openings_search` | `USING gin (search_tsv)` |
| research_centers | `research_centers_name_key` | `UNIQUE USING btree (name)` |
| skill_endorsements | `idx_endorsements_skill` | `USING btree (skill_id)` |
| skills | `uq_skills_name_lower` | `UNIQUE USING btree (lower((name)::text))` |
| student_embeddings | `idx_student_embeddings_vec` | `USING hnsw (embedding vector_cosine_ops)` |
| student_skills | `idx_student_skills_skill` | `USING btree (skill_id)` |
| students | `students_github_username_key` | `UNIQUE USING btree (github_username)` |
| students | `students_srn_key` | `UNIQUE USING btree (srn)` |
| users | `users_email_key` | `UNIQUE USING btree (email)` |
