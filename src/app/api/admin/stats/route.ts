import { query } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { fail, failFromError } from "@/lib/api";

// POST /api/admin/stats — refresh the mv_center_stats materialized view.
// The app's database role doesn't own the view, so it calls a SECURITY DEFINER function.
export async function POST() {
  const session = await apiSession("admin");
  if (!session) return fail(403, "Admins only");
  try {
    await query("SELECT fn_refresh_center_stats()");
    return Response.json({ ok: true });
  } catch (err) {
    return failFromError(err);
  }
}
