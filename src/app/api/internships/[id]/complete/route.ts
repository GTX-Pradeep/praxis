import { withTransaction } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { completeInternshipSchema, firstError } from "@/lib/validation";
import { fail, failFromError, parseId, readJson } from "@/lib/api";
import { logActivity } from "@/lib/activity";

// POST /api/internships/:id/complete — the supervising faculty member closes an
// internship with an end date, a 1–5 rating, remarks and skill endorsements.
//
// One transaction:
//   1. lock the internship row and check ownership
//   2. set end date + rating   → trg_internship_rated refreshes the lab's success profile
//   3. insert endorsements     → trg_validate_endorsement re-checks completion + supervisor
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await apiSession("faculty");
  if (!session) return fail(403, "Only faculty can complete internships");

  const id = parseId((await params).id);
  const parsed = completeInternshipSchema.safeParse(await readJson(request));
  if (!id) return fail(400, "Invalid internship id");
  if (!parsed.success) return fail(400, firstError(parsed.error));
  const d = parsed.data;

  try {
    const result = await withTransaction(session.userId, async (client) => {
      const { rows } = await client.query<{ end_date: Date | null; faculty_id: string; student_id: string }>(
        `SELECT i.end_date, o.faculty_id, a.student_id
         FROM internships i
         JOIN applications a ON a.application_id = i.application_id
         JOIN openings o     ON o.opening_id     = a.opening_id
         WHERE i.internship_id = $1
         FOR UPDATE OF i`,
        [id]
      );
      const row = rows[0];
      if (!row || Number(row.faculty_id) !== session.userId) return { status: 404 as const };
      if (row.end_date) return { status: 409 as const };

      await client.query(
        `UPDATE internships SET end_date = $1::date, final_rating = $2, remarks = $3 WHERE internship_id = $4`,
        [d.endDate, d.rating, d.remarks || null, id]
      );
      if (d.skillIds.length) {
        await client.query(
          `INSERT INTO skill_endorsements (internship_id, skill_id, endorsed_by)
           SELECT $1, UNNEST($2::bigint[]), $3
           ON CONFLICT DO NOTHING`,
          [id, [...new Set(d.skillIds)], session.userId]
        );
      }
      return { status: 200 as const, studentId: Number(row.student_id) };
    });

    if (result.status === 404) return fail(404, "Internship not found");
    if (result.status === 409) return fail(409, "This internship is already completed");

    logActivity({
      actorId: session.userId, role: "faculty", action: "complete_internship", entity: "internships", entityId: id,
      details: { rating: d.rating, endorsed: d.skillIds.length },
    });
    return Response.json({ ok: true });
  } catch (err) {
    return failFromError(err);
  }
}
