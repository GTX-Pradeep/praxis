import { query } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { fail, failFromError, parseId } from "@/lib/api";
import { logActivity } from "@/lib/activity";

// PATCH /api/invitations/:id — the invited student declines.
// (Accepting happens by applying: trg_accept_invitation_on_apply.)
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await apiSession("student");
  if (!session) return fail(403, "Only the invited student can respond");
  const id = parseId((await params).id);
  if (!id) return fail(400, "Invalid invitation id");

  try {
    const { rowCount } = await query(
      `UPDATE invitations SET status = 'declined', responded_at = now()
       WHERE invitation_id = $1 AND student_id = $2 AND status = 'pending'`,
      [id, session.userId]
    );
    if (!rowCount) return fail(404, "Invitation not found or already answered");
    logActivity({ actorId: session.userId, role: "student", action: "decline_invitation", entity: "invitations", entityId: id });
    return Response.json({ ok: true });
  } catch (err) {
    return failFromError(err);
  }
}
