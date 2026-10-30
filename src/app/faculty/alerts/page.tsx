import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, Card, PageTitle, StatusBadge } from "@/components/DashboardShell";
import { ActionButton } from "@/components/ActionButton";

export const metadata = { title: "Match alerts" };

const fmt = (d: Date) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);

export default async function AlertsPage() {
  const session = await requireRole("faculty");

  // Alerts are written by fn_check_alerts whenever a student's resume, GitHub or
  // skills change and their match for one of my open openings crosses its threshold.
  const alerts = await query<{
    alert_id: string; score: string; is_seen: boolean; created_at: Date; opening_id: string; title: string;
    alert_threshold: string; full_name: string; srn: string; branch: string; semester: number; cgpa: string;
    proof_score: string; momentum_score: string; application_status: string | null;
  }>(
    `SELECT ma.alert_id, ma.score, ma.is_seen, ma.created_at, o.opening_id, o.title, o.alert_threshold,
            s.full_name, s.srn, s.branch, s.semester, s.cgpa, s.proof_score, s.momentum_score,
            a.status AS application_status
     FROM match_alerts ma
     JOIN openings o ON o.opening_id = ma.opening_id
     JOIN students s ON s.student_id = ma.student_id
     LEFT JOIN applications a ON a.opening_id = ma.opening_id AND a.student_id = ma.student_id
     WHERE o.faculty_id = $1
     ORDER BY ma.is_seen, ma.created_at DESC
     LIMIT 100`,
    [session.userId]
  );
  const unseen = alerts.rows.filter((a) => !a.is_seen).length;

  return (
    <DashboardShell name={session.name} role="faculty">
      <PageTitle
        title="Match alerts"
        subtitle="Students whose updated profile now matches one of your open openings above its alert threshold."
        action={unseen > 0 ? <ActionButton url="/api/alerts" method="PATCH" body={{}} label={`Mark all ${unseen} as seen`} variant="ghost" /> : undefined}
      />
      <div className="mt-6">
        <Card title={`${unseen} new · ${alerts.rows.length} total`}>
          {alerts.rows.length === 0 ? (
            <p className="text-muted">No alerts yet. They appear when a student uploads a resume, syncs GitHub or updates skills and becomes a strong match.</p>
          ) : (
            <ul className="divide-y divide-line">
              {alerts.rows.map((a) => (
                <li key={a.alert_id} className={`flex flex-wrap items-start justify-between gap-3 py-3 ${a.is_seen ? "opacity-70" : ""}`}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      {!a.is_seen && <span className="h-2 w-2 rounded-full bg-accent" aria-label="new" />}
                      <span className="font-medium">{a.full_name}</span>
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{Math.round(Number(a.score) * 100)}% match</span>
                      {a.application_status && <StatusBadge status={a.application_status} />}
                      {Number(a.momentum_score) > 0 && <span className="text-xs text-accent">↑ +{Number(a.momentum_score).toFixed(1)} proof/month</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {a.srn} · {a.branch} · Sem {a.semester} · CGPA {Number(a.cgpa).toFixed(2)} · proof-of-work {Number(a.proof_score).toFixed(0)}
                    </div>
                    <div className="mt-0.5 text-xs">
                      for <Link href={`/faculty/openings/${a.opening_id}`} className="text-accent">{a.title}</Link>
                      <span className="text-muted"> (threshold {Math.round(Number(a.alert_threshold) * 100)}%) · {fmt(a.created_at)}</span>
                    </div>
                  </div>
                  {!a.is_seen && (
                    <ActionButton url="/api/alerts" method="PATCH" body={{ alertIds: [Number(a.alert_id)] }} label="Mark seen" variant="ghost" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}
