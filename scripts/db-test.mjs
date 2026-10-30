/* eslint-disable @typescript-eslint/no-unused-expressions, @typescript-eslint/no-unused-vars */
// Runs every SQL file against an in-memory PostgreSQL (PGlite + pgvector)
// and checks that constraints, triggers, procedures and views behave.
// No Docker needed:   npm run db:test

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import bcrypt from "bcryptjs";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const sqlDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "sql");
const db = new PGlite({ extensions: { vector } });

let passed = 0;
let failed = 0;
const ok = (name) => { passed++; console.log(`  PASS  ${name}`); };
const bad = (name, why) => { failed++; console.log(`  FAIL  ${name}\n        ${why}`); };

async function expectOk(name, fn) {
  try { const r = await fn(); ok(name); return r; }
  catch (e) { bad(name, e.message); }
}
async function expectError(name, fn, pattern) {
  try { await fn(); bad(name, "expected an error but the statement succeeded"); }
  catch (e) {
    if (pattern.test(e.message)) ok(`${name}  →  "${e.message}"`);
    else bad(name, `wrong error: ${e.message}`);
  }
}

// Deterministic fake 384-dim embedding around a "topic" seed
function vec(seed, noise = 0) {
  const v = [];
  for (let i = 0; i < 384; i++) v.push(Math.sin(seed * (i + 1)) + noise * Math.cos(i * 7 + seed));
  return `[${v.map((x) => x.toFixed(5)).join(",")}]`;
}

console.log("\nLoading schema files...");
for (const f of readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(sqlDir, f), "utf8"));
  console.log(`  loaded ${f}`);
}
// Run twice to prove the scripts are re-runnable (DROP ... IF EXISTS)
for (const f of readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(readFileSync(join(sqlDir, f), "utf8"));
}
console.log("  re-ran all files cleanly\n");

const hash = bcrypt.hashSync("Password@123", 10);
const q = (sql, p = []) => db.query(sql, p);
const one = async (sql, p = []) => (await q(sql, p)).rows[0];

console.log("Constraint tests");
await expectError("rejects malformed email",
  () => q(`INSERT INTO users (email, password_hash, role) VALUES ('not-an-email', $1, 'student')`, [hash]),
  /chk_users_email_format/);
await expectError("rejects a plain-text password",
  () => q(`INSERT INTO users (email, password_hash, role) VALUES ('x@pes.edu', 'plainpassword_plainpassword_plainpassword_plainpassword_ab', 'student')`),
  /chk_users_bcrypt/);
await expectError("rejects an unknown role",
  () => q(`INSERT INTO users (email, password_hash, role) VALUES ('y@pes.edu', $1, 'superuser')`, [hash]),
  /invalid input value for enum/);

// ---- seed a small world ----
const admin  = await one(`INSERT INTO users (email, password_hash, role) VALUES ('admin@pes.edu', $1, 'admin') RETURNING user_id`, [hash]);
const fUser  = await one(`INSERT INTO users (email, password_hash, role) VALUES ('prof.rao@pes.edu', $1, 'faculty') RETURNING user_id`, [hash]);
const center = await one(`INSERT INTO research_centers (name, description) VALUES ('Center for Medical AI', 'Deep learning for medical imaging') RETURNING center_id`);
await q(`INSERT INTO faculty (faculty_id, center_id, full_name, designation, is_verified) VALUES ($1, $2, 'Dr. Rao', 'Associate Professor', true)`, [fUser.user_id, center.center_id]);
await expectOk("ALTER-added FK lets a center name its head",
  () => q(`UPDATE research_centers SET head_faculty_id = $1 WHERE center_id = $2`, [fUser.user_id, center.center_id]));

const students = [];
for (const [i, s] of [
  ["ana@pes.edu",  "PES1UG22CS001", "Ana",   6, 9.1, "ana-dev",   80, 1.0],
  ["ben@pes.edu",  "PES1UG22CS002", "Ben",   6, 8.2, "ben-codes", 40, 1.3],
  ["chai@pes.edu", "PES1UG22CS003", "Chai",  4, 8.0, "chai-ml",   60, 1.0],
  ["dev@pes.edu",  "PES1UG22CS004", "Dev",   6, 6.1, "devk",      90, 1.0],
].entries()) {
  const u = await one(`INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'student') RETURNING user_id`, [s[0], hash]);
  await q(`INSERT INTO students (student_id, srn, full_name, branch, semester, cgpa, github_username, proof_score)
           VALUES ($1, $2, $3, 'CSE', $4, $5, $6, $7)`, [u.user_id, s[1], s[2], s[3], s[4], s[5], s[6]]);
  await q(`INSERT INTO student_embeddings (student_id, source, embedding) VALUES ($1, 'resume', $2), ($1, 'github', $3)`,
    [u.user_id, vec(s[7], i * 0.3), vec(s[7], i * 0.4)]);
  students.push(u.user_id);
}
const [ana, ben, chai, dev] = students;

await expectError("rejects CGPA above 10",
  () => q(`INSERT INTO students (student_id, srn, full_name, branch, semester, cgpa) VALUES ($1, 'X1', 'X', 'CSE', 5, 11)`, [admin.user_id]),
  /chk_students_cgpa/);
await expectError("rejects an invalid GitHub username",
  () => q(`UPDATE students SET github_username = '-bad name' WHERE student_id = $1`, [ana]),
  /chk_students_github/);

const py = await one(`INSERT INTO skills (name, category) VALUES ('Python', 'language') RETURNING skill_id`);
const pt = await one(`INSERT INTO skills (name, category) VALUES ('PyTorch', 'ml') RETURNING skill_id`);
const cv = await one(`INSERT INTO skills (name, category) VALUES ('Computer Vision', 'ml') RETURNING skill_id`);
await expectError("skill names are unique ignoring case",
  () => q(`INSERT INTO skills (name) VALUES ('python')`), /uq_skills_name_lower/);

await q(`INSERT INTO student_skills VALUES ($1, $2, 5), ($1, $3, 4), ($4, $2, 3), ($5, $2, 4), ($5, $6, 4), ($7, $2, 5)`,
  [ana, py.skill_id, pt.skill_id, ben, chai, cv.skill_id, dev]);

await expectError("rejects an opening whose deadline is in the past",
  () => q(`INSERT INTO openings (center_id, faculty_id, title, description, domain, seats_total, duration_weeks, deadline)
           VALUES ($1, $2, 'Old opening', 'This opening has a deadline that already passed long ago.', 'AI', 1, 8, now() - interval '1 day')`,
    [center.center_id, fUser.user_id]),
  /chk_openings_deadline/);

const op = await one(`INSERT INTO openings (center_id, faculty_id, title, description, domain, seats_total, min_cgpa, duration_weeks, stipend, deadline, embedding, alert_threshold)
  VALUES ($1, $2, 'Medical image segmentation intern',
          'Build and evaluate U-Net style deep learning models for segmenting tumours in MRI scans.',
          'Medical Imaging', 1, 7.5, 10, 10000, now() + interval '14 days', $3, 0.5)
  RETURNING opening_id`, [center.center_id, fUser.user_id, vec(1.0, 0.1)]);
await q(`INSERT INTO opening_skills VALUES ($1, $2, 5), ($1, $3, 4), ($1, $4, 3)`, [op.opening_id, pt.skill_id, py.skill_id, cv.skill_id]);
await q(`INSERT INTO opening_eligible_semesters VALUES ($1, 5), ($1, 6), ($1, 7)`, [op.opening_id]);

console.log("\nTrigger tests");
await q(`SET app.current_user_id = '${ana}'`);
const appAna = await expectOk("eligible student can apply",
  () => one(`INSERT INTO applications (student_id, opening_id, sop) VALUES ($1, $2, 'I love segmentation') RETURNING application_id`, [ana, op.opening_id]));
await expectError("duplicate application is blocked",
  () => q(`INSERT INTO applications (student_id, opening_id) VALUES ($1, $2)`, [ana, op.opening_id]),
  /uq_application_once/);
await expectError("CGPA below minimum is blocked",
  () => q(`INSERT INTO applications (student_id, opening_id) VALUES ($1, $2)`, [dev, op.opening_id]),
  /below the minimum/);
await expectError("ineligible semester is blocked",
  () => q(`INSERT INTO applications (student_id, opening_id) VALUES ($1, $2)`, [chai, op.opening_id]),
  /not eligible/);
await expectError("illegal status jump applied → accepted is blocked",
  () => q(`UPDATE applications SET status = 'accepted' WHERE application_id = $1`, [appAna.application_id]),
  /Illegal status change/);

const appBen = await one(`INSERT INTO applications (student_id, opening_id) VALUES ($1, $2) RETURNING application_id`, [ben, op.opening_id]);

await q(`SET app.current_user_id = '${fUser.user_id}'`);
await expectOk("faculty shortlists and offers (legal transitions)", async () => {
  for (const id of [appAna.application_id, appBen.application_id]) {
    await q(`UPDATE applications SET status = 'shortlisted' WHERE application_id = $1`, [id]);
    await q(`UPDATE applications SET status = 'offered' WHERE application_id = $1`, [id]);
  }
});

console.log("\nTransaction tests (sp_accept_offer)");
await q(`SET app.current_user_id = '${ana}'`);
const acc = await expectOk("student accepts the offer inside a transaction", async () => {
  await q("BEGIN");
  const r = await one(`CALL sp_accept_offer($1, $2, NULL)`, [appAna.application_id, ana]);
  await q("COMMIT");
  return r;
});
const opAfter = await one(`SELECT seats_filled, status FROM openings WHERE opening_id = $1`, [op.opening_id]);
opAfter.status === "filled" && opAfter.seats_filled === 1
  ? ok("trigger marked the opening 'filled' when the last seat went")
  : bad("opening auto-fill", JSON.stringify(opAfter));

await q(`SET app.current_user_id = '${ben}'`);
await expectError("second student cannot take the already-filled seat", async () => {
  await q("BEGIN");
  try { await q(`CALL sp_accept_offer($1, $2, NULL)`, [appBen.application_id, ben]); await q("COMMIT"); }
  catch (e) { await q("ROLLBACK"); throw e; }
}, /No seats left/);
const benStill = await one(`SELECT status FROM applications WHERE application_id = $1`, [appBen.application_id]);
benStill.status === "offered" ? ok("failed transaction rolled back cleanly (Ben still 'offered')") : bad("rollback", benStill.status);

const hist = await q(`SELECT old_status, new_status, changed_by FROM application_status_history WHERE application_id = $1 ORDER BY history_id`, [appAna.application_id]);
hist.rows.length === 4 && hist.rows[3].new_status === "accepted" && Number(hist.rows[1].changed_by) === Number(fUser.user_id)
  ? ok(`audit trail recorded ${hist.rows.length} steps with who made each change`)
  : bad("audit trail", JSON.stringify(hist.rows));

console.log("\nSuccess profile & ranking");
const intern = await one(`SELECT internship_id FROM internships WHERE application_id = $1`, [appAna.application_id]);
await expectError("cannot rate an internship before it ends",
  () => q(`UPDATE internships SET final_rating = 5 WHERE internship_id = $1`, [intern.internship_id]),
  /chk_rating_after_end/);
await q(`UPDATE internships SET end_date = start_date + 70, final_rating = 5 WHERE internship_id = $1`, [intern.internship_id]);
await q(`INSERT INTO skill_endorsements (internship_id, skill_id, endorsed_by) VALUES ($1, $2, $3)`, [intern.internship_id, pt.skill_id, fUser.user_id]);
const prof = await one(`SELECT intern_count FROM center_success_profiles WHERE center_id = $1`, [center.center_id]);
prof?.intern_count === 1 ? ok("rating 5 created the lab's success profile (trigger → procedure)") : bad("success profile", JSON.stringify(prof));

const op2 = await one(`INSERT INTO openings (center_id, faculty_id, title, description, domain, seats_total, min_cgpa, duration_weeks, deadline, embedding, alert_threshold)
  VALUES ($1, $2, 'Retinal scan classification intern',
          'Train convolutional networks to classify diabetic retinopathy severity from retinal images.',
          'Medical Imaging', 2, 6.0, 8, now() + interval '20 days', $3, 0.4)
  RETURNING opening_id`, [center.center_id, fUser.user_id, vec(1.0, 0.2)]);
await q(`INSERT INTO opening_skills VALUES ($1, $2, 5), ($1, $3, 3)`, [op2.opening_id, pt.skill_id, cv.skill_id]);

const ranked = await q(`SELECT full_name, total_score, sem_score, success_score, skill_score, proof_part, matched_skills FROM fn_rank_candidates($1)`, [op2.opening_id]);
console.table(ranked.rows);
const sorted = ranked.rows.every((r, i, a) => i === 0 || Number(a[i - 1].total_score) >= Number(r.total_score));
ranked.rows.length >= 3 && sorted
  ? ok(`ranking returns ${ranked.rows.length} eligible students, highest score first`)
  : bad("ranking", JSON.stringify(ranked.rows));
Number(ranked.rows[0].success_score) > 0 ? ok("success-profile similarity is part of the score") : bad("success score", "0");

const alerts = await one(`SELECT fn_check_alerts($1) AS n`, [chai]);
ok(`fn_check_alerts created ${alerts.n} alert(s) for Chai`);

console.log("\nSearch & views");
const fts = await q(`SELECT title, ts_rank(search_tsv, q) AS rank FROM openings, plainto_tsquery('english', 'retinal image classification') q
                     WHERE search_tsv @@ q ORDER BY rank DESC`);
fts.rows[0]?.title.startsWith("Retinal") ? ok("full-text search finds 'Retinal scan classification'") : bad("full-text", JSON.stringify(fts.rows));

const pipe = await q(`SELECT title, total_applications, accepted, offered FROM v_opening_pipeline ORDER BY opening_id`);
console.table(pipe.rows);
ok("v_opening_pipeline returns per-stage counts");
await q(`REFRESH MATERIALIZED VIEW mv_center_stats`);
console.table((await q(`SELECT center_name, openings, applications, accepted, avg_intern_rating FROM mv_center_stats`)).rows);
ok("mv_center_stats refreshes");
const vs = await one(`SELECT skill_name, endorsed_by FROM v_student_verified_skills WHERE student_id = $1`, [ana]);
vs?.skill_name === "PyTorch" ? ok(`verified skill view: Ana — ${vs.skill_name}, endorsed by ${vs.endorsed_by}`) : bad("verified skills", JSON.stringify(vs));

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
