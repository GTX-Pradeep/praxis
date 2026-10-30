import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

// One connection pool per server process (reused across hot reloads in dev).
const globalForPg = globalThis as unknown as { pgPool?: Pool };

function createPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  }
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
}

export function getPool(): Pool {
  if (!globalForPg.pgPool) globalForPg.pgPool = createPool();
  return globalForPg.pgPool;
}

/** Run one parameterized query. Never build SQL by string concatenation. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  return getPool().query<T>(text, params);
}

/**
 * Run several statements as ONE transaction (all succeed or none do).
 * `actorId` is passed to the database so triggers can record who did it.
 */
export async function withTransaction<T>(
  actorId: number | null,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (actorId !== null) {
      // Equivalent to SET LOCAL app.current_user_id = ..., but parameterized
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(actorId)]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Turn a PostgreSQL error into a message that is safe to show users. */
export function dbErrorMessage(err: unknown): { status: number; message: string } {
  const e = err as { code?: string; constraint?: string; message?: string; name?: string };
  if (e.name?.startsWith("Mongo")) {
    console.error(err);
    return { status: 503, message: "The document database is unavailable. Is MongoDB running?" };
  }
  if ((e as { code?: unknown }).code === "ECONNREFUSED") {
    return { status: 503, message: "The database is unavailable. Is Docker running?" };
  }
  switch (e.code) {
    case "23505": {
      const map: Record<string, string> = {
        users_email_key: "An account with this email already exists.",
        students_srn_key: "This SRN is already registered.",
        students_github_username_key: "This GitHub username is already linked to another account.",
        uq_application_once: "You have already applied to this opening.",
        research_centers_name_key: "A research center with this name already exists. Pick it from the list instead.",
      };
      return { status: 409, message: map[e.constraint ?? ""] ?? "This record already exists." };
    }
    case "23503":
      return { status: 400, message: "A referenced record does not exist." };
    case "23514": { // check_violation, including messages raised by our triggers
      const friendly: Record<string, string> = {
        chk_internship_dates: "The end date can't be before the start date.",
        chk_internship_rating: "Ratings must be between 1 and 5.",
        chk_rating_after_end: "Set an end date before rating the internship.",
        chk_students_cgpa: "CGPA must be between 0 and 10.",
        chk_students_semester: "Semester must be between 1 and 8.",
        chk_students_github: "That is not a valid GitHub username.",
        chk_users_email_format: "Enter a valid email address.",
        chk_openings_deadline: "The deadline must be in the future.",
        chk_openings_filled: "All seats for this opening are already filled.",
        chk_openings_seats: "Seats must be between 1 and 50.",
        chk_application_sop: "The statement of purpose is too long.",
      };
      return {
        status: 400,
        message: e.constraint ? friendly[e.constraint] ?? `Invalid value (${e.constraint}).` : e.message ?? "Invalid value.",
      };
    }
    case "22P02":
      return { status: 400, message: "Invalid input format." };
    case "P0002": // no_data_found raised by a procedure
      return { status: 404, message: e.message ?? "Not found." };
    default:
      console.error(err);
      return { status: 500, message: "Something went wrong. Please try again." };
  }
}
