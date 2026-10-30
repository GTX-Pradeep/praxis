import { Long } from "mongodb";
import { query } from "@/lib/db";
import { getMongo } from "@/lib/mongo";
import { apiSession } from "@/lib/session";
import { fail, failFromError } from "@/lib/api";
import { fetchGithubProfile, GithubError } from "@/lib/github";
import { proofPipeline, proofSummary, type ProofResult } from "@/lib/proof";
import { detectSkills } from "@/lib/skills-detect";
import { logActivity } from "@/lib/activity";

const COOLDOWN_MS = 5 * 60 * 1000;

// POST /api/student/github/sync
//  1. fetch public repos + commit authorship from GitHub
//  2. store the snapshot in MongoDB (github_profiles)
//  3. compute the proof-of-work score with a MongoDB aggregation pipeline
//  4. save the score in PostgreSQL (students.proof_score)
//  5. record this month's growth snapshot (profile_snapshots)
export async function POST() {
  const session = await apiSession("student");
  if (!session) return fail(403, "Only students can sync GitHub");

  const { rows } = await query<{ github_username: string | null }>(
    "SELECT github_username FROM students WHERE student_id = $1", [session.userId]
  );
  const username = rows[0]?.github_username;
  if (!username) return fail(400, "Link your GitHub username first");

  const sid = Long.fromNumber(session.userId);
  try {
    const mongo = await getMongo();
    const profiles = mongo.collection("github_profiles");

    const prev = await profiles.findOne({ student_id: sid }, { projection: { fetched_at: 1, username: 1 } });
    if (prev && prev.username === username && Date.now() - new Date(prev.fetched_at).getTime() < COOLDOWN_MS) {
      return fail(429, "GitHub was synced a few minutes ago. Please wait before syncing again.");
    }

    const gh = await fetchGithubProfile(username);

    await profiles.replaceOne(
      { student_id: sid },
      { student_id: sid, username: gh.username, repos: gh.repos, language_totals: gh.language_totals, fetched_at: new Date() },
      { upsert: true }
    );

    const [proof] = (await profiles.aggregate(proofPipeline(sid)).toArray()) as unknown as ProofResult[];

    await query(
      "UPDATE students SET proof_score = $1, profile_updated_at = now() WHERE student_id = $2",
      [proof.score, session.userId]
    );

    // Monthly snapshot (one per student per month, upserted) for the growth timeline
    const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" })
      .format(new Date()).slice(0, 7);
    const skillNames = (await query<{ name: string }>(
      `SELECT s.name FROM student_skills ss JOIN skills s ON s.skill_id = ss.skill_id WHERE ss.student_id = $1`,
      [session.userId]
    )).rows.map((r) => r.name);
    await mongo.collection("profile_snapshots").updateOne(
      { student_id: sid, month },
      { $set: {
          repo_count: proof.total_repos,
          original_repo_count: proof.original_repos,
          own_commits: proof.own_commits,
          skills: skillNames,
          proof_score: proof.score,
          taken_at: new Date(),
      } },
      { upsert: true }
    );

    // Skills visible in the repos (languages + topics) that the student hasn't listed yet
    const evidence = [
      ...Object.keys(gh.language_totals),
      ...gh.repos.filter((r) => !r.is_fork).flatMap((r) => [...r.topics, r.description ?? ""]),
    ].join(" ");
    const suggested = (await detectSkills(evidence)).filter((s) => !skillNames.includes(s.name));

    logActivity({ actorId: session.userId, role: "student", action: "github_sync", entity: "github_profiles", details: { score: proof.score } });
    return Response.json({ proof, summary: proofSummary(proof), suggestedSkills: suggested });
  } catch (err) {
    if (err instanceof GithubError) return fail(err.status, err.message);
    return failFromError(err);
  }
}
