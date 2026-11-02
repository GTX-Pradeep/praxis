// Loads a realistic demo dataset so every screen has something to show:
//   8 faculty in 6 labs, ~47 students with resumes, GitHub profiles and growth
//   history, 4 completed + 1 ongoing internship, 12 open openings with
//   applications at every stage, and a week of activity logs.
//
// Usage (after `npm run db:setup` and `npm run db:seed`):
//   npm run db:demo
// With the app running (`npm run dev`), it then triggers "Rebuild matching data"
// automatically; otherwise, log in as admin and click that button yourself.
//
// Everything goes through the real tables, constraints and triggers
// (applications, status changes, sp_accept_offer, ratings, endorsements); only
// timestamps are moved into the past afterwards, so the history looks natural.

import { config } from "dotenv";
import pg from "pg";
import { MongoClient, Long } from "mongodb";
import bcrypt from "bcryptjs";
import { pathToFileURL } from "node:url";
import {
  BRANCHES, THEMES, FORKS, FACULTY, KEY_STUDENTS, FIRST_NAMES, LAST_NAMES, GENERATED_MIX,
  PAST_OPENINGS, ONGOING_OPENING, CURRENT_OPENINGS, SOPS,
} from "./demo-data.mjs";

const DOMAIN = "praxis.demo";

// ---------- deterministic randomness (same dataset every run) ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261101);
const between = (lo, hi) => lo + rand() * (hi - lo);
const int = (lo, hi) => Math.floor(between(lo, hi + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const round1 = (x) => Math.round(x * 10) / 10;
const slug = (s) => s.toLowerCase().replace(/^dr\.\s*/, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");

// ---------- dates ----------
const DAY = 864e5;
const daysAgo = (n) => new Date(Date.now() - n * DAY);
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / DAY + 1) / 7)).padStart(2, "0")}`;
}
function monthsAgo(n) {
  const now = new Date(Date.now() + 330 * 60e3); // India time
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- proof-of-work, same formula as the MongoDB pipeline in src/lib/proof.ts ----------
// (only used here to write believable *past* monthly snapshots; the app recomputes
//  the current score with the real aggregation pipeline during "Rebuild")
function proofScore(repos) {
  const original = repos.filter((r) => !r.is_fork);
  const own = original.reduce((s, r) => s + r.own_commits, 0);
  const total = original.reduce((s, r) => s + r.total_commits, 0);
  const weeks = new Set(original.flatMap((r) => r.weeks)).size;
  const ratio = (a, b) => (b > 0 ? Math.min(1, a / b) : 0);
  return round1(15 * ratio(original.length, repos.length) + 15 * ratio(own, total)
    + 40 * Math.min(1, weeks / 26) + 30 * Math.min(1, original.length / 5));
}

// ---------- building one student ----------
const STRENGTH = {
  strong: { repos: [5, 6], months: [5, 7], weeksPerRepo: [5, 10], commits: [25, 70], authorship: [0.85, 1], prof: 1, cgpa: [8.4, 9.6] },
  medium: { repos: [3, 4], months: [2, 4], weeksPerRepo: [2, 5], commits: [10, 30], authorship: [0.7, 0.95], prof: 0, cgpa: [7.6, 8.8] },
  weak: { repos: [1, 2], months: [1, 2], weeksPerRepo: [1, 2], commits: [3, 10], authorship: [0.6, 0.9], prof: -1, cgpa: [6.6, 8.0] },
};

function makeRepo(def, s, opts = {}) {
  const [name, description, topics, languages] = def;
  const months = opts.months ?? int(...s.months);
  const nWeeks = opts.weeks ?? Math.min(int(...s.weeksPerRepo), months * 4);
  const span = months * 30;
  const dates = Array.from({ length: nWeeks }, () => daysAgo(int(2, span)));
  const weeks = [...new Set(dates.map(isoWeek))];
  const own = opts.own ?? int(...s.commits);
  const total = opts.total ?? Math.max(own, Math.round(own / between(...s.authorship)));
  const bytes = int(20, 380) * 1024;
  return {
    name,
    description,
    is_fork: false,
    languages: Object.fromEntries(Object.entries(languages).map(([l, share]) => [l, Math.max(1, Math.round(bytes * share))])),
    topics,
    stars: int(0, opts.stars ?? 12),
    own_commits: own,
    total_commits: total,
    active_weeks: weeks.length,
    weeks,
    readme_excerpt: `# ${name}\n\n${description}. ${pick([
      "Includes training scripts, evaluation notebooks and a short report.",
      "See the docs folder for setup instructions and results.",
      "Results and design decisions are summarised below.",
      "Built as part of a semester project and extended afterwards.",
    ])}`.replace(/\s+/g, " "),
    last_pushed: new Date(Math.max(...dates.map((d) => d.getTime()))),
  };
}

function forkRepo(name) {
  return {
    name, description: `Fork of ${name}`, is_fork: true, languages: {}, topics: [], stars: 0,
    own_commits: 0, total_commits: 0, active_weeks: 0, weeks: [], readme_excerpt: null,
    last_pushed: daysAgo(int(20, 300)),
  };
}

function buildStudent(spec, index) {
  const theme = THEMES[spec.theme];
  const s = STRENGTH[spec.strength];
  const [first, ...rest] = spec.name.split(" ");
  const last = rest.join(" ");
  const branch = spec.branch ?? pick(theme.branches);
  const semester = spec.semester ?? pick([3, 4, 5, 5, 6, 6, 7, 7]);
  const yearCode = { 1: 26, 2: 26, 3: 25, 4: 25, 5: 24, 6: 24, 7: 23, 8: 23 }[semester];

  // GitHub repositories
  let repos;
  if (spec.forkHeavy) {
    const original = makeRepo(theme.repos[0], s, { months: 1, weeks: 1, own: 46, total: 160, stars: 0 }); // copied project, one night
    repos = [original, ...FORKS.slice(0, 7).map(forkRepo)];
  } else {
    const n = int(...s.repos);
    repos = shuffle(theme.repos).slice(0, n).map((d) => makeRepo(d, s));
    const forks = spec.strength === "weak" ? int(1, 3) : int(0, 1);
    repos.push(...shuffle(FORKS).slice(0, forks).map(forkRepo));
  }

  // Skills: the theme's skills, shifted by strength
  const skills = (spec.forkHeavy ? theme.skills.map(([n]) => [n, 5]) : theme.skills)
    .slice(0, spec.forkHeavy ? 6 : int(3, theme.skills.length))
    .map(([name, base]) => [name, Math.max(1, Math.min(5, base + (spec.forkHeavy ? 0 : s.prof) + int(-1, 0)))]);
  if (rand() < 0.35 && spec.theme !== "web" && !skills.some(([n]) => n === "SQL")) skills.push(["SQL", int(2, 3)]);

  return {
    ...spec,
    first, last,
    email: `${slug(first)}.${slug(last)}@${DOMAIN}`,
    srn: `PES1UG${yearCode}${BRANCHES[branch].code}${String(100 + index).padStart(3, "0")}`,
    branch,
    semester,
    cgpa: spec.cgpa ?? round1(between(...s.cgpa) * 10) / 10,
    github: spec.noGithub ? null : `praxis-demo-${slug(first)}-${slug(last)}`.replace(/\./g, "-"),
    repos: spec.noGithub ? [] : repos,
    skills,
    trajectory: spec.trajectory ?? (spec.strength === "weak" ? "new" : "steady"),
  };
}

function resumeFor(st, pastInternship) {
  const theme = THEMES[st.theme];
  const projects = st.forkHeavy
    ? [
        "State-of-the-art brain tumour segmentation: designed a novel deep architecture beating published benchmarks",
        "Led development of an AI radiology assistant used by multiple hospitals",
        "Expert-level PyTorch and TensorFlow models for medical imaging, computer vision and NLP",
      ]
    : st.repos.filter((r) => !r.is_fork).map((r) => `${r.name.replace(/-/g, " ")}: ${r.description}.`);
  const sections = {
    summary: [`${st.first} ${st.last}`, `${st.email} | github.com/${st.github ?? "-"}`],
    education: [`PES University, Bengaluru: B.Tech in ${BRANCHES[st.branch].full}, Semester ${st.semester}, CGPA ${st.cgpa.toFixed(2)}`],
    projects,
    ...(pastInternship ? { experience: [`Research Intern, ${pastInternship.center}: ${pastInternship.title}`] } : {}),
    skills: [st.skills.map(([n]) => n).join(", ")],
    achievements: [pick(theme.achievements)],
  };
  const heading = { education: "EDUCATION", projects: "PROJECTS", experience: "EXPERIENCE", skills: "TECHNICAL SKILLS", achievements: "ACHIEVEMENTS" };
  const raw = [
    ...sections.summary, "",
    ...Object.entries(heading).filter(([k]) => sections[k]).flatMap(([k, h]) => [h, ...sections[k], ""]),
  ].join("\n").trim();
  return { raw, sections };
}

function snapshotsFor(st) {
  if (!st.repos.length) return [];
  const final = proofScore(st.repos);
  const original = st.repos.filter((r) => !r.is_fork);
  const own = original.reduce((s, r) => s + r.own_commits, 0);
  const fractions = {
    breakout: [0.04, 0.1, 0.22, 0.42, 0.68, 1],
    rising: [0.3, 0.42, 0.55, 0.68, 0.84, 1],
    steady: [0.82, 0.86, 0.9, 0.94, 0.97, 1],
    new: [null, null, null, null, 0.6, 1],
  }[st.trajectory];
  return fractions.map((f, i) => f === null ? null : ({
    month: monthsAgo(5 - i),
    repo_count: Math.max(1, Math.ceil(st.repos.length * f)),
    original_repo_count: Math.ceil(original.length * f),
    own_commits: Math.floor(own * f),
    skills: st.skills.map(([n]) => n),
    proof_score: i === 5 ? final : round1(final * f),
  })).filter(Boolean);
}

function momentumOf(snaps) {
  if (snaps.length < 2) return 0;
  const m = (s) => Number(s.slice(0, 4)) * 12 + Number(s.slice(5, 7));
  const a = snaps[0], b = snaps[snaps.length - 1];
  return round1((b.proof_score - a.proof_score) / (m(b.month) - m(a.month)));
}

// ---------------------------------------------------------------------------
export async function runDemo({ pg: db, mongo, password, log = console.log }) {
  const q = (text, params = []) => db.query(text, params);
  const one = async (text, params = []) => (await q(text, params)).rows[0];

  // Run statements as one user (so triggers record who did it), in one transaction
  async function as(userId, fn) {
    await q("BEGIN");
    try {
      await q("SELECT set_config('app.current_user_id', $1, true)", [String(userId)]);
      const out = await fn();
      await q("COMMIT");
      return out;
    } catch (e) {
      await q("ROLLBACK");
      throw e;
    }
  }

  // ---------- preconditions ----------
  const counts = await one(`SELECT (SELECT COUNT(*) FROM students) AS students,
                                   (SELECT COUNT(*) FROM skills) AS skills,
                                   (SELECT COUNT(*) FROM research_centers) AS centers`);
  if (Number(counts.students) > 0) {
    throw new Error("The database already has students. Run `npm run db:setup` and `npm run db:seed` first for a clean demo.");
  }
  if (Number(counts.skills) < 20 || Number(counts.centers) < 5) {
    throw new Error("Skills or research centers are missing. Run `npm run db:seed` first.");
  }

  const skillId = Object.fromEntries((await q("SELECT skill_id, name FROM skills")).rows.map((r) => [r.name, Number(r.skill_id)]));
  const centerId = Object.fromEntries((await q("SELECT center_id, name FROM research_centers")).rows.map((r) => [r.name, Number(r.center_id)]));
  const hash = await bcrypt.hash(password, 10);

  for (const c of ["resumes", "github_profiles", "profile_snapshots", "activity_logs"]) {
    await mongo.collection(c).deleteMany({});
  }

  // ---------- faculty ----------
  log("Faculty and labs");
  const faculty = {};
  for (const f of FACULTY) {
    const email = `${slug(f.name)}@${DOMAIN}`;
    const u = await one(
      `INSERT INTO users (email, password_hash, role, created_at) VALUES ($1, $2, 'faculty', now() - interval '300 days') RETURNING user_id`,
      [email, hash]
    );
    const id = Number(u.user_id);
    let cId = centerId[f.center];
    if (f.newCenter) {
      cId = Number((await one(`INSERT INTO research_centers (name, description) VALUES ($1, $2) RETURNING center_id`, f.newCenter)).center_id);
      centerId[f.newCenter[0]] = cId;
    }
    await q(`INSERT INTO faculty (faculty_id, center_id, full_name, designation, is_verified) VALUES ($1, $2, $3, $4, $5)`,
      [id, cId, f.name, f.designation, f.verified !== false]);
    if (f.head || f.newCenter) await q(`UPDATE research_centers SET head_faculty_id = $1 WHERE center_id = $2`, [id, cId]);
    if (f.newCenter) await q(`UPDATE users SET created_at = now() - interval '1 day' WHERE user_id = $1`, [id]);
    faculty[f.key] = { id, email, name: f.name, centerId: cId };
  }

  // ---------- students ----------
  log("Students, resumes and GitHub profiles");
  const specs = [...KEY_STUDENTS];
  const used = new Set(specs.map((s) => s.name));
  const firsts = shuffle(FIRST_NAMES), lasts = shuffle(LAST_NAMES);
  let n = 0;
  for (const [theme, count] of GENERATED_MIX) {
    for (let i = 0; i < count; i++) {
      let name;
      do { name = `${firsts[n % firsts.length]} ${lasts[(n * 7 + 3) % lasts.length]}`; n++; } while (used.has(name));
      used.add(name);
      const strength = ["strong", "medium", "medium", "weak"][i % 4];
      specs.push({
        key: slug(name), name, theme, strength,
        noGithub: n % 9 === 0 && strength !== "strong",
        noResume: n % 11 === 0,
        trajectory: n % 7 === 0 && strength !== "weak" ? "rising" : undefined,
      });
    }
  }

  const pastFor = {};
  for (const p of PAST_OPENINGS) for (const it of p.interns) {
    pastFor[it.student] = { title: p.title.replace(/ \(Summer 2026\)$/, ""), center: Object.keys(centerId).find((k) => centerId[k] === faculty[p.faculty].centerId) };
  }

  const students = {};
  let idx = 0;
  for (const spec of specs) {
    const st = buildStudent(spec, idx++);
    const u = await one(
      `INSERT INTO users (email, password_hash, role, created_at) VALUES ($1, $2, 'student', now() - ($3::float8 * interval '1 day')) RETURNING user_id`,
      [st.email, hash, int(20, 220)]
    );
    st.id = Number(u.user_id);
    await q(`INSERT INTO students (student_id, srn, full_name, branch, semester, cgpa, github_username)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`, [st.id, st.srn, spec.name, st.branch, st.semester, st.cgpa, st.github]);
    await q(`INSERT INTO student_skills (student_id, skill_id, proficiency)
             SELECT $1, UNNEST($2::bigint[]), UNNEST($3::smallint[])`,
      [st.id, st.skills.map(([s]) => skillId[s]), st.skills.map(([, p]) => p)]);

    const sid = Long.fromNumber(st.id);
    if (!spec.noResume) {
      const r = resumeFor(st, pastFor[spec.key]);
      await mongo.collection("resumes").insertOne({
        student_id: sid, raw_text: r.raw,
        file: { name: `${st.first}_${st.last.replace(/\s+/g, "_")}_Resume.pdf`, size: int(60_000, 240_000) },
        sections: r.sections, parsed_at: daysAgo(int(1, 40)),
      });
    }
    if (st.github) {
      const language_totals = {};
      for (const r of st.repos) for (const [l, b] of Object.entries(r.languages)) language_totals[l] = (language_totals[l] ?? 0) + b;
      await mongo.collection("github_profiles").insertOne({
        student_id: sid, username: st.github, repos: st.repos, language_totals, fetched_at: daysAgo(between(0.5, 6)),
      });
      const snaps = snapshotsFor(st);
      if (snaps.length) {
        await mongo.collection("profile_snapshots").insertMany(snaps.map((s) => ({ student_id: sid, ...s, taken_at: new Date(`${s.month}-15T10:00:00Z`) })));
      }
      await q("UPDATE students SET proof_score = $1, momentum_score = $2 WHERE student_id = $3",
        [snaps.length ? snaps[snaps.length - 1].proof_score : 0, momentumOf(snaps), st.id]);
    }
    students[spec.key] = st;
  }

  // ---------- helpers for openings and applications ----------
  async function createOpening(o, deadlineDays) {
    const f = faculty[o.faculty];
    const row = await as(f.id, async () => {
      const r = await one(
        `INSERT INTO openings (center_id, faculty_id, title, description, domain, seats_total, min_cgpa,
                               duration_weeks, stipend, deadline, alert_threshold)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + ($10::float8 * interval '1 day'), $11) RETURNING opening_id`,
        [f.centerId, f.id, o.title, o.description, o.domain, o.seats, o.minCgpa, o.weeks, o.stipend, deadlineDays, o.threshold ?? 0.7]
      );
      await q(`INSERT INTO opening_skills (opening_id, skill_id, weight)
               SELECT $1, UNNEST($2::bigint[]), UNNEST($3::smallint[])`,
        [r.opening_id, o.skills.map(([s]) => skillId[s]), o.skills.map(([, w]) => w)]);
      if (o.semesters?.length) {
        await q(`INSERT INTO opening_eligible_semesters SELECT $1, UNNEST($2::smallint[])`, [r.opening_id, o.semesters]);
      }
      return r;
    });
    return { ...o, id: Number(row.opening_id), facultyId: f.id };
  }

  const apply = (st, op) => as(st.id, async () => Number((await one(
    `INSERT INTO applications (student_id, opening_id, sop) VALUES ($1, $2, $3) RETURNING application_id`,
    [st.id, op.id, pick(SOPS)])).application_id));
  const setStatus = (actorId, appId, status) => as(actorId, () => q(`UPDATE applications SET status = $1 WHERE application_id = $2`, [status, appId]));
  const accept = (st, appId) => as(st.id, async () => Number((await one(`CALL sp_accept_offer($1, $2, NULL)`, [appId, st.id])).p_internship_id));

  // Spread an application's history over time, starting `startDaysAgo`
  async function backdate(appId, startDaysAgo, stepDays) {
    await q(`UPDATE applications SET applied_at = now() - ($2::float8 * interval '1 day'),
                                     updated_at = LEAST(now(), now() - ($2::float8 * interval '1 day') + ($3::float8 * interval '1 day'))
             WHERE application_id = $1`, [appId, startDaysAgo, stepDays * 3]);
    await q(`UPDATE application_status_history h SET changed_at = LEAST(now(), now() - ($2::float8 * interval '1 day') + (x.rn - 1) * ($3::float8 * interval '1 day'))
             FROM (SELECT history_id, ROW_NUMBER() OVER (ORDER BY history_id) AS rn
                   FROM application_status_history WHERE application_id = $1) x
             WHERE h.history_id = x.history_id`, [appId, startDaysAgo, stepDays]);
  }

  const eligible = (st, op) =>
    st.cgpa >= op.minCgpa && (!op.semesters?.length || op.semesters.includes(st.semester)) && !st.ongoing;

  // ---------- completed internships from the summer ----------
  log("Past internships, ratings and endorsements");
  for (const p of PAST_OPENINGS) {
    const op = await createOpening(p, 30);
    const others = Object.values(students).filter((s) => s.theme === students[p.interns[0].student].theme
      && !p.interns.some((i) => i.student === s.key) && !pastFor[s.key] && eligible(s, op) && s.strength !== "strong").slice(0, p.rejected);
    for (const s of others) {
      const a = await apply(s, op);
      await setStatus(op.facultyId, a, "rejected");
      await backdate(a, p.daysAgo.created - 3, 4);
    }
    for (const it of p.interns) {
      const st = students[it.student];
      const a = await apply(st, op);
      await setStatus(op.facultyId, a, "shortlisted");
      await setStatus(op.facultyId, a, "offered");
      const internship = await accept(st, a);
      await backdate(a, p.daysAgo.created - 2, 5);
      await as(op.facultyId, async () => {
        await q(`UPDATE internships SET start_date = CURRENT_DATE - $2::int, end_date = CURRENT_DATE - $3::int,
                                        final_rating = $4, remarks = $5 WHERE internship_id = $1`,
          [internship, p.daysAgo.start, p.daysAgo.end, it.rating, it.remarks]);
        await q(`INSERT INTO skill_endorsements (internship_id, skill_id, endorsed_by, endorsed_at)
                 SELECT $1, UNNEST($2::bigint[]), $3, now() - ($4::float8 * interval '1 day')`,
          [internship, it.endorse.map((s) => skillId[s]), op.facultyId, p.daysAgo.end]);
      });
    }
    await q(`UPDATE openings SET created_at = now() - ($2::float8 * interval '1 day'), deadline = now() - ($3::float8 * interval '1 day'),
                                 status = CASE WHEN seats_filled >= seats_total THEN 'filled'::opening_status ELSE 'closed'::opening_status END
             WHERE opening_id = $1`, [op.id, p.daysAgo.created, p.daysAgo.deadline]);
  }

  // ---------- ongoing internship ----------
  {
    const o = ONGOING_OPENING;
    const op = await createOpening(o, 30);
    const st = students[o.intern];
    const a = await apply(st, op);
    await setStatus(op.facultyId, a, "shortlisted");
    await setStatus(op.facultyId, a, "offered");
    const internship = await accept(st, a);
    await backdate(a, o.daysAgo.created - 2, 4);
    await q(`UPDATE internships SET start_date = CURRENT_DATE - $2::int WHERE internship_id = $1`, [internship, o.daysAgo.start]);
    await q(`UPDATE openings SET created_at = now() - ($2::float8 * interval '1 day'), deadline = now() - ($3::float8 * interval '1 day') WHERE opening_id = $1`,
      [op.id, o.daysAgo.created, o.daysAgo.deadline]);
    st.ongoing = true;
  }

  // ---------- open openings with applications at every stage ----------
  log("Open openings and applications");
  const openings = {};
  const appsPerStudent = {};
  for (const o of CURRENT_OPENINGS) {
    const op = await createOpening(o, o.deadlineDays);
    openings[o.key] = op;
    const ageDays = int(6, 16);
    await q(`UPDATE openings SET created_at = now() - ($2::float8 * interval '1 day') WHERE opening_id = $1`, [op.id, ageDays]);

    // the best-fitting students of the theme, then any named demo applicants;
    // stages are given in that order, so strong fits get shortlisted first
    const named = (o.applicants ?? []).map((k) => students[k]).filter((s) => eligible(s, op));
    const order = { strong: 0, medium: 1, weak: 2 };
    const pool = Object.values(students)
      .filter((s) => s.theme === o.plan.theme && !named.includes(s) && eligible(s, op) && (appsPerStudent[s.key] ?? 0) < 3)
      .filter((s) => !["karthik", "divya", "rahul", "sneha"].includes(s.key))
      .map((s) => ({ s, r: rand() }))
      .sort((a, b) => order[a.s.strength] - order[b.s.strength] || a.r - b.r)
      .map((x) => x.s);
    const chosen = [...pool.slice(0, Math.max(0, o.plan.count - named.length)), ...named];

    const offered = new Set(o.offered ?? []);
    const plan = o.plan;
    const ranked = chosen.filter((s) => !offered.has(s.key));
    let i = 0;
    for (const st of chosen) {
      const a = await apply(st, op);
      appsPerStudent[st.key] = (appsPerStudent[st.key] ?? 0) + 1;
      let steps = [];
      if (offered.has(st.key)) steps = ["shortlisted", "offered"];
      else {
        const pos = ranked.indexOf(st);
        const nOff = plan.offered ?? 0, nShort = plan.shortlisted ?? 0;
        if (pos < nOff) steps = ["shortlisted", "offered"];
        else if (pos < nOff + nShort) steps = ["shortlisted"];
        else if (pos >= ranked.length - (plan.rejected ?? 0)) steps = ["rejected"];
        else if (pos >= ranked.length - (plan.rejected ?? 0) - (plan.withdrawn ?? 0)) steps = ["withdrawn"];
      }
      for (const s of steps) await setStatus(s === "withdrawn" ? st.id : op.facultyId, a, s);
      await backdate(a, Math.max(1, ageDays - 1 - i), Math.max(0.3, (ageDays - i) / (steps.length + 2)));
      i++;
    }
  }

  // ---------- a week of activity (MongoDB) ----------
  log("Activity log");
  const actions = [
    ["student", "login"], ["student", "login"], ["student", "github_sync"], ["student", "resume_upload"], ["student", "apply"],
    ["faculty", "login"], ["faculty", "application_shortlisted"], ["faculty", "application_offered"], ["faculty", "create_opening"],
    ["admin", "login"], ["admin", "verify_faculty"],
  ];
  const all = { student: Object.values(students).map((s) => s.id), faculty: Object.values(faculty).map((f) => f.id) };
  const adminId = Number((await one("SELECT user_id FROM users WHERE role = 'admin' ORDER BY user_id LIMIT 1")).user_id);
  const logs = Array.from({ length: 140 }, () => {
    const [role, action] = pick(actions);
    const actor = role === "admin" ? adminId : pick(all[role]);
    return { actor_id: Long.fromNumber(actor), role, action, entity: action.includes("application") || action === "apply" ? "applications" : "users",
             entity_id: null, details: {}, ts: daysAgo(between(0, 7)) };
  });
  await mongo.collection("activity_logs").insertMany(logs);

  await q("REFRESH MATERIALIZED VIEW mv_center_stats");

  const totals = await one(`SELECT (SELECT COUNT(*) FROM students) AS students, (SELECT COUNT(*) FROM faculty) AS faculty,
                                   (SELECT COUNT(*) FROM openings WHERE status = 'open') AS open_openings,
                                   (SELECT COUNT(*) FROM applications) AS applications,
                                   (SELECT COUNT(*) FROM internships) AS internships`);
  return { totals, faculty, students };
}

// ---------------------------------------------------------------------------
async function main() {
  config({ path: ".env.local", quiet: true });
  const password = process.env.DEMO_PASSWORD || "Demo@1234";
  if (!process.env.DATABASE_ADMIN_URL || !process.env.MONGODB_URI) {
    console.error("DATABASE_ADMIN_URL and MONGODB_URI must be set in .env.local");
    process.exit(1);
  }
  const db = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  const mc = new MongoClient(process.env.MONGODB_URI);
  await db.connect();
  await mc.connect();
  try {
    const { totals, faculty, students } = await runDemo({
      pg: db, mongo: mc.db(process.env.MONGODB_DB || "praxis"), password, log: (m) => console.log(`  ✓ ${m}`),
    });
    console.log(`\nLoaded ${totals.students} students, ${totals.faculty} faculty, ${totals.open_openings} open openings, ` +
      `${totals.applications} applications, ${totals.internships} internships.`);

    // Ask the running app to compute vectors, scores, success profiles and alerts
    const base = process.env.APP_URL || "http://localhost:3000";
    console.log(`\nComputing matching data through the app at ${base} (downloads the model the first time)...`);
    try {
      const login = await fetch(`${base}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: process.env.SEED_ADMIN_EMAIL, password: process.env.SEED_ADMIN_PASSWORD }),
      });
      if (!login.ok) throw new Error(`admin login failed (${login.status})`);
      const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
      const res = await fetch(`${base}/api/admin/embeddings`, { method: "POST", headers: { Cookie: cookie } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      console.log(`  ✓ ${data.openings} opening and ${data.resumes + data.github} student vectors, ${data.scores} scores, ` +
        `${data.successProfiles} success profiles, ${data.alerts} match alerts (${data.seconds}s)`);
    } catch (e) {
      console.log(`  ! Could not reach the app (${e.message}).`);
      console.log("    Start it with `npm run dev`, log in as admin and click \"Rebuild matching data\".");
    }

    const key = (k) => students[k].email;
    console.log(`\nAll demo accounts use the password: ${password}`);
    console.log("  Admin                         " + process.env.SEED_ADMIN_EMAIL);
    console.log("  Faculty, Medical AI (head)    " + faculty.meera.email);
    console.log("  Faculty, pending approval     " + faculty.kavya.email);
    console.log("  Student, top medical profile  " + key("ananya"));
    console.log("  Student, fork-heavy GitHub    " + key("rahul"));
    console.log("  Student, rising momentum      " + key("sneha"));
    console.log("  Students racing for 1 seat    " + key("karthik") + "  and  " + key("divya"));
    console.log("\nFull list and a demo script: docs/demo-guide.md");
  } catch (e) {
    console.error("\nDemo data failed:", e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
    await mc.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
