import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, PageTitle, StatusBadge } from "@/components/DashboardShell";
import { ActionButton } from "@/components/ActionButton";

export const metadata = { title: "My applications" };

const fmt = (d: string | Date) =>
  new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(d));

export default async function MyApplicationsPage() {
  const session = await requireRole("student");

  // Each application with its full status history (json_agg over the audit table)
  const apps = await query<{
    application_id: string; status: string; applied_at: Date; opening_id: string; title: string;
    center_name: string; internship_start: Date | null;
    history: { status: string; at: string }[];
  }>(
    `SELECT a.application_id, a.status, a.applied_at, o.opening_id, o.title, rc.name AS center_name,
            i.start_date AS internship_start,
            COALESCE((SELECT json_agg(json_build_object('status', h.new_status, 'at', h.changed_at)
                                      ORDER BY h.changed_at)
                      FROM application_status_history h
                      WHERE h.application_id = a.application_id), '[]') AS history
     FROM applications a
     JOIN openings o          ON o.opening_id = a.opening_id
     JOIN research_centers rc ON rc.center_id = o.center_id
     LEFT JOIN internships i  ON i.application_id = a.application_id
     WHERE a.student_id = $1
     ORDER BY CASE a.status WHEN 'offered' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, a.applied_at DESC`,
    [session.userId]
  );

  const offers = apps.rows.filter((a) => a.status === "offered");

  return (
    <DashboardShell name={session.name} role="student">
      <PageTitle title="My applications" subtitle="Every status change is recorded, newest at the end of each timeline." />

      {offers.length > 0 && (
        <p className="mt-5 rounded-lg bg-accent-soft px-4 py-3 text-sm">
          You have {offers.length} offer{offers.length > 1 ? "s" : ""}. Accepting one automatically withdraws your other open applications.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {apps.rows.map((a) => (
          <div key={a.application_id} className="rounded-xl border border-line bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Link href={`/student/openings/${a.opening_id}`} className="font-serif text-lg font-semibold hover:text-accent">{a.title}</Link>
                <p className="text-sm text-muted">{a.center_name} · applied {fmt(a.applied_at)}</p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <StatusBadge status={a.status} />
                {a.status === "offered" && (
                  <ActionButton url={`/api/applications/${a.application_id}/accept`} label="Accept offer" busyLabel="Accepting…"
                                confirm="Accept this internship? Your other open applications will be withdrawn." />
                )}
                {["applied", "shortlisted", "offered"].includes(a.status) && (
                  <ActionButton url={`/api/applications/${a.application_id}`} method="PATCH" body={{ status: "withdrawn" }}
                                label="Withdraw" variant="danger" confirm="Withdraw this application?" />
                )}
              </div>
            </div>

            <ol className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              {a.history.map((h, i) => (
                <li key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted">→</span>}
                  <span className="rounded-md border border-line px-2 py-1">
                    <span className="font-semibold capitalize">{h.status}</span>
                    <span className="ml-1 text-muted">{fmt(h.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
            {a.internship_start && (
              <p className="mt-3 text-sm text-accent">Internship started {a.internship_start.toLocaleDateString("en-IN")}</p>
            )}
          </div>
        ))}
        {apps.rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-line p-8 text-center text-muted">
            You haven&apos;t applied anywhere yet. <Link href="/student/openings" className="text-accent">Browse openings</Link>
          </p>
        )}
      </div>
    </DashboardShell>
  );
}
