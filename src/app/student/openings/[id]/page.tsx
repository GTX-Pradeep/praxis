import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, Card, StatusBadge, PageTitle } from "@/components/DashboardShell";
import { ApplyForm } from "./ApplyForm";

export const metadata = { title: "Opening" };

export default async function StudentOpeningPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("student");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const op = (await query<{
    opening_id: string; title: string; description: string; domain: string; status: string;
    seats_total: number; seats_filled: number; min_cgpa: string; duration_weeks: number; stipend: number;
    deadline: Date; center_name: string; center_description: string | null; faculty_name: string;
    designation: string | null; my_status: string | null; my_cgpa: string; my_semester: number;
    has_ongoing: boolean; semesters: number[]; deadline_passed: boolean;
  }>(
    `SELECT o.opening_id, o.title, o.description, o.domain, o.status, o.seats_total, o.seats_filled,
            o.min_cgpa, o.duration_weeks, o.stipend, o.deadline, (o.deadline < now()) AS deadline_passed,
            rc.name AS center_name, rc.description AS center_description,
            f.full_name AS faculty_name, f.designation,
            a.status AS my_status, s.cgpa AS my_cgpa, s.semester AS my_semester,
            EXISTS (SELECT 1 FROM applications a2 JOIN internships i ON i.application_id = a2.application_id
                    WHERE a2.student_id = s.student_id AND a2.status = 'accepted' AND i.end_date IS NULL) AS has_ongoing,
            ARRAY(SELECT semester FROM opening_eligible_semesters e WHERE e.opening_id = o.opening_id ORDER BY semester) AS semesters
     FROM openings o
     JOIN research_centers rc ON rc.center_id = o.center_id
     JOIN faculty f           ON f.faculty_id = o.faculty_id
     JOIN students s          ON s.student_id = $2
     LEFT JOIN applications a ON a.opening_id = o.opening_id AND a.student_id = s.student_id
     WHERE o.opening_id = $1`,
    [id, session.userId]
  )).rows[0];
  if (!op) notFound();

  // Required skills, and whether I have each one (LEFT JOIN)
  const skills = await query<{ name: string; weight: number; proficiency: number | null }>(
    `SELECT sk.name, os.weight, ss.proficiency
     FROM opening_skills os
     JOIN skills sk ON sk.skill_id = os.skill_id
     LEFT JOIN student_skills ss ON ss.skill_id = os.skill_id AND ss.student_id = $2
     WHERE os.opening_id = $1
     ORDER BY os.weight DESC, sk.name`,
    [id, session.userId]
  );

  // Explain eligibility in plain words (the database trigger enforces the same rules)
  const problems: string[] = [];
  if (op.status !== "open") problems.push(`This opening is ${op.status}.`);
  if (op.deadline_passed) problems.push("The deadline has passed.");
  if (Number(op.my_cgpa) < Number(op.min_cgpa)) problems.push(`Requires CGPA ${Number(op.min_cgpa).toFixed(1)}; yours is ${Number(op.my_cgpa).toFixed(2)}.`);
  if (op.semesters.length && !op.semesters.includes(op.my_semester)) problems.push(`Open to semesters ${op.semesters.join(", ")}; you are in semester ${op.my_semester}.`);
  if (op.has_ongoing) problems.push("You already have an ongoing internship.");

  const have = skills.rows.filter((s) => s.proficiency !== null).length;

  return (
    <DashboardShell name={session.name} role="student">
      <Link href="/student/openings" className="text-sm text-muted hover:text-ink">← All openings</Link>
      <div className="mt-3">
        <PageTitle title={op.title} subtitle={`${op.center_name} · ${op.faculty_name}${op.designation ? `, ${op.designation}` : ""}`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="About the work">
            <p className="whitespace-pre-line">{op.description}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div><dt className="text-muted">Domain</dt><dd>{op.domain}</dd></div>
              <div><dt className="text-muted">Duration</dt><dd>{op.duration_weeks} weeks</dd></div>
              <div><dt className="text-muted">Stipend</dt><dd>{op.stipend ? `₹${op.stipend.toLocaleString("en-IN")}/mo` : "Unpaid"}</dd></div>
              <div><dt className="text-muted">Seats left</dt><dd>{op.seats_total - op.seats_filled} of {op.seats_total}</dd></div>
            </dl>
          </Card>
          <Card title={`Skills (${have} of ${skills.rows.length} on your profile)`}>
            <ul className="divide-y divide-line">
              {skills.rows.map((s) => (
                <li key={s.name} className="flex items-center justify-between py-2">
                  <span>{s.name} <span className="text-xs text-muted">importance {s.weight}/5</span></span>
                  {s.proficiency !== null
                    ? <span className="text-xs font-medium text-accent">You: {s.proficiency}/5</span>
                    : <span className="text-xs text-muted">Not on your profile</span>}
                </li>
              ))}
            </ul>
            {have < skills.rows.length && (
              <p className="mt-3 text-xs text-muted">
                Have these skills? <Link href="/student/profile" className="text-accent">Add them to your profile</Link> to improve your match.
              </p>
            )}
          </Card>
          {op.center_description && (
            <Card title={op.center_name}><p className="text-muted">{op.center_description}</p></Card>
          )}
        </div>

        <div>
          <Card title="Apply">
            <p className="mb-3 text-xs text-muted">
              Closes {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(op.deadline)}
            </p>
            {op.my_status ? (
              <div className="space-y-2">
                <p>Your application: <StatusBadge status={op.my_status} /></p>
                <Link href="/student/applications" className="text-sm text-accent">Track it in My applications →</Link>
              </div>
            ) : problems.length ? (
              <ul className="space-y-1 rounded-lg bg-danger-soft p-3 text-sm text-danger">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            ) : (
              <ApplyForm openingId={id} />
            )}
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
