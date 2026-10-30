import { deleteSession } from "@/lib/session";

// POST /api/auth/logout
export async function POST() {
  await deleteSession();
  return Response.json({ redirect: "/login" });
}
