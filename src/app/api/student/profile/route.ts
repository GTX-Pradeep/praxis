import { query } from "@/lib/db";
import { apiSession } from "@/lib/session";
import { githubUsernameSchema, firstError } from "@/lib/validation";
import { fail, failFromError, readJson } from "@/lib/api";

// PATCH /api/student/profile — link or change the GitHub username
export async function PATCH(request: Request) {
  const session = await apiSession("student");
  if (!session) return fail(403, "Not allowed");

  const parsed = githubUsernameSchema.safeParse(await readJson(request));
  if (!parsed.success) return fail(400, firstError(parsed.error));

  try {
    await query(
      "UPDATE students SET github_username = $1, profile_updated_at = now() WHERE student_id = $2",
      [parsed.data.githubUsername, session.userId]
    );
    return Response.json({ ok: true });
  } catch (err) {
    return failFromError(err);
  }
}
