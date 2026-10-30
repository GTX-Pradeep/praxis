import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, Card, Stat } from "@/components/DashboardShell";

export const metadata = { title: "Student dashboard" };

export default async function StudentDashboard() {
  const session = await requireRole("student");

  const { rows } = await query<{
    full_name: string; srn: string; branch: string; semester: number; cgpa: string;
    github_username: string | null; proof_score: string; skill_count: string;
    application_count: string; verified_skill_count: string;
  }>(
    `SELECT s.full_name, s.srn, s.branch, s.semester, s.cgpa, s.github_username, s.proof_score,
            (SELECT COUNT(*) FROM student_skills ss WHERE ss.student_id = s.student_id)      AS skill_count,
            (SELECT COUNT(*) FROM applications a WHERE a.student_id = s.student_id)          AS application_count,
            (SELECT COUNT(*) FROM v_student_verified_skills v WHERE v.student_id = s.student_id) AS verified_skill_count
     FROM students s
     WHERE s.student_id = $1`,
    [session.userId]
  );
  const s = rows[0];

  return (
    <DashboardShell name={s.full_name} role="student">
      <h1 className="font-serif text-3xl font-semibold">Hi, {s.full_name.split(" ")[0]}</h1>
      <p className="mt-1 text-muted">
        {s.srn} · {s.branch} · Semester {s.semester} · CGPA {Number(s.cgpa).toFixed(2)}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Proof-of-work" value={`${Number(s.proof_score).toFixed(0)}/100`} />
        <Stat label="Skills" value={s.skill_count} />
        <Stat label="Verified skills" value={s.verified_skill_count} />
        <Stat label="Applications" value={s.application_count} />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="GitHub" note="Day 2">
          {s.github_username ? (
            <p>Linked to <strong>@{s.github_username}</strong>. Syncing repos and commit history comes next.</p>
          ) : (
            <p className="text-muted">No GitHub linked yet. Linking it lets us verify your work.</p>
          )}
        </Card>
        <Card title="Resume" note="Day 2">
          <p className="text-muted">Upload your resume PDF so labs can match you by your projects.</p>
        </Card>
        <Card title="Recommended openings" note="Day 4">
          <p className="text-muted">Openings ranked by how well your proven work matches them.</p>
        </Card>
        <Card title="My applications" note="Day 2">
          <p className="text-muted">Track each application from applied to accepted.</p>
        </Card>
      </div>
    </DashboardShell>
  );
}
