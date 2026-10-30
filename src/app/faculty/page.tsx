import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, Card, Stat, StatusBadge } from "@/components/DashboardShell";

export const metadata = { title: "Faculty dashboard" };

export default async function FacultyDashboard() {
  const session = await requireRole("faculty");

  const { rows } = await query<{
    full_name: string; designation: string | null; is_verified: boolean;
    center_name: string | null; open_openings: string; total_applications: string; unseen_alerts: string;
  }>(
    `SELECT f.full_name, f.designation, f.is_verified, rc.name AS center_name,
            COUNT(DISTINCT o.opening_id) FILTER (WHERE o.status = 'open') AS open_openings,
            COUNT(DISTINCT a.application_id)                               AS total_applications,
            COUNT(DISTINCT ma.alert_id) FILTER (WHERE NOT ma.is_seen)      AS unseen_alerts
     FROM faculty f
     LEFT JOIN research_centers rc ON rc.center_id = f.center_id
     LEFT JOIN openings o          ON o.faculty_id = f.faculty_id
     LEFT JOIN applications a      ON a.opening_id = o.opening_id
     LEFT JOIN match_alerts ma     ON ma.opening_id = o.opening_id
     WHERE f.faculty_id = $1
     GROUP BY f.faculty_id, rc.name`,
    [session.userId]
  );
  const f = rows[0];

  // My openings with per-stage counts from the v_opening_pipeline view
  const openings = await query<{
    opening_id: string; title: string; status: string; deadline: Date; seats_total: number;
    seats_filled: number; total_applications: string; shortlisted: string; offered: string;
  }>(
    `SELECT p.opening_id, p.title, p.status, p.deadline, p.seats_total, p.seats_filled,
            p.total_applications, p.shortlisted, p.offered
     FROM v_opening_pipeline p
     JOIN openings o ON o.opening_id = p.opening_id
     WHERE o.faculty_id = $1
     ORDER BY (p.status = 'open') DESC, p.deadline`,
    [session.userId]
  );

  // Lab success profile + intern counts
  const lab = (await query<{ intern_count: number | null; updated_at: Date | null; ongoing: string; completed: string; avg_rating: string | null }>(
    `SELECT csp.intern_count, csp.updated_at,
            COUNT(*) FILTER (WHERE i.internship_id IS NOT NULL AND i.end_date IS NULL)     AS ongoing,
            COUNT(*) FILTER (WHERE i.end_date IS NOT NULL)                                AS completed,
            ROUND(AVG(i.final_rating), 1)                                                 AS avg_rating
     FROM faculty f
     LEFT JOIN center_success_profiles csp ON csp.center_id = f.center_id
     LEFT JOIN openings o     ON o.faculty_id = f.faculty_id
     LEFT JOIN applications a ON a.opening_id = o.opening_id
     LEFT JOIN internships i  ON i.application_id = a.application_id
     WHERE f.faculty_id = $1
     GROUP BY csp.intern_count, csp.updated_at`,
    [session.userId]
  )).rows[0];

  return (
    <DashboardShell name={f.full_name} role="faculty">
      <h1 className="font-serif text-3xl font-semibold">{f.full_name}</h1>
      <p className="mt-1 text-muted">
        {[f.designation, f.center_name].filter(Boolean).join(" · ") || "No center assigned"}
      </p>

      {!f.is_verified && (
        <p className="mt-5 rounded-lg bg-warn-soft px-4 py-3 text-sm">
          Your account is waiting for admin verification. You can post openings once it is verified.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Open openings" value={f.open_openings} />
        <Stat label="Applications" value={f.total_applications} />
        <Stat label="New match alerts" value={f.unseen_alerts} />
      </div>

      <div className="mt-6">
        <Card
          title="My openings"
          action={f.is_verified ? <Link href="/faculty/openings/new" className="btn px-3 py-1.5 text-sm">Post opening</Link> : undefined}
        >
          {openings.rows.length === 0 ? (
            <p className="text-muted">You haven&apos;t posted any openings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-2">Opening</th><th className="py-2">Status</th>
                    <th className="py-2 text-right">Applied</th><th className="py-2 text-right">Shortlisted</th>
                    <th className="py-2 text-right">Offered</th><th className="py-2 text-right">Seats</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {openings.rows.map((o) => (
                    <tr key={o.opening_id}>
                      <td className="py-2.5">
                        <Link href={`/faculty/openings/${o.opening_id}`} className="font-medium hover:text-accent">{o.title}</Link>
                        <div className="text-xs text-muted">Deadline {o.deadline.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
                      </td>
                      <td className="py-2.5"><StatusBadge status={o.status} /></td>
                      <td className="py-2.5 text-right">{o.total_applications}</td>
                      <td className="py-2.5 text-right">{o.shortlisted}</td>
                      <td className="py-2.5 text-right">{o.offered}</td>
                      <td className="py-2.5 text-right">{o.seats_filled}/{o.seats_total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Card title="Interns">
          <p><strong>{lab.ongoing}</strong> ongoing · <strong>{lab.completed}</strong> completed
            {lab.avg_rating && <> · average rating <strong>{lab.avg_rating}</strong></>}</p>
          <Link href="/faculty/interns" className="mt-2 inline-block text-sm text-accent">Rate and endorse →</Link>
        </Card>
        <Card title="Lab success profile">
          {lab.intern_count ? (
            <p>Built from <strong>{lab.intern_count}</strong> intern{lab.intern_count > 1 ? "s" : ""} rated 4 or 5. Candidate rankings now include how similar students are to them.</p>
          ) : (
            <p className="text-muted">Rate a completed intern 4 or 5 to create it. It powers &ldquo;Like my best interns&rdquo; ranking.</p>
          )}
        </Card>
        <Card title="Match alerts" note="Phase 5">
          <p className="text-muted">Students who just grew into a match for one of your open requirements.</p>
        </Card>
      </div>
    </DashboardShell>
  );
}
