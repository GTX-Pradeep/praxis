import { withTransaction } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { fail, failFromError, parseId } from "@/lib/api";
import { logActivity } from "@/lib/activity";

// POST /api/applications/:id/accept — the student accepts an offer.
// One transaction runs the sp_accept_offer procedure, which locks the
// opening row, checks seats, accepts, takes the seat, starts the internship
// and withdraws the student's other open applications. All or nothing.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await apiSession("student");
  if (!session) return fail(403, "Only students can accept offers");
  const id = parseId((await params).id);
  if (!id) return fail(400, "Invalid application id");

  try {
    const internshipId = await withTransaction(session.userId, async (client) => {
      const { rows } = await client.query<{ p_internship_id: string }>(
        "CALL sp_accept_offer($1, $2, NULL)",
        [id, session.userId]
      );
      return Number(rows[0].p_internship_id);
    });
    logActivity({ actorId: session.userId, role: "student", action: "accept_offer", entity: "internships", entityId: internshipId, details: { applicationId: id } });
    return Response.json({ internshipId });
  } catch (err) {
    return failFromError(err);
  }
}
