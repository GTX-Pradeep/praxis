import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, Card, PageTitle } from "@/components/DashboardShell";
import { CompleteForm } from "./CompleteForm";

export const metadata = { title: "Interns" };

export default async function InternsPage() {
  const session = await requireRole("faculty");

  // Interns on my openings, with the skills that can be endorsed
  // (the opening's required skills ∪ the student's own skills)
  const interns = await query<{
    internship_id: string; start_date: string; end_date: string | null; default_end: string;
    final_rating: number | null; remarks: string | null; full_name: string; srn: string;
    opening_id: string; title: string;
    skill_options: { id: number; name: string }[] | null; endorsed: string[];
  }>(
    `SELECT i.internship_id,
            to_char(i.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(i.end_date, 'YYYY-MM-DD')   AS end_date,
            to_char(GREATEST(i.start_date, (now() AT TIME ZONE 'Asia/Kolkata')::date), 'YYYY-MM-DD') AS default_end,
            i.final_rating, i.remarks, s.full_name, s.srn, o.opening_id, o.title,
            (SELECT json_agg(json_build_object('id', sk.skill_id, 'name', sk.name) ORDER BY sk.name)
             FROM skills sk
             WHERE sk.skill_id IN (SELECT skill_id FROM opening_skills WHERE opening_id = o.opening_id
                                   UNION
                                   SELECT skill_id FROM student_skills WHERE student_id = a.student_id)) AS skill_options,
            ARRAY(SELECT sk.name FROM skill_endorsements e JOIN skills sk ON sk.skill_id = e.skill_id
                  WHERE e.internship_id = i.internship_id ORDER BY sk.name) AS endorsed
     FROM internships i
     JOIN applications a ON a.application_id = i.application_id
     JOIN students s     ON s.student_id     = a.student_id
     JOIN openings o     ON o.opening_id     = a.opening_id
     WHERE o.faculty_id = $1
     ORDER BY (i.end_date IS NULL) DESC, i.start_date DESC`,
    [session.userId]
  );

  const ongoing = interns.rows.filter((i) => !i.end_date);
  const done = interns.rows.filter((i) => i.end_date);

  return (
    <DashboardShell name={session.name} role="faculty">
      <PageTitle title="Interns" subtitle="Complete internships with a rating and skill endorsements." />

      <div className="mt-6 space-y-4">
        <Card title={`Ongoing (${ongoing.length})`}>
          {ongoing.length === 0 ? <p className="text-muted">No ongoing internships.</p> : (
            <ul className="divide-y divide-line">
              {ongoing.map((i) => (
                <li key={i.internship_id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div>
                    <div className="font-medium">{i.full_name} <span className="text-xs text-muted">{i.srn}</span></div>
                    <div className="text-xs text-muted">
                      <Link href={`/faculty/openings/${i.opening_id}`} className="hover:text-accent">{i.title}</Link> · started {i.start_date}
                    </div>
                  </div>
                  <CompleteForm internshipId={Number(i.internship_id)} studentName={i.full_name.split(" ")[0]}
                                startDate={i.start_date} defaultEnd={i.default_end} options={i.skill_options ?? []} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={`Completed (${done.length})`}>
          {done.length === 0 ? <p className="text-muted">No completed internships yet.</p> : (
            <ul className="divide-y divide-line">
              {done.map((i) => (
                <li key={i.internship_id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{i.full_name}</span>
                    <span className="text-sm" aria-label={`Rated ${i.final_rating} out of 5`}>
                      {"★".repeat(i.final_rating ?? 0)}<span className="text-muted">{"★".repeat(5 - (i.final_rating ?? 0))}</span>
                    </span>
                  </div>
                  <div className="text-xs text-muted">{i.title} · {i.start_date} to {i.end_date}</div>
                  {i.endorsed.length > 0 && <div className="mt-1 text-xs">Endorsed: {i.endorsed.join(", ")}</div>}
                  {i.remarks && <p className="mt-1 text-sm text-muted">&ldquo;{i.remarks}&rdquo;</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}
