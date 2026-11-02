import { withTransaction } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { inviteSchema, firstError } from "@/lib/validation";
import { fail, failFromError, readJson } from "@/lib/api";
import { logActivity } from "@/lib/activity";

// POST /api/invitations — faculty invite a suggested student to apply.
// Ownership, eligibility, deadline and "already applied" are enforced by
// the trg_validate_invitation trigger; duplicates by a UNIQUE constraint.
export async function POST(request: Request) {
  const session = await apiSession("faculty");
  if (!session) return fail(403, "Only faculty can invite students");

  const parsed = inviteSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, firstError(parsed.error));
  const { openingId, studentId, message } = parsed.data;

  try {
    const invitationId = await withTransaction(session.userId, async (client) => {
      const { rows } = await client.query<{ invitation_id: string }>(
        `INSERT INTO invitations (opening_id, student_id, invited_by, message)
         VALUES ($1, $2, $3, $4) RETURNING invitation_id`,
        [openingId, studentId, session.userId, message || null]
      );
      return Number(rows[0].invitation_id);
    });
    logActivity({ actorId: session.userId, role: "faculty", action: "invite", entity: "invitations", entityId: invitationId, details: { openingId, studentId } });
    return Response.json({ invitationId }, { status: 201 });
  } catch (err) {
    return failFromError(err);
  }
}
