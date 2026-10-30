import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, PageTitle, StatusBadge } from "@/components/DashboardShell";

export const metadata = { title: "Openings" };

export default async function StudentOpeningsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; domain?: string; eligible?: string }>;
}) {
  const session = await requireRole("student");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const domain = (sp.domain ?? "").trim();
  const onlyEligible = sp.eligible === "1";

  // Full-text search (GIN index on search_tsv) + filters + my application status
  const openings = await query<{
    opening_id: string; title: string; domain: string; description: string; deadline: Date;
    seats_left: number; stipend: number; duration_weeks: number; min_cgpa: string;
    center_name: string; my_status: string | null; eligible: boolean; skills: string[];
  }>(
    `SELECT o.opening_id, o.title, o.domain, left(o.description, 220) AS description, o.deadline,
            o.seats_total - o.seats_filled AS seats_left, o.stipend, o.duration_weeks, o.min_cgpa,
            rc.name AS center_name, a.status AS my_status,
            fn_is_eligible($1, o.opening_id) AS eligible,
            ARRAY(SELECT s.name FROM opening_skills os JOIN skills s ON s.skill_id = os.skill_id
                  WHERE os.opening_id = o.opening_id ORDER BY os.weight DESC LIMIT 5) AS skills
     FROM openings o
     JOIN research_centers rc ON rc.center_id = o.center_id
     LEFT JOIN applications a ON a.opening_id = o.opening_id AND a.student_id = $1
     WHERE o.status = 'open'
       AND o.deadline > now()
       AND ($2::text = '' OR o.search_tsv @@ plainto_tsquery('english', $2::text))
       AND ($3::text = '' OR o.domain = $3::text)
       AND (NOT $4::boolean OR fn_is_eligible($1, o.opening_id))
     ORDER BY CASE WHEN $2::text = '' THEN 0
                   ELSE ts_rank(o.search_tsv, plainto_tsquery('english', $2::text)) END DESC,
              o.deadline
     LIMIT 50`,
    [session.userId, q, domain, onlyEligible]
  );

  const domains = await query<{ domain: string; n: string }>(
    `SELECT domain, COUNT(*) AS n FROM openings
     WHERE status = 'open' AND deadline > now()
     GROUP BY domain ORDER BY n DESC, domain`
  );

  return (
    <DashboardShell name={session.name} role="student">
      <PageTitle title="Open research internships" subtitle="Search by topic, technique or lab." />

      <form className="mt-6 flex flex-wrap gap-2" action="/student/openings">
        <input name="q" defaultValue={q} placeholder="e.g. medical imaging, robotics, transformers"
               className="input max-w-md flex-1" />
        <select name="domain" defaultValue={domain} className="input w-auto">
          <option value="">All domains</option>
          {domains.rows.map((d) => <option key={d.domain} value={d.domain}>{d.domain} ({d.n})</option>)}
        </select>
        <label className="flex items-center gap-2 px-2 text-sm">
          <input type="checkbox" name="eligible" value="1" defaultChecked={onlyEligible} /> Only ones I&apos;m eligible for
        </label>
        <button className="btn">Search</button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {openings.rows.length} opening{openings.rows.length === 1 ? "" : "s"}{q && <> matching &ldquo;{q}&rdquo;</>}
      </p>

      <div className="mt-3 grid gap-4 md:grid-cols-2">
        {openings.rows.map((o) => (
          <Link key={o.opening_id} href={`/student/openings/${o.opening_id}`}
                className="block rounded-xl border border-line bg-card p-5 transition hover:border-accent">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-serif text-lg font-semibold">{o.title}</h2>
              {o.my_status ? <StatusBadge status={o.my_status} /> : !o.eligible && (
                <span className="shrink-0 rounded-full bg-line px-2.5 py-0.5 text-xs text-muted">Not eligible</span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-accent">{o.center_name}</p>
            <p className="mt-2 text-sm text-muted">{o.description}{o.description.length >= 220 ? "…" : ""}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {o.skills.map((s) => <span key={s} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs">{s}</span>)}
            </div>
            <p className="mt-3 text-xs text-muted">
              {o.domain} · {o.duration_weeks} weeks · {o.stipend ? `₹${o.stipend.toLocaleString("en-IN")}/mo` : "Unpaid"} ·
              {" "}{o.seats_left} seat{o.seats_left === 1 ? "" : "s"} left · Closes {o.deadline.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
            </p>
          </Link>
        ))}
      </div>
      {openings.rows.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-line p-8 text-center text-muted">
          No open openings match. Try a different search.
        </p>
      )}
    </DashboardShell>
  );
}
