import { withTransaction } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { skillsSchema, firstError } from "@/lib/validation";
import { fail, failFromError, readJson } from "@/lib/api";
import { checkAlerts } from "@/lib/vectors";

// PUT /api/student/skills — replace the student's whole skill list in one transaction
export async function PUT(request: Request) {
  const session = await apiSession("student");
  if (!session) return fail(403, "Only students have skills");

  const parsed = skillsSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, firstError(parsed.error));
  const skills = parsed.data.skills;

  try {
    await withTransaction(session.userId, async (client) => {
      await client.query("DELETE FROM student_skills WHERE student_id = $1", [session.userId]);
      if (skills.length) {
        await client.query(
          `INSERT INTO student_skills (student_id, skill_id, proficiency)
           SELECT $1, s.skill_id, s.proficiency
           FROM UNNEST($2::bigint[], $3::smallint[]) AS s(skill_id, proficiency)`,
          [session.userId, skills.map((s) => s.skillId), skills.map((s) => s.proficiency)]
        );
      }
    });
    await checkAlerts(session.userId); // skills are part of the match score
    return Response.json({ ok: true, count: skills.length });
  } catch (err) {
    return failFromError(err);
  }
}
