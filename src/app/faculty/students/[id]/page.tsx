import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { getStudentEvidence } from "@/lib/student-docs";
import { cosine, fromPgVector } from "@/lib/embed";
import { DashboardShell, Card, Stat, StatusBadge, PageTitle } from "@/components/DashboardShell";
import { ScoreBreakdown, scoreParts } from "@/components/ScoreBreakdown";
import { GrowthChart } from "@/components/GrowthChart";
import { InviteButton } from "@/components/InviteButton";

export const metadata = { title: "Student evidence" };

const fmt = (d: Date | string) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(d));

// Everything a lab can verify about a student, in one place:
// proof-of-work and its four parts, the repositories behind it (ranked by
// similarity to the opening being considered), verified skills, internship
// outcomes, growth over time, and the resume.
export default async function StudentEvidencePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ opening?: string }>;
}) {
  const session = await requireRole("faculty");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const openingParam = Number((await searchParams).opening);
  const openingId = Number.isInteger(openingParam) && openingParam > 0 ? openingParam : null;

  const st = (await query<{
    full_name: string; srn: string; branch: string; semester: number; cgpa: string;
    github_username: string | null; proof_score: string; momentum_score: string;
  }>(
    `SELECT full_name, srn, branch, semester, cgpa, github_username, proof_score, momentum_score
     FROM students WHERE student_id = $1`, [id])).rows[0];
  if (!st) notFound();

  const [skills, internships, myApps, evidence, context] = await Promise.all([
    // Skills: self-reported level + whether any supervisor endorsed it (LEFT JOIN on the view)
    query<{ name: string; proficiency: number | null; verified_by: string | null }>(
      `SELECT sk.name, ss.proficiency, v.endorsed_by AS verified_by
       FROM skills sk
       LEFT JOIN student_skills ss            ON ss.skill_id = sk.skill_id AND ss.student_id = $1
       LEFT JOIN v_student_verified_skills v  ON v.skill_id  = sk.skill_id AND v.student_id  = $1
       WHERE ss.student_id IS NOT NULL OR v.student_id IS NOT NULL
       ORDER BY (v.student_id IS NOT NULL) DESC, ss.proficiency DESC NULLS LAST, sk.name`, [id]),
    query<{ title: string; center_name: string; faculty_name: string; start_date: string; end_date: string | null; final_rating: number | null; remarks: string | null }>(
      `SELECT o.title, rc.name AS center_name, f.full_name AS faculty_name,
              to_char(i.start_date, 'DD Mon YYYY') AS start_date, to_char(i.end_date, 'DD Mon YYYY') AS end_date,
              i.final_rating, i.remarks
       FROM internships i
       JOIN applications a      ON a.application_id = i.application_id
       JOIN openings o          ON o.opening_id     = a.opening_id
       JOIN research_centers rc ON rc.center_id     = o.center_id
       JOIN faculty f           ON f.faculty_id     = o.faculty_id
       WHERE a.student_id = $1 ORDER BY i.start_date DESC`, [id]),
    // This student's dealings with MY openings
    query<{ opening_id: string; title: string; app_status: string | null; inv_status: string | null }>(
      `SELECT o.opening_id, o.title, a.status AS app_status, inv.status AS inv_status
       FROM openings o
       LEFT JOIN applications a  ON a.opening_id  = o.opening_id AND a.student_id  = $1
       LEFT JOIN invitations inv ON inv.opening_id = o.opening_id AND inv.student_id = $1
       WHERE o.faculty_id = $2 AND (a.application_id IS NOT NULL OR inv.invitation_id IS NOT NULL)
       ORDER BY o.created_at DESC`, [id, session.userId]),
    getStudentEvidence(id),
    // Optional: the opening this student is being considered for
    openingId
      ? query<{
          title: string; embedding: string | null; is_owner: boolean; has_success_profile: boolean; eligible: boolean;
          app_status: string | null; inv_status: string | null;
          sem_score: string; success_score: string; skill_score: string; proof_part: string; total_score: string;
        }>(
          `SELECT o.title, o.embedding::text AS embedding, (o.faculty_id = $3) AS is_owner,
                  EXISTS (SELECT 1 FROM center_success_profiles c WHERE c.center_id = o.center_id) AS has_success_profile,
                  fn_is_eligible($1, o.opening_id) AS eligible,
                  (SELECT status FROM applications WHERE opening_id = o.opening_id AND student_id = $1) AS app_status,
                  (SELECT status FROM invitations  WHERE opening_id = o.opening_id AND student_id = $1) AS inv_status,
                  m.*
           FROM openings o CROSS JOIN LATERAL fn_match_score($1, o.opening_id) m
           WHERE o.opening_id = $2 AND o.status = 'open'`, [id, openingId, session.userId])
      : Promise.resolve(null),
  ]);

  const ctx = context?.rows[0] ?? null;
  const openingVec = ctx ? fromPgVector(ctx.embedding) : null;

  // Original repos first, ranked by similarity to the opening (if any), else by own commits
  const repos = evidence.repos
    .map((r) => ({ ...r, similarity: openingVec && r.embedding ? cosine(openingVec, r.embedding) : null }))
    .sort((a, b) => Number(a.is_fork) - Number(b.is_fork)
      || (b.similarity ?? -1) - (a.similarity ?? -1)
      || b.own_commits - a.own_commits);
  const forks = repos.filter((r) => r.is_fork);
  const originals = repos.filter((r) => !r.is_fork);
  const proof = evidence.github?.proof;
  const momentum = Number(st.momentum_score);

  return (
    <DashboardShell name={session.name} role="faculty">
      {ctx && openingId && (
        <Link href={`/faculty/openings/${openingId}`} className="text-sm text-muted hover:text-ink">← Back to {ctx.title}</Link>
      )}
      <div className="mt-3">
        <PageTitle
          title={st.full_name}
          subtitle={`${st.srn} · ${st.branch} · Semester ${st.semester} · CGPA ${Number(st.cgpa).toFixed(2)}`}
          action={st.github_username ? (
            <a href={`https://github.com/${st.github_username}`} target="_blank" rel="noreferrer" className="btn-ghost">@{st.github_username}</a>
          ) : undefined}
        />
      </div>

      {!evidence.mongoAvailable && (
        <p className="mt-4 rounded-lg bg-warn-soft px-4 py-3 text-sm">MongoDB is not reachable, so repositories, resume and growth history can&apos;t be shown.</p>
      )}

      {ctx && (
        <section className="mt-5 rounded-xl border border-accent bg-accent-soft/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-accent">Fit for this opening</div>
              <div className="mt-1 font-serif text-xl font-semibold">{ctx.title}</div>
              <div className="mt-1 font-serif text-4xl font-semibold">{Math.round(Number(ctx.total_score) * 100)}%</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {ctx.app_status ? <>Application: <StatusBadge status={ctx.app_status} /></>
                  : ctx.inv_status ? <>Invitation: <StatusBadge status={ctx.inv_status} /></>
                  : !ctx.eligible ? <span className="text-muted">Not eligible for this opening</span>
                  : ctx.is_owner ? <InviteButton openingId={openingId!} studentId={id} name={st.full_name.split(" ")[0]} />
                  : <span className="text-muted">Hasn&apos;t applied</span>}
              </div>
            </div>
            <ScoreBreakdown parts={scoreParts(ctx, ctx.has_success_profile)} />
          </div>
        </section>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-4">
        <Stat label="Proof-of-work" value={`${Number(st.proof_score).toFixed(0)}/100`} />
        <Stat label="Momentum" value={`${momentum > 0 ? "+" : ""}${momentum.toFixed(1)}/mo`} />
        <Stat label="Original repos" value={proof ? `${proof.original_repos}/${proof.total_repos}` : "–"} />
        <Stat label="Verified skills" value={skills.rows.filter((s) => s.verified_by).length} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Repositories" note={openingVec ? "Most relevant to this opening first" : "Most commits first"}>
            {originals.length === 0 && forks.length === 0 ? (
              <p className="text-muted">{st.github_username ? "GitHub not synced yet." : "No GitHub linked."}</p>
            ) : (
              <ul className="divide-y divide-line">
                {originals.map((r) => (
                  <li key={r.name} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium">{r.name}</span>
                      {r.similarity !== null && (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.similarity > 0.45 ? "bg-accent-soft text-accent" : "bg-line text-muted"}`}>
                          {Math.round(r.similarity * 100)}% relevant
                        </span>
                      )}
                    </div>
                    {r.description && <p className="mt-0.5 text-sm text-muted">{r.description}</p>}
                    <p className="mt-1 text-xs text-muted">
                      {r.own_commits} of {r.total_commits} commits by {st.full_name.split(" ")[0]}
                      {" · "}{r.active_weeks} active week{r.active_weeks === 1 ? "" : "s"}
                      {Object.keys(r.languages).length > 0 && <> · {Object.keys(r.languages).slice(0, 3).join(", ")}</>}
                      {r.stars > 0 && <> · ★ {r.stars}</>}
                      {r.last_pushed && <> · last push {fmt(r.last_pushed)}</>}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {forks.length > 0 && (
              <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-xs">
                {forks.length} fork{forks.length === 1 ? "" : "s"} not counted as their own work: {forks.map((f) => f.name).join(", ")}
              </p>
            )}
          </Card>

          <Card title="Growth" note={momentum !== 0 ? `${momentum > 0 ? "+" : ""}${momentum.toFixed(1)} proof points per month` : undefined}>
            <GrowthChart points={evidence.snapshots.map((s) => ({ month: s.month, value: Number(s.proof_score) }))} />
          </Card>

          {Object.keys(evidence.resumeSections).length > 0 && (
            <Card title="Resume">
              <dl className="space-y-3">
                {(["projects", "experience", "achievements", "education"] as const)
                  .filter((k) => evidence.resumeSections[k]?.length)
                  .map((k) => (
                    <div key={k}>
                      <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
                      <dd>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5">
                          {evidence.resumeSections[k].slice(0, 6).map((line, i) => <li key={i}>{line}</li>)}
                        </ul>
                      </dd>
                    </div>
                  ))}
              </dl>
              <p className="mt-3 text-xs text-muted">Self-reported. Compare with the repositories and verified skills.</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {proof && (
            <Card title="Proof-of-work breakdown">
              <ScoreBreakdown parts={[
                { label: "Consistency (40)", value: proof.consistency, weight: 1 },
                { label: "Volume (30)", value: proof.volume, weight: 1 },
                { label: "Originality (15)", value: proof.originality, weight: 1 },
                { label: "Authorship (15)", value: proof.authorship, weight: 1 },
              ]} />
              <p className="mt-3 text-xs text-muted">{evidence.github?.summary}</p>
            </Card>
          )}

          <Card title="Skills">
            {skills.rows.length === 0 ? <p className="text-muted">No skills listed.</p> : (
              <ul className="space-y-1.5">
                {skills.rows.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-2">
                    <span>{s.verified_by ? <span className="text-accent">✓ </span> : null}{s.name}</span>
                    <span className="text-xs text-muted">
                      {s.verified_by ? `verified by ${s.verified_by}` : s.proficiency ? `self-rated ${s.proficiency}/5` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Internships">
            {internships.rows.length === 0 ? <p className="text-muted">None yet.</p> : (
              <ul className="space-y-3">
                {internships.rows.map((i) => (
                  <li key={i.title + i.start_date}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{i.title}</span>
                      {i.final_rating ? <span className="shrink-0 text-sm">{"★".repeat(i.final_rating)}<span className="text-muted">{"★".repeat(5 - i.final_rating)}</span></span>
                        : <span className="text-xs text-accent">Ongoing</span>}
                    </div>
                    <div className="text-xs text-muted">{i.center_name} · {i.faculty_name} · {i.start_date}{i.end_date ? ` to ${i.end_date}` : ""}</div>
                    {i.remarks && <p className="mt-1 text-sm text-muted">&ldquo;{i.remarks}&rdquo;</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {myApps.rows.length > 0 && (
            <Card title="With your openings">
              <ul className="space-y-2">
                {myApps.rows.map((a) => (
                  <li key={a.opening_id} className="flex items-center justify-between gap-2 text-sm">
                    <Link href={`/faculty/openings/${a.opening_id}`} className="hover:text-accent">{a.title}</Link>
                    {a.app_status ? <StatusBadge status={a.app_status} /> : <span className="text-xs text-muted">invited ({a.inv_status})</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
