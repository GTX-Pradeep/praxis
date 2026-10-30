import { query, withTransaction } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { openingSchema, firstError } from "@/lib/validation";
import { fail, failFromError, readJson } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { refreshOpeningEmbedding } from "@/lib/vectors";

// POST /api/openings — a verified faculty member posts a new opening
export async function POST(request: Request) {
  const session = await apiSession("faculty");
  if (!session) return fail(403, "Only faculty can post openings");

  const { rows } = await query<{ is_verified: boolean; center_id: string | null }>(
    "SELECT is_verified, center_id FROM faculty WHERE faculty_id = $1",
    [session.userId]
  );
  const me = rows[0];
  if (!me?.is_verified) return fail(403, "Your account must be verified by an admin first");
  if (!me.center_id) return fail(400, "Your account is not linked to a research center");

  const parsed = openingSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, firstError(parsed.error));
  const d = parsed.data;

  try {
    // Opening + its skills + eligible semesters are saved together or not at all
    const openingId = await withTransaction(session.userId, async (client) => {
      const o = await client.query<{ opening_id: string }>(
        `INSERT INTO openings (center_id, faculty_id, title, description, domain, seats_total,
                               min_cgpa, duration_weeks, stipend, deadline, alert_threshold)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING opening_id`,
        [me.center_id, session.userId, d.title, d.description, d.domain, d.seatsTotal,
         d.minCgpa, d.durationWeeks, d.stipend, d.deadline, d.alertThreshold]
      );
      const id = Number(o.rows[0].opening_id);

      // Multi-row INSERT using arrays (UNNEST) instead of one query per skill
      await client.query(
        `INSERT INTO opening_skills (opening_id, skill_id, weight)
         SELECT $1, s.skill_id, s.weight
         FROM UNNEST($2::bigint[], $3::smallint[]) AS s(skill_id, weight)`,
        [id, d.skills.map((s) => s.skillId), d.skills.map((s) => s.weight)]
      );
      if (d.semesters.length) {
        await client.query(
          `INSERT INTO opening_eligible_semesters (opening_id, semester)
           SELECT $1, UNNEST($2::smallint[])`,
          [id, [...new Set(d.semesters)]]
        );
      }
      return id;
    });

    // Vector for semantic matching (stored in openings.embedding via pgvector)
    const embedded = await refreshOpeningEmbedding(openingId);

    logActivity({ actorId: session.userId, role: "faculty", action: "create_opening", entity: "openings", entityId: openingId });
    return Response.json({ openingId, embedded }, { status: 201 });
  } catch (err) {
    return failFromError(err);
  }
}
