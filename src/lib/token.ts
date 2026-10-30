import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./config";

export type SessionPayload = {
  userId: number;
  role: Role;
  name: string;
};

export const SESSION_COOKIE = "praxis_session";
export const SESSION_DAYS = 7;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random string of at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());
}

/** Returns the session, or null if the token is missing, tampered with or expired. */
export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "number" || typeof payload.role !== "string") return null;
    return { userId: payload.userId, role: payload.role as Role, name: String(payload.name ?? "") };
  } catch {
    return null;
  }
}
