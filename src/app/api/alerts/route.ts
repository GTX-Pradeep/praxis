import { z } from "zod";
import { query } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { fail, failFromError, readJson } from "@/lib/api";

const schema = z.object({ alertIds: z.array(z.coerce.number().int().positive()).max(200).optional() });

// PATCH /api/alerts — mark match alerts on MY openings as seen (all of them if no ids are given)
export async function PATCH(request: Request) {
  const session = await apiSession("faculty");
  if (!session) return fail(403, "Only faculty receive match alerts");
  const parsed = schema.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return fail(400, "Invalid request");

  try {
    const { rowCount } = await query(
      `UPDATE match_alerts ma SET is_seen = TRUE
       FROM openings o
       WHERE o.opening_id = ma.opening_id AND o.faculty_id = $1 AND NOT ma.is_seen
         AND ($2::bigint[] IS NULL OR ma.alert_id = ANY($2::bigint[]))`,
      [session.userId, parsed.data.alertIds ?? null]
    );
    return Response.json({ updated: rowCount });
  } catch (err) {
    return failFromError(err);
  }
}
