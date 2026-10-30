import Link from "next/link";
import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, PageTitle, StatusBadge } from "@/components/DashboardShell";
import { embedText, toPgVector } from "@/lib/embed";

export const metadata = { title: "Openings" };

export default async function StudentOpeningsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; domain?: string; eligible?: string; sort?: string }>;
}) {
  const session = await requireRole("student");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const domain = (sp.domain ?? "").trim();
  const onlyEligible = sp.eligible === "1";
  const sort = sp.sort === "deadline" ? "deadline" : "match";

  // Search by meaning: embed the query and compare with each opening's vector.
  // Falls back to keyword-only search if the model can't be loaded.
  let queryVec: string | null = null;
  if (q) {
    try { queryVec = toPgVector(await embedText(q)); } catch { queryVec = null; }
  }

  // Hybrid search: keyword match (full-text, GIN index) OR meaning match (pgvector, cosine),
  // ranked by semantic similarity + a boost for keyword hits. Without a query,
  // openings are ordered by my match score (fn_match_score) or by deadline.
  const openings = await query<{
    opening_id: string; title: string; domain: string; description: string; deadline: Date;
    seats_left: number; stipend: number; duration_weeks: number; min_cgpa: string;
    center_name: string; my_status: string | null; eligible: boolean; skills: string[];
    keyword_hit: boolean; similarity: number | null; match: string;
  }>(
    `WITH base AS (
       SELECT o.*,
              (o.search_tsv @@ plainto_tsquery('english', $2::text)) AS keyword_hit,
              CASE WHEN $5::vector IS NULL OR o.embedding IS NULL THEN NULL
                   ELSE 1 - (o.embedding <=> $5::vector) END AS similarity
       FROM openings o
       WHERE o.status = 'open' AND o.deadline > now()
         AND ($3::text = '' OR o.domain = $3::text)
     )
     SELECT b.opening_id, b.title, b.domain, left(b.description, 220) AS description, b.deadline,
            b.seats_total - b.seats_filled AS seats_left, b.stipend, b.duration_weeks, b.min_cgpa,
            rc.name AS center_name, a.status AS my_status,
            fn_is_eligible($1, b.opening_id) AS eligible,
            b.keyword_hit, b.similarity, m.total_score AS match,
            ARRAY(SELECT s.name FROM opening_skills os JOIN skills s ON s.skill_id = os.skill_id
                  WHERE os.opening_id = b.opening_id ORDER BY os.weight DESC LIMIT 5) AS skills
     FROM base b
     JOIN research_centers rc ON rc.center_id = b.center_id
     LEFT JOIN applications a ON a.opening_id = b.opening_id AND a.student_id = $1
     CROSS JOIN LATERAL fn_match_score($1, b.opening_id) m
     WHERE ($2::text = '' OR b.keyword_hit OR b.similarity > 0.25)
       AND (NOT $4::boolean OR fn_is_eligible($1, b.opening_id))
     ORDER BY
       CASE WHEN $2::text <> '' THEN COALESCE(b.similarity, 0) + CASE WHEN b.keyword_hit THEN 0.3 ELSE 0 END END DESC NULLS LAST,
       CASE WHEN $6::text = 'match' THEN m.total_score END DESC NULLS LAST,
       b.deadline
     LIMIT 50`,
    [session.userId, q, domain, onlyEligible, queryVec, sort]
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
        <input name="q" defaultValue={q} placeholder="Describe what you want to work on, e.g. deep learning for medical scans"
               className="input max-w-md flex-1" />
        <select name="domain" defaultValue={domain} className="input w-auto">
          <option value="">All domains</option>
          {domains.rows.map((d) => <option key={d.domain} value={d.domain}>{d.domain} ({d.n})</option>)}
        </select>
        <select name="sort" defaultValue={sort} className="input w-auto" aria-label="Sort">
          <option value="match">Best match for me</option>
          <option value="deadline">Closing soon</option>
        </select>
        <label className="flex items-center gap-2 px-2 text-sm">
          <input type="checkbox" name="eligible" value="1" defaultChecked={onlyEligible} /> Only ones I&apos;m eligible for
        </label>
        <button className="btn">Search</button>
      </form>

      <p className="mt-4 text-sm text-muted">
        {openings.rows.length} opening{openings.rows.length === 1 ? "" : "s"}{q && <> matching &ldquo;{q}&rdquo;</>}
        {q && !queryVec && <> (keyword search only; the meaning model isn&apos;t loaded)</>}
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
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-md border border-line px-2 py-0.5">{Math.round(Number(o.match) * 100)}% match for you</span>
              {q && !o.keyword_hit && o.similarity !== null && (
                <span className="rounded-md border border-accent px-2 py-0.5 text-accent">Matches by meaning</span>
              )}
            </div>
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
