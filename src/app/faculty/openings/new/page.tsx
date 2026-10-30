import { requireRole } from "@/lib/session";
import { query } from "@/lib/db";
import { DashboardShell, PageTitle } from "@/components/DashboardShell";
import { OpeningForm } from "./OpeningForm";

export const metadata = { title: "Post an opening" };

export default async function NewOpeningPage() {
  const session = await requireRole("faculty");

  const me = (await query<{ is_verified: boolean; center_name: string | null }>(
    `SELECT f.is_verified, rc.name AS center_name
     FROM faculty f LEFT JOIN research_centers rc ON rc.center_id = f.center_id
     WHERE f.faculty_id = $1`,
    [session.userId]
  )).rows[0];

  const skills = (await query<{ skill_id: string; name: string; category: string }>(
    "SELECT skill_id, name, category FROM skills ORDER BY category, name"
  )).rows.map((s) => ({ id: Number(s.skill_id), name: s.name, category: s.category }));

  // Default deadline two weeks out, in India time, formatted for <input type="datetime-local">
  const defaultDeadline = (await query<{ d: string }>(
    `SELECT to_char((now() AT TIME ZONE 'Asia/Kolkata') + interval '14 days', 'YYYY-MM-DD"T"HH24:MI') AS d`
  )).rows[0].d;

  return (
    <DashboardShell name={session.name} role="faculty">
      <PageTitle title="Post an opening" subtitle={me.center_name ? `For ${me.center_name}` : undefined} />
      <div className="mt-6 max-w-3xl">
        {me.is_verified ? (
          <OpeningForm skills={skills} defaultDeadline={defaultDeadline} />
        ) : (
          <p className="rounded-lg bg-warn-soft px-4 py-3 text-sm">
            Your account is waiting for admin verification. You can post openings once it is verified.
          </p>
        )}
      </div>
    </DashboardShell>
  );
}
