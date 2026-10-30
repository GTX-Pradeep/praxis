import { apiSession } from "@/lib/session";
import { fail, failFromError } from "@/lib/api";
import { rebuildAllEmbeddings } from "@/lib/vectors";
import { logActivity } from "@/lib/activity";

// POST /api/admin/embeddings — recompute every opening and student vector
// (useful after a database reset, seeding, or changing the embedding model)
export async function POST() {
  const session = await apiSession("admin");
  if (!session) return fail(403, "Admins only");
  try {
    const result = await rebuildAllEmbeddings();
    logActivity({ actorId: session.userId, role: "admin", action: "rebuild_embeddings", details: result });
    return Response.json(result);
  } catch (err) {
    return failFromError(err);
  }
}
