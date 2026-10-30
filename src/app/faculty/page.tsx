import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, Card, Stat } from "@/components/DashboardShell";

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

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card title="Post an opening" note="Day 2">
          <p className="text-muted">Describe the work, weight the skills you need, set seats and a deadline.</p>
        </Card>
        <Card title="Ranked candidates" note="Day 3">
          <p className="text-muted">Eligible students ranked by proven fit, with the reasons behind each score.</p>
        </Card>
        <Card title="Find more like my best intern" note="Day 4">
          <p className="text-muted">Ranking against your lab&apos;s success profile from past top-rated interns.</p>
        </Card>
        <Card title="Match alerts" note="Day 5">
          <p className="text-muted">Students who just grew into a match for one of your open requirements.</p>
        </Card>
      </div>
    </DashboardShell>
  );
}
