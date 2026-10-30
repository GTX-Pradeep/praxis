import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, Card, Stat, StatusBadge, PageTitle } from "@/components/DashboardShell";
import { ActionButton } from "@/components/ActionButton";
import { ScoreBreakdown, scoreParts } from "@/components/ScoreBreakdown";
import { bestEvidence } from "@/lib/vectors";
import { fromPgVector } from "@/lib/embed";

export const metadata = { title: "Opening" };

const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);

export default async function FacultyOpeningPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rank?: string }>;
}) {
  const session = await requireRole("faculty");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const rankBySuccess = (await searchParams).rank === "success";

  // Opening + pipeline counts (view), only if this faculty owns it
  const op = (await query<{
    opening_id: string; title: string; description: string; domain: string; status: string;
    seats_total: number; seats_filled: number; min_cgpa: string; duration_weeks: number;
    stipend: number; deadline: Date; total_applications: string; applied: string;
    shortlisted: string; offered: string; accepted: string; rejected: string;
    embedding: string | null; has_success_profile: boolean;
  }>(
    `SELECT o.opening_id, o.title, o.description, o.domain, o.status, o.seats_total, o.seats_filled,
            o.min_cgpa, o.duration_weeks, o.stipend, o.deadline,
            p.total_applications, p.applied, p.shortlisted, p.offered, p.accepted, p.rejected,
            o.embedding::text AS embedding,
            EXISTS (SELECT 1 FROM center_success_profiles c WHERE c.center_id = o.center_id) AS has_success_profile
     FROM openings o
     JOIN v_opening_pipeline p ON p.opening_id = o.opening_id
     WHERE o.opening_id = $1 AND o.faculty_id = $2`,
    [id, session.userId]
  )).rows[0];
  if (!op) notFound();

  const [skills, semesters, applicants] = await Promise.all([
    query<{ name: string; weight: number }>(
      `SELECT s.name, os.weight FROM opening_skills os JOIN skills s ON s.skill_id = os.skill_id
       WHERE os.opening_id = $1 ORDER BY os.weight DESC, s.name`, [id]),
    query<{ semester: number }>(
      `SELECT semester FROM opening_eligible_semesters WHERE opening_id = $1 ORDER BY semester`, [id]),
    // Applicants with their profile, best-matching first
    query<{
      application_id: string; status: string; match_score: string | null; applied_at: Date; sop: string | null;
      full_name: string; srn: string; branch: string; semester: number; cgpa: string;
      github_username: string | null; proof_score: string; skills: string[] | null;
    }>(
      `SELECT a.application_id, a.status, a.match_score, a.applied_at, a.sop,
              s.full_name, s.srn, s.branch, s.semester, s.cgpa, s.github_username, s.proof_score,
              ARRAY(SELECT sk.name FROM student_skills ss JOIN skills sk ON sk.skill_id = ss.skill_id
                    WHERE ss.student_id = s.student_id ORDER BY ss.proficiency DESC LIMIT 6) AS skills
       FROM applications a
       JOIN students s ON s.student_id = a.student_id
       WHERE a.opening_id = $1
       ORDER BY CASE a.status WHEN 'accepted' THEN 0 WHEN 'offered' THEN 1 WHEN 'shortlisted' THEN 2
                              WHEN 'applied' THEN 3 ELSE 4 END,
                a.match_score DESC NULLS LAST, a.applied_at`,
      [id]),
  ]);

  // Ranked suggestions from fn_rank_candidates (hybrid score computed in PostgreSQL)
  const candidates = await query<{
    student_id: string; full_name: string; srn: string; branch: string; semester: number; cgpa: string;
    sem_score: string; success_score: string; skill_score: string; proof_part: string;
    total_score: string; matched_skills: string[]; application_status: string | null;
  }>(
    rankBySuccess && op.has_success_profile
      // "Find more like my best intern": order by similarity to the lab's success profile
      ? "SELECT * FROM fn_rank_candidates($1, 500) ORDER BY success_score DESC, total_score DESC LIMIT 15"
      : "SELECT * FROM fn_rank_candidates($1, 15)",
    [id]
  );
  const verified = await query<{ student_id: string; skills: string[] }>(
    `SELECT student_id, array_agg(skill_name ORDER BY skill_name) AS skills
     FROM v_student_verified_skills WHERE student_id = ANY($1::bigint[]) GROUP BY student_id`,
    [candidates.rows.map((c) => Number(c.student_id))]
  );
  const verifiedBy = new Map(verified.rows.map((v) => [Number(v.student_id), v.skills]));
  const evidence = await bestEvidence(candidates.rows.map((c) => Number(c.student_id)), fromPgVector(op.embedding));

  return (
    <DashboardShell name={session.name} role="faculty">
      <Link href="/faculty" className="text-sm text-muted hover:text-ink">← All openings</Link>
      <div className="mt-3">
        <PageTitle
          title={op.title}
          subtitle={`${op.domain} · ${op.duration_weeks} weeks · ${op.stipend ? `₹${op.stipend.toLocaleString("en-IN")}/month` : "Unpaid"} · Deadline ${fmtDate(op.deadline)}`}
          action={
            <div className="flex items-center gap-2">
              <StatusBadge status={op.status} />
              {op.status === "open" && (
                <ActionButton url={`/api/openings/${id}`} method="PATCH" body={{ status: "closed" }}
                              label="Close opening" variant="ghost" confirm="Stop accepting applications?" />
              )}
              {op.status === "closed" && (
                <ActionButton url={`/api/openings/${id}`} method="PATCH" body={{ status: "open" }}
                              label="Re-open" variant="ghost" />
              )}
            </div>
          }
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-5">
        <Stat label="Seats filled" value={`${op.seats_filled}/${op.seats_total}`} />
        <Stat label="Applied" value={op.applied} />
        <Stat label="Shortlisted" value={op.shortlisted} />
        <Stat label="Offered" value={op.offered} />
        <Stat label="Accepted" value={op.accepted} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card
            title="Suggested candidates"
            action={op.has_success_profile ? (
              <div className="flex rounded-lg border border-line p-0.5 text-xs">
                <Link href={`/faculty/openings/${id}`} className={`rounded-md px-2.5 py-1 ${!rankBySuccess ? "bg-accent text-paper" : "text-muted"}`}>Overall fit</Link>
                <Link href={`/faculty/openings/${id}?rank=success`} className={`rounded-md px-2.5 py-1 ${rankBySuccess ? "bg-accent text-paper" : "text-muted"}`}>Like my best interns</Link>
              </div>
            ) : (
              <span className="text-xs text-muted">Rate interns 4–5 to unlock &ldquo;Like my best interns&rdquo;</span>
            )}
          >
            {!op.embedding && (
              <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-warn-soft px-3 py-2 text-xs">
                <span>This opening has no vector yet, so ranking uses skills and proof-of-work only.</span>
                <ActionButton url={`/api/openings/${id}/embed`} label="Compute now" busyLabel="Computing…" variant="ghost" />
              </div>
            )}
            {candidates.rows.length === 0 ? (
              <p className="text-muted">No eligible students yet.</p>
            ) : (
              <ol className="divide-y divide-line">
                {candidates.rows.map((c, i) => {
                  const ev = evidence.get(Number(c.student_id));
                  return (
                    <li key={c.student_id} className="flex flex-wrap items-start justify-between gap-4 py-3">
                      <div className="flex gap-3">
                        <span className="mt-0.5 w-5 text-right font-serif text-lg text-muted">{i + 1}</span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{c.full_name}</span>
                            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                              {Math.round(Number(c.total_score) * 100)}% match
                            </span>
                            {c.application_status ? <StatusBadge status={c.application_status} /> : (
                              <span className="text-xs text-muted">hasn&apos;t applied</span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-muted">{c.srn} · {c.branch} · Sem {c.semester} · CGPA {Number(c.cgpa).toFixed(2)}</div>
                          {ev && ev.similarity > 0.3 && (
                            <div className="mt-1 text-xs">Best evidence: repo <strong>{ev.repo}</strong> ({Math.round(ev.similarity * 100)}% similar to this opening)</div>
                          )}
                          {c.matched_skills.length > 0 && (
                            <div className="mt-1 text-xs">Has: {c.matched_skills.join(", ")}</div>
                          )}
                          {verifiedBy.get(Number(c.student_id)) && (
                            <div className="mt-1 text-xs text-accent">✓ Verified by faculty: {verifiedBy.get(Number(c.student_id))!.join(", ")}</div>
                          )}
                        </div>
                      </div>
                      <ScoreBreakdown parts={scoreParts(c, op.has_success_profile)} />
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          <Card title={`Applicants (${op.total_applications})`}>
            {applicants.rows.length === 0 ? (
              <p className="text-muted">No applications yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {applicants.rows.map((a) => (
                  <li key={a.application_id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.full_name}</span>
                          <StatusBadge status={a.status} />
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {a.srn} · {a.branch} · Sem {a.semester} · CGPA {Number(a.cgpa).toFixed(2)}
                          {a.github_username && <> · <a className="text-accent" href={`https://github.com/${a.github_username}`} target="_blank" rel="noreferrer">@{a.github_username}</a></>}
                        </div>
                        <div className="mt-1 text-xs">
                          Proof-of-work <strong>{Number(a.proof_score).toFixed(0)}</strong>
                          {a.match_score !== null && <> · Match <strong>{Math.round(Number(a.match_score) * 100)}%</strong></>}
                          {a.skills?.length ? <> · {a.skills.join(", ")}</> : null}
                        </div>
                        {a.sop && <p className="mt-2 max-w-xl text-sm text-muted">&ldquo;{a.sop}&rdquo;</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {a.status === "applied" && (
                          <ActionButton url={`/api/applications/${a.application_id}`} method="PATCH" body={{ status: "shortlisted" }} label="Shortlist" />
                        )}
                        {a.status === "shortlisted" && (
                          <ActionButton url={`/api/applications/${a.application_id}`} method="PATCH" body={{ status: "offered" }} label="Make offer"
                                        confirm={`Offer this internship to ${a.full_name}?`} />
                        )}
                        {["applied", "shortlisted", "offered"].includes(a.status) && (
                          <ActionButton url={`/api/applications/${a.application_id}`} method="PATCH" body={{ status: "rejected" }} label="Reject"
                                        variant="danger" confirm={`Reject ${a.full_name}?`} />
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Required skills">
            <ul className="space-y-1">
              {skills.rows.map((s) => (
                <li key={s.name} className="flex justify-between">
                  <span>{s.name}</span>
                  <span className="text-muted">{"●".repeat(s.weight)}{"○".repeat(5 - s.weight)}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Eligibility">
            <p>Minimum CGPA {Number(op.min_cgpa).toFixed(1)}</p>
            <p className="mt-1">
              {semesters.rows.length ? `Semesters ${semesters.rows.map((s) => s.semester).join(", ")}` : "All semesters"}
            </p>
          </Card>
          <Card title="Description">
            <p className="whitespace-pre-line text-muted">{op.description}</p>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
