import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { getStudentDocs } from "@/lib/student-docs";
import { DashboardShell, Card, PageTitle } from "@/components/DashboardShell";
import { SkillsEditor } from "./SkillsEditor";
import { GithubPanel } from "./GithubPanel";
import { ResumeUpload } from "./ResumeUpload";

export const metadata = { title: "My profile" };

const ago = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);

export default async function ProfilePage() {
  const session = await requireRole("student");

  const [student, catalogue, mine, docs] = await Promise.all([
    query<{ full_name: string; srn: string; branch: string; semester: number; cgpa: string; github_username: string | null; proof_score: string }>(
      "SELECT full_name, srn, branch, semester, cgpa, github_username, proof_score FROM students WHERE student_id = $1",
      [session.userId]),
    query<{ skill_id: string; name: string; category: string }>("SELECT skill_id, name, category FROM skills ORDER BY category, name"),
    query<{ skill_id: string; proficiency: number }>("SELECT skill_id, proficiency FROM student_skills WHERE student_id = $1", [session.userId]),
    getStudentDocs(session.userId),
  ]);
  const s = student.rows[0];
  const current: Record<number, number> = Object.fromEntries(mine.rows.map((r) => [Number(r.skill_id), r.proficiency]));
  const cat = catalogue.rows.map((r) => ({ id: Number(r.skill_id), name: r.name, category: r.category }));

  return (
    <DashboardShell name={s.full_name} role="student">
      <PageTitle title="My profile" subtitle={`${s.srn} · ${s.branch} · Semester ${s.semester} · CGPA ${Number(s.cgpa).toFixed(2)}`} />

      {!docs.mongoAvailable && (
        <p className="mt-4 rounded-lg bg-warn-soft px-4 py-3 text-sm">MongoDB is not reachable, so GitHub and resume data can&apos;t be shown right now.</p>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="GitHub proof-of-work">
          <GithubPanel username={s.github_username} current={current} />
          {docs.github && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-3xl font-semibold">{Number(s.proof_score).toFixed(0)}</span>
                <span className="text-muted">/ 100</span>
              </div>
              <p className="mt-1">{docs.github.summary}</p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {(["consistency", "volume", "originality", "authorship"] as const).map((k) => (
                  <div key={k} className="rounded-lg border border-line p-2">
                    <dt className="capitalize text-muted">{k}</dt>
                    <dd className="text-base font-semibold">{Math.round(docs.github!.proof[k] * 100)}%</dd>
                  </div>
                ))}
              </dl>
              {docs.github.topLanguages.length > 0 && (
                <p className="mt-3 text-xs text-muted">Top languages: {docs.github.topLanguages.join(", ")}</p>
              )}
              <p className="mt-1 text-xs text-muted">Last synced {ago(docs.github.fetchedAt)}</p>
            </div>
          )}
        </Card>

        <Card title="Resume">
          {docs.resume ? (
            <p className="mb-3">
              <strong>{docs.resume.fileName}</strong>
              <span className="text-muted"> · {(docs.resume.size / 1024).toFixed(0)} KB · uploaded {ago(docs.resume.parsedAt)}</span>
              {docs.resume.sections.length > 0 && (
                <span className="block text-xs text-muted">Sections found: {docs.resume.sections.join(", ")}</span>
              )}
            </p>
          ) : (
            <p className="mb-3 text-muted">Upload a text-based PDF. We read your projects and skills from it; the file itself isn&apos;t stored.</p>
          )}
          <ResumeUpload current={current} />
        </Card>
      </div>

      {docs.snapshots.length > 0 && (
        <div className="mt-4">
          <Card title="Growth timeline" note="One snapshot per month">
            <table className="w-full text-left">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr><th className="py-2">Month</th><th className="py-2 text-right">Original repos</th><th className="py-2 text-right">Own commits</th><th className="py-2 text-right">Proof score</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {docs.snapshots.map((sn) => (
                  <tr key={sn.month}>
                    <td className="py-2">{sn.month}</td>
                    <td className="py-2 text-right">{sn.original_repo_count}</td>
                    <td className="py-2 text-right">{sn.own_commits}</td>
                    <td className="py-2 text-right">{Number(sn.proof_score).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      <div className="mt-4">
        <Card title="Skills" note="Pick a level for each; matching uses these">
          <SkillsEditor catalogue={cat} initial={current} />
        </Card>
      </div>
    </DashboardShell>
  );
}
