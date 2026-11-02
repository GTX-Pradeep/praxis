# Testing

Two levels of testing: automated database tests that exercise every constraint, trigger, routine and view, and application test cases run through the web interface for all three roles.

## 1. Automated database tests

```bash
npm run db:test
```

Runs on an in-memory PostgreSQL ([PGlite](https://pglite.dev) with pgvector), so it needs no Docker and leaves your data untouched. It loads all six schema files twice (to prove they re-run cleanly), inserts test data, and checks both the success path and that bad data is **rejected by the database itself**.

**Result: 40 passed, 0 failed.**

### Constraint tests

| # | Test | Result | Database message |
|---|---|---|---|
| D1 | rejects malformed email | Pass | `new row for relation "users" violates check constraint "chk_users_email_format"` |
| D2 | rejects a plain-text password | Pass | `new row for relation "users" violates check constraint "chk_users_bcrypt"` |
| D3 | rejects an unknown role | Pass | `invalid input value for enum user_role: "superuser"` |
| D4 | ALTER-added FK lets a center name its head | Pass |  |
| D5 | rejects CGPA above 10 | Pass | `new row for relation "students" violates check constraint "chk_students_cgpa"` |
| D6 | rejects an invalid GitHub username | Pass | `new row for relation "students" violates check constraint "chk_students_github"` |
| D7 | skill names are unique ignoring case | Pass | `duplicate key value violates unique constraint "uq_skills_name_lower"` |
| D8 | rejects an opening whose deadline is in the past | Pass | `new row for relation "openings" violates check constraint "chk_openings_deadline"` |

### Trigger tests

| # | Test | Result | Database message |
|---|---|---|---|
| D9 | eligible student can apply | Pass |  |
| D10 | duplicate application is blocked | Pass | `duplicate key value violates unique constraint "uq_application_once"` |
| D11 | CGPA below minimum is blocked | Pass | `CGPA 6.10 is below the minimum 7.50 for this opening` |
| D12 | ineligible semester is blocked | Pass | `Semester 4 is not eligible for this opening` |
| D13 | illegal status jump applied → accepted is blocked | Pass | `Illegal status change: applied -> accepted` |
| D14 | faculty shortlists and offers (legal transitions) | Pass |  |

### Transaction tests (sp_accept_offer)

| # | Test | Result | Database message |
|---|---|---|---|
| D15 | student accepts the offer inside a transaction | Pass |  |
| D16 | trigger marked the opening 'filled' when the last seat went | Pass |  |
| D17 | second student cannot take the already-filled seat | Pass | `No seats left in opening 2` |
| D18 | failed transaction rolled back cleanly (Ben still 'offered') | Pass |  |
| D19 | audit trail recorded 4 steps with who made each change | Pass |  |

### Success profile & ranking

| # | Test | Result | Database message |
|---|---|---|---|
| D20 | cannot rate an internship before it ends | Pass | `new row for relation "internships" violates check constraint "chk_rating_after_end"` |
| D21 | cannot endorse skills before the internship ends | Pass | `Skills can only be endorsed after the internship is completed` |
| D22 | only the supervising faculty can endorse | Pass | `Only the supervising faculty member can endorse skills for this internship` |
| D23 | supervisor endorses a skill after completion | Pass |  |
| D24 | rating 5 created the lab's success profile (trigger → procedure) | Pass |  |
| D25 | ranking returns 4 eligible students, highest score first | Pass |  |
| D26 | success-profile similarity is part of the score | Pass |  |
| D27 | fn_check_alerts created 1 alert(s) for Chai | Pass |  |

### Invitation tests

| # | Test | Result | Database message |
|---|---|---|---|
| D28 | only the opening's owner can invite | Pass | `Only the faculty member who posted this opening can invite students` |
| D29 | cannot invite an ineligible student (CGPA) | Pass | `This student is not eligible for the opening` |
| D30 | owner invites an eligible student | Pass |  |
| D31 | cannot invite the same student twice | Pass | `duplicate key value violates unique constraint "uq_invitation_once"` |
| D32 | responded_at must match status | Pass | `new row for relation "invitations" violates check constraint "chk_invitation_response"` |
| D33 | applying auto-accepts the invitation (trigger) | Pass |  |
| D34 | cannot invite a student who already applied | Pass | `This student has already applied` |

### Restricted app role (what the web app connects as)

| # | Test | Result | Database message |
|---|---|---|---|
| D35 | app role can change a status; the audit trigger still writes history | Pass |  |
| D36 | app role cannot write history rows directly | Pass |  |

### Search & views

| # | Test | Result | Database message |
|---|---|---|---|
| D37 | full-text search finds 'Retinal scan classification' | Pass |  |
| D38 | v_opening_pipeline returns per-stage counts | Pass |  |
| D39 | mv_center_stats refreshes | Pass |  |
| D40 | verified skill view: Ana — PyTorch, endorsed by Dr. Rao | Pass |  |

## 2. Application test cases

Run with the demo data loaded (`npm run db:demo`, accounts in the [demo guide](demo-guide.md)). Password for demo accounts: `Demo@1234`.

| # | Role | Steps | Expected result | Result |
|---|---|---|---|---|
| A1 | Public | Register a student with an existing email | "An account with this email already exists." (UNIQUE constraint) | Pass |
| A2 | Public | Register with password `abc` | "Password must be at least 8 characters" | Pass |
| A3 | Public | Log in with a wrong password, then with an unknown email | Same "Incorrect email or password." for both (dummy-hash compare, no email enumeration) | Pass |
| A4 | Public | Open `/faculty` while logged out | Redirected to `/login?next=/faculty` | Pass |
| A5 | Student | Open `/admin` as a student | Redirected to the student dashboard | Pass |
| A6 | Faculty | Register creating a new lab, then try to post an opening | Shown as "waiting for admin verification"; API returns 403 | Pass |
| A7 | Admin | Verify the new faculty member | Faculty can now post; lab head shown as "new lab, head" until verified | Pass |
| A8 | Faculty | Post an opening with a past deadline | "The deadline must be in the future." | Pass |
| A9 | Faculty | Post a valid opening with 3 weighted skills and semesters 5–7 | Opening created with its vector; appears in student search | Pass |
| A10 | Student | Search "deep learning on brain scans" | Brain MRI opening found though no keyword matches; tagged "Matches by meaning" | Pass |
| A11 | Student (sem 3) | Open an opening limited to semesters 5–7 | "Not eligible" with the exact reason; Apply hidden | Pass |
| A12 | Student | Apply with a statement of purpose | Application "applied"; audit row written; match score stored | Pass |
| A13 | Student | Apply to the same opening again | "You have already applied to this opening." | Pass |
| A14 | Faculty | Shortlist, then offer an applicant | Status timeline shows each step with time | Pass |
| A15 | Faculty | Try to offer an "applied" candidate directly through the API | "Illegal status change: applied -> offered" | Pass |
| A16 | Student | Accept an offer while holding other applications | Internship created; other open applications become "withdrawn" | Pass |
| A17 | Two students | Karthik and Divya accept offers for the same 1-seat opening at once | Exactly one succeeds; the other sees "No seats left", stays "offered"; opening becomes "filled" | Pass |
| A18 | Student | Try to apply anywhere while interning | "Student already has an ongoing internship" | Pass |
| A19 | Faculty | Complete an internship with end date before start date | "The end date can't be before the start date." | Pass |
| A20 | Faculty | Complete & rate Arjun 5 stars, endorse PyTorch | Skills shown as "✓ verified"; lab success profile refreshed | Pass |
| A21 | Faculty | Another professor tries to complete someone else's intern | "Internship not found" (404): other professors can't even see it | Pass |
| A22 | Faculty | Open candidates for Brain MRI; toggle "Like my best interns" | Ranking reorders by success-profile similarity | Pass |
| A23 | Faculty | Open Rahul's evidence page | Forks flagged; proof-of-work 14; all skills "self-rated" | Pass |
| A24 | Faculty | Invite a strong candidate with a note; invite again | First succeeds; second "This student has already been invited…" | Pass |
| A25 | Faculty | Invite a student who already applied, or to another professor's opening | Blocked by `trg_validate_invitation` | Pass |
| A26 | Student | Tara opens her dashboard and applies to the invited opening | Invitation card shown; after applying, invitation becomes "accepted" automatically | Pass |
| A27 | Student | Upload a non-PDF file renamed to `.pdf` | "Only PDF files are accepted" (checked by file signature, not extension) | Pass |
| A28 | Student | Upload a real resume PDF | Sections detected; suggested skills offered; resume vector stored | Pass |
| A29 | Student | Sync a real GitHub username | Repos stored in MongoDB; proof-of-work breakdown and snapshot shown | Pass |
| A30 | Admin | Analytics → Show query on each panel; Refresh statistics | Query text shown; materialized view refreshed time updates | Pass |
| A31 | Admin | Rebuild matching data with MongoDB stopped | "The document database is unavailable. Is MongoDB running?" (503), no crash | Pass |
| A32 | App role | Apply, shortlist and accept while the app connects as `praxis_app` | Works; history rows written by the trigger; direct writes to history denied | Pass (after fix, see below) |

## 3. Other checks

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | No errors |
| Lint | `npm run lint` | No errors |
| Production build | `npm run build` | Compiles all pages and routes |
| Demo data | `npm run db:demo` | 48 students, 8 faculty, 12 open openings, ~40 applications, 5 rated internships, 3 invitations; ~460 MongoDB documents all accepted by the `$jsonSchema` validators |
| Ranking sanity | Brain MRI candidates | Students with real medical-imaging work rank on top; Rahul (resume most similar, proof 14/100) ranks below all of them; Nikhil (strong web developer) ranks near the bottom |
| Vector index | `EXPLAIN … ORDER BY embedding <=> …` | `Index Scan using idx_openings_embedding` |

## 4. Defects found and fixed

| Defect | Found by | Fix |
|---|---|---|
| Applying failed with "permission denied for table application_status_history" when the app connected as the restricted role | Manual test A12 on a real install | Audit trigger function made `SECURITY DEFINER`; tests D35–D36 now run as a restricted role |
| A student with a forked portfolio ranked 9th of 12 for a medical opening | Ranking sanity check on demo data | Self-reported skills scaled by proof-of-work (0.5–1.0); now ranks last among medical candidates |
| A one-night commit dump scored highly on proof-of-work | Unit check of the aggregation | Reweighted towards consistency (26 active weeks) and volume; the dump now scores 37.5 |
| Faculty awaiting verification saw a validation error instead of "waiting for verification" | Manual test A6 | Verification check moved before input validation |
| MongoDB being down gave a generic 500 | Manual test A31 | Mongo errors mapped to a clear 503 message |
