import "server-only";
import { after } from "next/server";
import { Long } from "mongodb";
import { getMongo } from "./mongo";
import type { Role } from "./config";

/** Append an audit entry to MongoDB after the response is sent. Never blocks or breaks the request. */
export function logActivity(entry: {
  actorId: number | null;
  role: Role | "system";
  action: string;
  entity?: string;
  entityId?: number | string;
  details?: Record<string, unknown>;
}) {
  after(async () => {
    try {
      const db = await getMongo();
      await db.collection("activity_logs").insertOne({
        actor_id: entry.actorId === null ? null : Long.fromNumber(entry.actorId),
        role: entry.role,
        action: entry.action,
        entity: entry.entity ?? "",
        entity_id: typeof entry.entityId === "number" ? Long.fromNumber(entry.entityId) : entry.entityId ?? null,
        details: entry.details ?? {},
        ts: new Date(),
      });
    } catch (err) {
      console.warn("activity log skipped:", (err as Error).message);
    }
  });
}
