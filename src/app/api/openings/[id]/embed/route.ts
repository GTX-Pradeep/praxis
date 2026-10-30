import { query } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { fail, parseId } from "@/lib/api";
import { refreshOpeningEmbedding } from "@/lib/vectors";

// POST /api/openings/:id/embed — (re)compute an opening's vector, owner only
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await apiSession("faculty");
  if (!session) return fail(403, "Not allowed");
  const id = parseId((await params).id);
  if (!id) return fail(400, "Invalid request");

  const own = await query("SELECT 1 FROM openings WHERE opening_id = $1 AND faculty_id = $2", [id, session.userId]);
  if (!own.rowCount) return fail(404, "Opening not found");

  const ok = await refreshOpeningEmbedding(id);
  return ok ? Response.json({ ok: true }) : fail(503, "The embedding model could not be loaded. Check your internet connection and try again.");
}
