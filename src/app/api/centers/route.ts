import { query } from "@/lib/db";

// GET /api/centers — public list for the faculty sign-up form
export async function GET() {
  const { rows } = await query<{ center_id: string; name: string }>(
    "SELECT center_id, name FROM research_centers ORDER BY name"
  );
  return Response.json(rows.map((r) => ({ id: Number(r.center_id), name: r.name })));
}
