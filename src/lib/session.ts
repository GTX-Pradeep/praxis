import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { query } from "./db";
import { DASHBOARD, type Role } from "./config";
import { SESSION_COOKIE, SESSION_DAYS, signSession, verifySession, type SessionPayload } from "./token";

export async function createSession(payload: SessionPayload) {
  const token = await signSession(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,                                  // JavaScript in the page cannot read it
    secure: process.env.NODE_ENV === "production",   // HTTPS only in production
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}

/**
 * Use at the top of every protected page or API route. Re-checks the user in
 * the database (the cookie alone is not trusted for authorization), so a
 * deactivated account is locked out immediately.
 */
export async function requireRole(...roles: Role[]): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");

  const { rows } = await query<{ role: Role; is_active: boolean }>(
    "SELECT role, is_active FROM users WHERE user_id = $1",
    [session.userId]
  );
  const user = rows[0];
  if (!user || !user.is_active) redirect("/login");
  if (!roles.includes(user.role)) redirect(DASHBOARD[user.role]);
  return { ...session, role: user.role };
}

/** Same check for API routes: returns the session or null (caller sends 401/403). */
export async function apiSession(...roles: Role[]): Promise<SessionPayload | null> {
  const session = await getSession();
  if (!session) return null;
  const { rows } = await query<{ role: Role; is_active: boolean }>(
    "SELECT role, is_active FROM users WHERE user_id = $1",
    [session.userId]
  );
  const user = rows[0];
  if (!user || !user.is_active || (roles.length && !roles.includes(user.role))) return null;
  return { ...session, role: user.role };
}
