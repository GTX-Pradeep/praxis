import { Long } from "mongodb";
import { query } from "@/lib/db";
import { getMongo } from "@/lib/mongo";
import { apiSession } from "@/lib/session";
import { fail, failFromError } from "@/lib/api";
import { fetchGithubProfile, GithubError } from "@/lib/github";
import { proofSummary } from "@/lib/proof";
import { detectSkills } from "@/lib/skills-detect";
import { logActivity } from "@/lib/activity";
import { checkAlerts, embedRepos, refreshGithubEmbedding } from "@/lib/vectors";
import { recomputeStudentScores } from "@/lib/scores";

const COOLDOWN_MS = 5 * 60 * 1000;

// POST /api/student/github/sync
//  1. fetch public repos + commit authorship from GitHub
//  2. embed each original repo and store the snapshot in MongoDB (github_profiles)
//  3. recompute proof-of-work (MongoDB aggregation), this month's growth snapshot
//     and momentum, and save the scores in PostgreSQL
//  4. update the student's GitHub vector and look for new match alerts
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
    const repos = await embedRepos(gh.repos); // each original repo gets its own vector

    await profiles.replaceOne(
      { student_id: sid },
      { student_id: sid, username: gh.username, repos, language_totals: gh.language_totals, fetched_at: new Date() },
      { upsert: true }
    );

    const scores = await recomputeStudentScores(mongo, session.userId);
    if (!scores) return fail(500, "Could not compute the proof-of-work score");

    const embedded = await refreshGithubEmbedding(session.userId, repos);
    const newAlerts = embedded ? await checkAlerts(session.userId) : 0;

    // Skills visible in the repos (languages + topics) that the student hasn't listed yet
    const evidence = [
      ...Object.keys(gh.language_totals),
      ...gh.repos.filter((r) => !r.is_fork).flatMap((r) => [...r.topics, r.description ?? ""]),
    ].join(" ");
    const suggested = (await detectSkills(evidence)).filter((s) => !scores.skills.includes(s.name));

    logActivity({ actorId: session.userId, role: "student", action: "github_sync", entity: "github_profiles", details: { score: scores.proof.score } });
    return Response.json({
      proof: scores.proof,
      summary: proofSummary(scores.proof),
      suggestedSkills: suggested,
      embedded,
      newAlerts,
      momentum: scores.momentum,
    });
  } catch (err) {
    if (err instanceof GithubError) return fail(err.status, err.message);
    return failFromError(err);
  }
}
