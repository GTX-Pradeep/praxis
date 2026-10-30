import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, Card, Stat } from "@/components/DashboardShell";
import { VerifyButton } from "./VerifyButton";
import { ActionButton } from "@/components/ActionButton";

export const metadata = { title: "Admin dashboard" };

export default async function AdminDashboard() {
  const session = await requireRole("admin");

  // GROUP BY: how many users per role
  const roleCounts = await query<{ role: string; n: string }>(
    `SELECT role, COUNT(*) AS n FROM users GROUP BY role ORDER BY role`
  );
  const count = (r: string) => roleCounts.rows.find((x) => x.role === r)?.n ?? "0";

  // JOIN: faculty waiting for verification, oldest first
  const pending = await query<{
    faculty_id: string; full_name: string; email: string; designation: string | null;
    center_name: string | null; created_at: Date; is_head: boolean;
  }>(
    `SELECT f.faculty_id, f.full_name, u.email, f.designation, rc.name AS center_name, u.created_at,
            (rc.head_faculty_id = f.faculty_id) AS is_head
     FROM faculty f
     JOIN users u ON u.user_id = f.faculty_id
     LEFT JOIN research_centers rc ON rc.center_id = f.center_id
     WHERE NOT f.is_verified AND u.is_active
     ORDER BY u.created_at`
  );

  // LEFT JOIN + GROUP BY: faculty and openings per center (centers with none still show)
  const centers = await query<{ name: string; faculty: string; openings: string }>(
    `SELECT rc.name,
            COUNT(DISTINCT f.faculty_id) AS faculty,
            COUNT(DISTINCT o.opening_id) AS openings
     FROM research_centers rc
     LEFT JOIN faculty f  ON f.center_id = rc.center_id
     LEFT JOIN openings o ON o.center_id = rc.center_id
     GROUP BY rc.center_id, rc.name
     ORDER BY faculty DESC, rc.name`
  );

  // How much of the data has vectors for semantic matching
  const vec = (await query<{ openings: string; openings_vec: string; students: string; students_vec: string }>(
    `SELECT (SELECT COUNT(*) FROM openings)                                AS openings,
            (SELECT COUNT(*) FROM openings WHERE embedding IS NOT NULL)    AS openings_vec,
            (SELECT COUNT(*) FROM students)                                AS students,
            (SELECT COUNT(DISTINCT student_id) FROM student_embeddings)    AS students_vec`
  )).rows[0];

  return (
    <DashboardShell name={session.name || "Administrator"} role="admin">
      <h1 className="font-serif text-3xl font-semibold">Admin overview</h1>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Students" value={count("student")} />
        <Stat label="Faculty" value={count("faculty")} />
        <Stat label="Pending verification" value={pending.rowCount ?? 0} />
        <Stat label="Research centers" value={centers.rowCount ?? 0} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Faculty awaiting verification">
          {pending.rows.length === 0 ? (
            <p className="text-muted">No pending accounts.</p>
          ) : (
            <ul className="divide-y divide-line">
              {pending.rows.map((p) => (
                <li key={p.faculty_id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="font-medium">{p.full_name}</div>
                    <div className="text-xs text-muted">
                      {p.email} · {[p.designation, p.center_name].filter(Boolean).join(" · ")}
                      {p.is_head && <span className="ml-1 rounded bg-warn-soft px-1.5 py-0.5 font-medium text-ink">new lab, head</span>}
                    </div>
                  </div>
                  <VerifyButton facultyId={Number(p.faculty_id)} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Research centers">
          <table className="w-full text-left">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr><th className="py-2">Center</th><th className="py-2 text-right">Faculty</th><th className="py-2 text-right">Openings</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {centers.rows.map((c) => (
                <tr key={c.name}>
                  <td className="py-2">{c.name}</td>
                  <td className="py-2 text-right">{c.faculty}</td>
                  <td className="py-2 text-right">{c.openings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="mt-4">
        <Card title="Matching vectors" note="all-MiniLM-L6-v2 · 384 dimensions · pgvector">
          <p>
            Openings with a vector: <strong>{vec.openings_vec}/{vec.openings}</strong> · Students with a vector:{" "}
            <strong>{vec.students_vec}/{vec.students}</strong>
          </p>
          <p className="mt-1 text-xs text-muted">Students get a vector after uploading a resume or syncing GitHub.</p>
          <div className="mt-3">
            <ActionButton url="/api/admin/embeddings" label="Rebuild all vectors" busyLabel="Rebuilding… (can take a minute)"
                          variant="ghost" confirm="Recompute every opening and student vector?" />
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
