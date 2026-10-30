import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { getStudentDocs } from "@/lib/student-docs";
import { DashboardShell, Card, Stat, StatusBadge } from "@/components/DashboardShell";

export const metadata = { title: "Student dashboard" };

export default async function StudentDashboard() {
  const session = await requireRole("student");

  const [profile, recent, fresh, docs] = await Promise.all([
    query<{
      full_name: string; srn: string; branch: string; semester: number; cgpa: string;
      github_username: string | null; proof_score: string; skill_count: string;
      application_count: string; verified_skill_count: string;
    }>(
      `SELECT s.full_name, s.srn, s.branch, s.semester, s.cgpa, s.github_username, s.proof_score,
              (SELECT COUNT(*) FROM student_skills ss WHERE ss.student_id = s.student_id)          AS skill_count,
              (SELECT COUNT(*) FROM applications a WHERE a.student_id = s.student_id)              AS application_count,
              (SELECT COUNT(*) FROM v_student_verified_skills v WHERE v.student_id = s.student_id) AS verified_skill_count
       FROM students s WHERE s.student_id = $1`,
      [session.userId]),
    query<{ application_id: string; status: string; title: string; opening_id: string }>(
      `SELECT a.application_id, a.status, o.title, o.opening_id
       FROM applications a JOIN openings o ON o.opening_id = a.opening_id
       WHERE a.student_id = $1 ORDER BY a.updated_at DESC LIMIT 5`,
      [session.userId]),
    // Newest open openings I'm eligible for and haven't applied to (subquery + function)
    query<{ opening_id: string; title: string; center_name: string; deadline: Date }>(
      `SELECT o.opening_id, o.title, rc.name AS center_name, o.deadline
       FROM openings o JOIN research_centers rc ON rc.center_id = o.center_id
       WHERE o.status = 'open' AND o.deadline > now()
         AND fn_is_eligible($1, o.opening_id)
         AND o.opening_id NOT IN (SELECT opening_id FROM applications WHERE student_id = $1)
       ORDER BY o.created_at DESC LIMIT 5`,
      [session.userId]),
    getStudentDocs(session.userId),
  ]);
  const s = profile.rows[0];

  const todo: { text: string; href: string }[] = [];
  if (!s.github_username) todo.push({ text: "Link your GitHub account", href: "/student/profile" });
  else if (!docs.github) todo.push({ text: "Sync GitHub to get your proof-of-work score", href: "/student/profile" });
  if (!docs.resume) todo.push({ text: "Upload your resume", href: "/student/profile" });
  if (Number(s.skill_count) === 0) todo.push({ text: "Add your skills", href: "/student/profile" });

  return (
    <DashboardShell name={s.full_name} role="student">
      <h1 className="font-serif text-3xl font-semibold">Hi, {s.full_name.split(" ")[0]}</h1>
      <p className="mt-1 text-muted">
        {s.srn} · {s.branch} · Semester {s.semester} · CGPA {Number(s.cgpa).toFixed(2)}
      </p>

      {todo.length > 0 && (
        <div className="mt-5 rounded-xl border border-accent bg-accent-soft p-4 text-sm">
          <p className="font-semibold">Complete your profile so labs can find you</p>
          <ul className="mt-2 space-y-1">
            {todo.map((t) => <li key={t.text}>→ <Link href={t.href} className="underline">{t.text}</Link></li>)}
          </ul>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Proof-of-work" value={`${Number(s.proof_score).toFixed(0)}/100`} />
        <Stat label="Skills" value={s.skill_count} />
        <Stat label="Verified skills" value={s.verified_skill_count} />
        <Stat label="Applications" value={s.application_count} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="GitHub">
          {docs.github ? (
            <>
              <p>{docs.github.summary}</p>
              {docs.github.topLanguages.length > 0 && <p className="mt-1 text-xs text-muted">{docs.github.topLanguages.join(" · ")}</p>}
            </>
          ) : (
            <p className="text-muted">{s.github_username ? `@${s.github_username} is linked but not synced yet.` : "No GitHub linked yet."}</p>
          )}
          <Link href="/student/profile" className="mt-2 inline-block text-sm text-accent">Manage →</Link>
        </Card>

        <Card title="My applications">
          {recent.rows.length === 0 ? (
            <p className="text-muted">No applications yet.</p>
          ) : (
            <ul className="space-y-2">
              {recent.rows.map((a) => (
                <li key={a.application_id} className="flex items-center justify-between gap-2">
                  <Link href={`/student/openings/${a.opening_id}`} className="truncate hover:text-accent">{a.title}</Link>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
          <Link href="/student/applications" className="mt-2 inline-block text-sm text-accent">All applications →</Link>
        </Card>

        <Card title="New openings for you">
          {fresh.rows.length === 0 ? (
            <p className="text-muted">Nothing new you&apos;re eligible for right now.</p>
          ) : (
            <ul className="space-y-2">
              {fresh.rows.map((o) => (
                <li key={o.opening_id}>
                  <Link href={`/student/openings/${o.opening_id}`} className="font-medium hover:text-accent">{o.title}</Link>
                  <span className="block text-xs text-muted">{o.center_name} · closes {o.deadline.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/student/openings" className="mt-2 inline-block text-sm text-accent">Browse all →</Link>
        </Card>

        <Card title="Recommended for you" note="Phase 4">
          <p className="text-muted">Openings ranked by how well your proven work matches them.</p>
        </Card>
      </div>
    </DashboardShell>
  );
}
