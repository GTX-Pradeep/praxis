import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { getMongo } from "@/lib/mongo";
import { DashboardShell, PageTitle } from "@/components/DashboardShell";
import { ActionButton } from "@/components/ActionButton";

export const metadata = { title: "Analytics" };

// Each panel runs one of these queries and can show its text, so the
// database concepts behind the dashboard are visible during a demo.

const Q_CENTERS = `SELECT center_name, openings, applications, accepted, offers_made,
       avg_intern_rating, refreshed_at
FROM mv_center_stats            -- materialized view (refreshed on demand)
ORDER BY applications DESC, center_name`;

const Q_SKILL_GAP = `WITH demand AS (               -- skills requested by open openings
  SELECT os.skill_id, SUM(os.weight) AS demand, COUNT(*) AS openings
  FROM opening_skills os JOIN openings o ON o.opening_id = os.opening_id
  WHERE o.status = 'open'
  GROUP BY os.skill_id
), supply AS (                  -- students who list each skill
  SELECT skill_id, COUNT(*) AS students FROM student_skills GROUP BY skill_id
)
SELECT s.name, COALESCE(d.openings, 0) AS openings, COALESCE(d.demand, 0) AS demand,
       COALESCE(sp.students, 0) AS students,
       ROUND(COALESCE(d.demand, 0)::numeric / GREATEST(COALESCE(sp.students, 0), 1), 2) AS pressure
FROM skills s
LEFT JOIN demand d  ON d.skill_id  = s.skill_id
LEFT JOIN supply sp ON sp.skill_id = s.skill_id
WHERE d.demand IS NOT NULL OR sp.students IS NOT NULL
ORDER BY pressure DESC, demand DESC
LIMIT 12`;

const Q_OVERSUBSCRIBED = `SELECT o.title, rc.name AS center, o.seats_total,
       COUNT(a.application_id) AS applicants
FROM openings o
JOIN research_centers rc ON rc.center_id = o.center_id
JOIN applications a      ON a.opening_id = o.opening_id
GROUP BY o.opening_id, rc.name
HAVING COUNT(a.application_id) > o.seats_total     -- more applicants than seats
ORDER BY applicants DESC`;

const Q_FUNNEL = `SELECT new_status AS stage, COUNT(DISTINCT application_id) AS applications
FROM application_status_history                     -- filled by trigger
GROUP BY new_status
ORDER BY ARRAY_POSITION(ARRAY['applied','shortlisted','offered','accepted',
                              'rejected','withdrawn']::application_status[], new_status)`;

const Q_ABOVE_AVG = `SELECT full_name, branch, semester, proof_score, momentum_score
FROM students
WHERE proof_score > (SELECT AVG(proof_score) FROM students)   -- subquery
ORDER BY proof_score DESC
LIMIT 8`;

const M_LANGUAGES = `db.github_profiles.aggregate([
  { $project: { student_id: 1, langs: { $objectToArray: "$language_totals" } } },
  { $unwind: "$langs" },
  { $group: { _id: "$langs.k", bytes: { $sum: "$langs.v" },
              students: { $addToSet: "$student_id" } } },
  { $project: { language: "$_id", bytes: 1, students: { $size: "$students" } } },
  { $sort: { students: -1, bytes: -1 } },
  { $limit: 10 }
])`;

const M_ACTIVITY = `db.activity_logs.aggregate([
  { $match: { ts: { $gte: <7 days ago> } } },
  { $group: { _id: "$action", count: { $sum: 1 }, last: { $max: "$ts" } } },
  { $sort: { count: -1 } }
])`;

function Panel({ title, concept, code, children, action }: {
  title: string; concept: string; code: string; children: React.ReactNode; action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">{concept}</span>
      </div>
      <div className="mt-3 overflow-x-auto text-sm">{children}</div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <details className="text-xs">
          <summary className="cursor-pointer text-muted">Show query</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-paper p-3 text-[11px] leading-relaxed">{code}</pre>
        </details>
        {action}
      </div>
    </section>
  );
}

function Table({ head, rows, right = [] }: { head: string[]; rows: (string | number | null)[][]; right?: number[] }) {
  if (!rows.length) return <p className="text-muted">No data yet.</p>;
  return (
    <table className="w-full min-w-[420px] text-left">
      <thead className="text-xs uppercase tracking-wide text-muted">
        <tr>{head.map((h, i) => <th key={h} className={`py-1.5 ${right.includes(i) ? "text-right" : ""}`}>{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => (
          <tr key={i}>{r.map((c, j) => <td key={j} className={`py-1.5 ${right.includes(j) ? "text-right tabular-nums" : ""}`}>{c ?? "–"}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

async function mongoPanels() {
  try {
    const db = await getMongo();
    const since = new Date(Date.now() - 7 * 864e5);
    const [langs, activity] = await Promise.all([
      db.collection("github_profiles").aggregate<{ language: string; bytes: number; students: number }>([
        { $project: { student_id: 1, langs: { $objectToArray: "$language_totals" } } },
        { $unwind: "$langs" },
        { $group: { _id: "$langs.k", bytes: { $sum: "$langs.v" }, students: { $addToSet: "$student_id" } } },
        { $project: { _id: 0, language: "$_id", bytes: 1, students: { $size: "$students" } } },
        { $sort: { students: -1, bytes: -1 } },
        { $limit: 10 },
      ]).toArray(),
      db.collection("activity_logs").aggregate<{ _id: string; count: number; last: Date }>([
        { $match: { ts: { $gte: since } } },
        { $group: { _id: "$action", count: { $sum: 1 }, last: { $max: "$ts" } } },
        { $sort: { count: -1 } },
      ]).toArray(),
    ]);
    return { langs, activity, ok: true };
  } catch {
    return { langs: [], activity: [], ok: false };
  }
}

export default async function AnalyticsPage() {
  const session = await requireRole("admin");

  const [centers, gap, over, funnel, top, mongo] = await Promise.all([
    query<{ center_name: string; openings: string; applications: string; accepted: string; offers_made: string; avg_intern_rating: string | null; refreshed_at: Date }>(Q_CENTERS),
    query<{ name: string; openings: string; demand: string; students: string; pressure: string }>(Q_SKILL_GAP),
    query<{ title: string; center: string; seats_total: number; applicants: string }>(Q_OVERSUBSCRIBED),
    query<{ stage: string; applications: string }>(Q_FUNNEL),
    query<{ full_name: string; branch: string; semester: number; proof_score: string; momentum_score: string }>(Q_ABOVE_AVG),
    mongoPanels(),
  ]);

  const refreshed = centers.rows[0]?.refreshed_at;
  const maxFunnel = Math.max(1, ...funnel.rows.map((f) => Number(f.applications)));

  return (
    <DashboardShell name={session.name || "Administrator"} role="admin">
      <PageTitle title="Analytics" subtitle="Live queries over PostgreSQL and MongoDB. Open “Show query” on any panel to see how it is computed." />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel
          title="Research centers"
          concept="Materialized view"
          code={Q_CENTERS}
          action={<ActionButton url="/api/admin/stats" label="Refresh view" busyLabel="Refreshing…" variant="ghost" />}
        >
          <Table
            head={["Center", "Openings", "Applications", "Accepted", "Acceptance", "Avg rating"]}
            right={[1, 2, 3, 4, 5]}
            rows={centers.rows.map((c) => [
              c.center_name, c.openings, c.applications, c.accepted,
              Number(c.offers_made) ? `${Math.round((Number(c.accepted) / Number(c.offers_made)) * 100)}%` : null,
              c.avg_intern_rating,
            ])}
          />
          {refreshed && (
            <p className="mt-2 text-xs text-muted">
              Snapshot from {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(refreshed)}
            </p>
          )}
        </Panel>

        <Panel title="Skill demand vs supply" concept="CTE + LEFT JOIN + GROUP BY" code={Q_SKILL_GAP}>
          <Table
            head={["Skill", "Openings", "Demand", "Students", "Pressure"]}
            right={[1, 2, 3, 4]}
            rows={gap.rows.map((g) => [g.name, g.openings, g.demand, g.students, g.pressure])}
          />
          <p className="mt-2 text-xs text-muted">Pressure = total importance weight in open openings ÷ students who list the skill. High means labs need it but few students have it.</p>
        </Panel>

        <Panel title="Application funnel" concept="GROUP BY over trigger-written audit table" code={Q_FUNNEL}>
          {funnel.rows.length === 0 ? <p className="text-muted">No applications yet.</p> : (
            <div className="space-y-1.5">
              {funnel.rows.map((f) => (
                <div key={f.stage} className="grid grid-cols-[90px_1fr_40px] items-center gap-2 text-xs">
                  <span className="capitalize">{f.stage}</span>
                  <span className="h-3 rounded bg-line"><span className="block h-full rounded bg-accent" style={{ width: `${(Number(f.applications) / maxFunnel) * 100}%` }} /></span>
                  <span className="text-right tabular-nums">{f.applications}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Oversubscribed openings" concept="JOIN + GROUP BY + HAVING" code={Q_OVERSUBSCRIBED}>
          <Table
            head={["Opening", "Center", "Seats", "Applicants"]}
            right={[2, 3]}
            rows={over.rows.map((o) => [o.title, o.center, o.seats_total, o.applicants])}
          />
        </Panel>

        <Panel title="Students above average proof-of-work" concept="Subquery" code={Q_ABOVE_AVG}>
          <Table
            head={["Student", "Branch", "Sem", "Proof", "Momentum/mo"]}
            right={[2, 3, 4]}
            rows={top.rows.map((t) => [t.full_name, t.branch, t.semester, Number(t.proof_score).toFixed(0), Number(t.momentum_score).toFixed(1)])}
          />
        </Panel>

        <Panel title="Languages across student GitHub profiles" concept="MongoDB aggregation" code={M_LANGUAGES}>
          {!mongo.ok ? <p className="text-muted">MongoDB is not reachable.</p> : (
            <Table
              head={["Language", "Students", "Code (KB)"]}
              right={[1, 2]}
              rows={mongo.langs.map((l) => [l.language, l.students, Math.round(l.bytes / 1024).toLocaleString("en-IN")])}
            />
          )}
        </Panel>

        <Panel title="Activity in the last 7 days" concept="MongoDB aggregation" code={M_ACTIVITY}>
          {!mongo.ok ? <p className="text-muted">MongoDB is not reachable.</p> : (
            <Table
              head={["Action", "Count", "Last"]}
              right={[1]}
              rows={mongo.activity.map((a) => [
                a._id.replaceAll("_", " "), a.count,
                new Intl.DateTimeFormat("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(a.last),
              ])}
            />
          )}
        </Panel>
      </div>
    </DashboardShell>
  );
}
