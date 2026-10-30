import { withTransaction } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { applicationStatusSchema, firstError } from "@/lib/validation";
import { fail, failFromError, parseId, readJson } from "@/lib/api";
import { logActivity } from "@/lib/activity";

// PATCH /api/applications/:id  { status }
//   faculty → shortlisted | offered | rejected   (only on their own openings)
//   student → withdrawn                          (only their own application)
// Illegal jumps (e.g. applied → offered) are rejected by the
// trg_check_status_transition trigger; every change is logged by trg_log_status_change.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await apiSession("faculty", "student");
  if (!session) return fail(401, "Please log in");

  const id = parseId((await params).id);
  const parsed = applicationStatusSchema.safeParse(await readJson(request));
  if (!id) return fail(400, "Invalid application id");
  if (!parsed.success) return fail(400, firstError(parsed.error));
  const { status } = parsed.data;

  const isFaculty = session.role === "faculty";
  if (isFaculty && status === "withdrawn") return fail(403, "Only the student can withdraw");
  if (!isFaculty && status !== "withdrawn") return fail(403, "Students can only withdraw");

  try {
    const updated = await withTransaction(session.userId, async (client) => {
      const sql = isFaculty
        ? `UPDATE applications a SET status = $1
           FROM openings o
           WHERE a.application_id = $2 AND o.opening_id = a.opening_id AND o.faculty_id = $3
           RETURNING a.application_id`
        : `UPDATE applications SET status = $1
           WHERE application_id = $2 AND student_id = $3
           RETURNING application_id`;
      const { rowCount } = await client.query(sql, [status, id, session.userId]);
      return rowCount;
    });
    if (!updated) return fail(404, "Application not found");

    logActivity({ actorId: session.userId, role: session.role, action: `application_${status}`, entity: "applications", entityId: id });
    return Response.json({ ok: true });
  } catch (err) {
    return failFromError(err);
  }
}
