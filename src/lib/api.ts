import "server-only";
import { dbErrorMessage } from "./db";

/** JSON error response */
export function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

/** Convert any thrown error (usually from PostgreSQL) into a safe JSON response */
export function failFromError(err: unknown) {
  const { status, message } = dbErrorMessage(err);
  return fail(status, message);
}

/** Read a JSON body, returning null on invalid JSON */
export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

/** Parse a positive integer route id */
export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
