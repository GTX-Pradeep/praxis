import { query } from "@/lib/db";

// GET /api/skills — the skill catalogue, grouped by category in the UI
export async function GET() {
  const { rows } = await query<{ skill_id: string; name: string; category: string }>(
    "SELECT skill_id, name, category FROM skills ORDER BY category, name"
  );
  return Response.json(rows.map((r) => ({ id: Number(r.skill_id), name: r.name, category: r.category })));
}
