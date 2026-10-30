import { z } from "zod";
import { query, dbErrorMessage } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { logActivity } from "@/lib/activity";

const bodySchema = z.object({ isVerified: z.boolean() });

// PATCH /api/admin/faculty/:id  — admin verifies (or un-verifies) a faculty account
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await apiSession("admin");
  if (!session) return Response.json({ error: "Not allowed" }, { status: 403 });

  const facultyId = Number((await params).id);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!Number.isInteger(facultyId) || !parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const { rowCount } = await query(
      "UPDATE faculty SET is_verified = $1 WHERE faculty_id = $2",
      [parsed.data.isVerified, facultyId]
    );
    if (!rowCount) return Response.json({ error: "Faculty not found" }, { status: 404 });

    logActivity({
      actorId: session.userId, role: "admin", action: "verify_faculty",
      entity: "faculty", entityId: facultyId, details: { isVerified: parsed.data.isVerified },
    });
    return Response.json({ ok: true });
  } catch (err) {
    const { status, message } = dbErrorMessage(err);
    return Response.json({ error: message }, { status });
  }
}
