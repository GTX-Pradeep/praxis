import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { createSession } from "@/lib/session";
import { loginSchema, firstError } from "@/lib/validation";
import { logActivity } from "@/lib/activity";
import { DASHBOARD, type Role } from "@/lib/config";

// Compared against when the email does not exist, so a wrong email and a
// wrong password take the same time (prevents guessing which emails exist).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

// POST /api/auth/login
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: firstError(parsed.error) }, { status: 400 });
  }
  const { email, password } = parsed.data;

  // LEFT JOINs pick the display name from whichever role table applies
  const { rows } = await query<{
    user_id: string; password_hash: string; role: Role; is_active: boolean; name: string | null;
  }>(
    `SELECT u.user_id, u.password_hash, u.role, u.is_active,
            COALESCE(s.full_name, f.full_name, 'Administrator') AS name
     FROM users u
     LEFT JOIN students s ON s.student_id = u.user_id
     LEFT JOIN faculty  f ON f.faculty_id = u.user_id
     WHERE u.email = $1`,
    [email]
  );
  const user = rows[0];
  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  if (!user || !valid) {
    return Response.json({ error: "Incorrect email or password." }, { status: 401 });
  }
  if (!user.is_active) {
    return Response.json({ error: "This account has been deactivated." }, { status: 403 });
  }

  const userId = Number(user.user_id);
  await createSession({ userId, role: user.role, name: user.name ?? "" });
  logActivity({ actorId: userId, role: user.role, action: "login", entity: "users", entityId: userId });
  return Response.json({ redirect: DASHBOARD[user.role] });
}
