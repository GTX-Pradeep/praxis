import "server-only";
import { Long, type Db } from "mongodb";
import { query } from "./db";
import { proofPipeline, type ProofResult } from "./proof";
import { momentumPipeline, monthsAgo } from "./momentum";

/** Current month as "YYYY-MM" in India time */
export function currentMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" })
    .format(new Date()).slice(0, 7);
}

/**
 * Recompute one student's proof-of-work and momentum from their MongoDB documents:
 *   1. proof-of-work  ← aggregation over github_profiles      → students.proof_score
 *   2. this month's snapshot is upserted into profile_snapshots
 *   3. momentum       ← aggregation over profile_snapshots    → students.momentum_score
 * Returns null if the student has no GitHub profile document.
 */
export async function recomputeStudentScores(mongo: Db, studentId: number) {
  const sid = Long.fromNumber(studentId);
  const [proof] = (await mongo.collection("github_profiles").aggregate(proofPipeline(sid)).toArray()) as unknown as ProofResult[];
  if (!proof) return null;

  const skills = (await query<{ name: string }>(
    `SELECT s.name FROM student_skills ss JOIN skills s ON s.skill_id = ss.skill_id WHERE ss.student_id = $1 ORDER BY s.name`,
    [studentId]
  )).rows.map((r) => r.name);

  await mongo.collection("profile_snapshots").updateOne(
    { student_id: sid, month: currentMonth() },
    { $set: {
        repo_count: proof.total_repos,
        original_repo_count: proof.original_repos,
        own_commits: proof.own_commits,
        skills,
        proof_score: proof.score,
        taken_at: new Date(),
    } },
    { upsert: true }
  );

  const [mom] = await mongo.collection("profile_snapshots").aggregate(momentumPipeline(sid, monthsAgo(5))).toArray();
  const momentum = Number(mom?.momentum ?? 0);

  await query(
    "UPDATE students SET proof_score = $1, momentum_score = $2, profile_updated_at = now() WHERE student_id = $3",
    [proof.score, momentum, studentId]
  );
  return { proof, momentum, skills };
}
