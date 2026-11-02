import { apiSession } from "@/lib/session";
import { fail, failFromError } from "@/lib/api";
import { rebuildMatchingData } from "@/lib/rebuild";
import { logActivity } from "@/lib/activity";

// POST /api/admin/embeddings — recompute all matching data: vectors, proof-of-work
// and momentum scores, success profiles, match alerts and admin statistics
// (useful after a database reset, loading demo data, or changing the model)
export async function POST() {
  const session = await apiSession("admin");
  if (!session) return fail(403, "Admins only");
  try {
    const result = await rebuildMatchingData();
    logActivity({ actorId: session.userId, role: "admin", action: "rebuild_matching_data", details: result });
    return Response.json(result);
  } catch (err) {
    return failFromError(err);
  }
}
