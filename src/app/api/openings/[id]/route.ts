import { z } from "zod";
import { query } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { fail, failFromError, parseId, readJson } from "@/lib/api";
import { logActivity } from "@/lib/activity";

const patchSchema = z.object({ status: z.enum(["open", "closed"]) });

// PATCH /api/openings/:id — the owning faculty closes or re-opens an opening
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await apiSession("faculty");
  if (!session) return fail(403, "Not allowed");
  const id = parseId((await params).id);
  const parsed = patchSchema.safeParse(await readJson(request));
  if (!id || !parsed.success) return fail(400, "Invalid request");

  try {
    // The WHERE clause enforces ownership; 'filled' openings cannot be re-opened by hand
    const { rowCount } = await query(
      `UPDATE openings SET status = $1
       WHERE opening_id = $2 AND faculty_id = $3 AND status <> 'filled'`,
      [parsed.data.status, id, session.userId]
    );
    if (!rowCount) return fail(404, "Opening not found, not yours, or already filled");
    logActivity({ actorId: session.userId, role: "faculty", action: `opening_${parsed.data.status}`, entity: "openings", entityId: id });
    return Response.json({ ok: true });
  } catch (err) {
    return failFromError(err);
  }
}

// DELETE /api/openings/:id — only allowed while nobody has applied
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await apiSession("faculty");
  if (!session) return fail(403, "Not allowed");
  const id = parseId((await params).id);
  if (!id) return fail(400, "Invalid request");

  try {
    const { rowCount } = await query(
      `DELETE FROM openings o
       WHERE o.opening_id = $1 AND o.faculty_id = $2
         AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.opening_id = o.opening_id)`,
      [id, session.userId]
    );
    if (!rowCount) return fail(409, "Openings with applications cannot be deleted; close it instead");
    logActivity({ actorId: session.userId, role: "faculty", action: "delete_opening", entity: "openings", entityId: id });
    return Response.json({ ok: true });
  } catch (err) {
    return failFromError(err);
  }
}
