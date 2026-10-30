import bcrypt from "bcryptjs";
import { withTransaction, dbErrorMessage } from "@/lib/db";
import { createSession } from "@/lib/session";
import { registerSchema, firstError } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { DASHBOARD } from "@/lib/config";

// POST /api/auth/register  — students and faculty sign up here.
// Admin accounts are created only by the seed script.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const data = parsed.data;
  const passwordHash = await bcrypt.hash(data.password, 12);

  try {
    // users + students/faculty rows are written in ONE transaction:
    // if the second insert fails, the user row is rolled back too.
    const userId = await withTransaction(null, async (client) => {
      const { rows } = await client.query<{ user_id: string }>(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING user_id`,
        [data.email, passwordHash, data.role]
      );
      const id = Number(rows[0].user_id);

      if (data.role === "student") {
        await client.query(
          `INSERT INTO students (student_id, srn, full_name, branch, semester, cgpa, github_username)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, data.srn, data.fullName, data.branch, data.semester, data.cgpa, data.githubUsername ?? null]
        );
      } else {
        let centerId = data.centerId ?? null;
        const createsCenter = centerId === null && data.newCenterName;

        // New lab: create the center first (faculty row needs its id)
        if (createsCenter) {
          const c = await client.query<{ center_id: string }>(
            `INSERT INTO research_centers (name, description) VALUES ($1, $2) RETURNING center_id`,
            [data.newCenterName, data.newCenterDescription ?? null]
          );
          centerId = Number(c.rows[0].center_id);
        }

        await client.query(
          `INSERT INTO faculty (faculty_id, center_id, full_name, designation) VALUES ($1, $2, $3, $4)`,
          [id, centerId, data.fullName, data.designation ?? null]
        );

        // ...then make the creator its head (circular FK, so this comes last)
        if (createsCenter) {
          await client.query(
            `UPDATE research_centers SET head_faculty_id = $1 WHERE center_id = $2`,
            [id, centerId]
          );
        }
      }
      return id;
    });

    await createSession({ userId, role: data.role, name: data.fullName });
    logActivity({ actorId: userId, role: data.role, action: "register", entity: "users", entityId: userId });
    return Response.json({ redirect: DASHBOARD[data.role] }, { status: 201 });
  } catch (err) {
    const { status, message } = dbErrorMessage(err);
    return Response.json({ error: message }, { status });
  }
}
