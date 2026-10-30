import { withTransaction } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { applySchema, firstError } from "@/lib/validation";
import { fail, failFromError, readJson } from "@/lib/api";
import { logActivity } from "@/lib/activity";

// POST /api/applications — a student applies to an opening.
// Deadline, CGPA, semester and "already interning" rules are enforced by the
// trg_validate_application trigger; its message is shown to the student.
export async function POST(request: Request) {
  const session = await apiSession("student");
  if (!session) return fail(403, "Only students can apply");

  const parsed = applySchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, firstError(parsed.error));
  const { openingId, sop } = parsed.data;

  try {
    const applicationId = await withTransaction(session.userId, async (client) => {
      const { rows } = await client.query<{ application_id: string }>(
        `INSERT INTO applications (student_id, opening_id, sop, match_score)
         VALUES ($1, $2, $3, (SELECT total_score FROM fn_match_score($1, $2)))
         RETURNING application_id`,
        [session.userId, openingId, sop || null]
      );
      return Number(rows[0].application_id);
    });
    logActivity({ actorId: session.userId, role: "student", action: "apply", entity: "applications", entityId: applicationId, details: { openingId } });
    return Response.json({ applicationId }, { status: 201 });
  } catch (err) {
    return failFromError(err);
  }
}
