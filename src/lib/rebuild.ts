import "server-only";
import { query } from "./db";
import { getMongo } from "./mongo";
import type { RepoSnapshot } from "./github";
import { embedRepos, refreshGithubEmbedding, refreshOpeningEmbedding, refreshResumeEmbedding } from "./vectors";
import { recomputeStudentScores } from "./scores";

export type RebuildResult = {
  openings: number;
  resumes: number;
  github: number;
  scores: number;
  successProfiles: number;
  alerts: number;
  applications: number;
  failed: number;
  mongoError: string | null;
  seconds: number;
};

/**
 * Admin maintenance: recompute every derived value from the stored source data,
 * in dependency order. Used after a reset, after loading demo data, or after
 * changing the embedding model or scoring weights.
 *
 *   1. opening vectors                        (pgvector)
 *   2. resume vectors, repo vectors           (from MongoDB documents)
 *   3. proof-of-work, snapshots, momentum     (MongoDB aggregations)
 *   4. lab success profiles                   (sp_refresh_success_profile)
 *   5. match alerts                           (fn_check_alerts)
 *   6. stored match scores on applications    (fn_match_score)
 *   7. admin statistics                       (REFRESH MATERIALIZED VIEW)
 */
export async function rebuildMatchingData(): Promise<RebuildResult> {
  const started = Date.now();
  const r: RebuildResult = {
    openings: 0, resumes: 0, github: 0, scores: 0, successProfiles: 0,
    alerts: 0, applications: 0, failed: 0, mongoError: null, seconds: 0,
  };

  // 1. Openings
  const openings = await query<{ opening_id: string }>("SELECT opening_id FROM openings ORDER BY opening_id");
  for (const o of openings.rows) {
    if (await refreshOpeningEmbedding(Number(o.opening_id))) r.openings++; else r.failed++;
  }

  // 2–3. Student documents in MongoDB
  try {
    const mongo = await getMongo();

    const resumes = await mongo.collection("resumes")
      .find({}, { projection: { student_id: 1, raw_text: 1 } }).toArray();
    for (const doc of resumes) {
      if (await refreshResumeEmbedding(Number(doc.student_id), doc.raw_text)) r.resumes++; else r.failed++;
    }

    const profiles = mongo.collection("github_profiles");
    const ghDocs = await profiles.find({}, { projection: { student_id: 1, repos: 1 } }).toArray();
    for (const doc of ghDocs) {
      const studentId = Number(doc.student_id);
      const repos = await embedRepos(doc.repos as RepoSnapshot[]);
      await profiles.updateOne({ _id: doc._id }, { $set: { repos } });
      if (await refreshGithubEmbedding(studentId, repos)) r.github++; else r.failed++;
      if (await recomputeStudentScores(mongo, studentId)) r.scores++;
    }
  } catch (err) {
    // Student data lives in MongoDB; opening vectors above are still rebuilt
    r.mongoError = (err as Error).message;
  }

  // 4. Success profiles (depend on student vectors)
  const centers = await query<{ center_id: string }>("SELECT center_id FROM research_centers");
  for (const c of centers.rows) {
    await query("CALL sp_refresh_success_profile($1)", [Number(c.center_id)]);
  }
  r.successProfiles = Number((await query<{ n: string }>("SELECT COUNT(*) AS n FROM center_success_profiles")).rows[0].n);

  // 5. Match alerts (depend on vectors, scores and success profiles)
  const students = await query<{ student_id: string }>("SELECT student_id FROM students");
  for (const s of students.rows) {
    const { rows } = await query<{ n: number }>("SELECT fn_check_alerts($1) AS n", [Number(s.student_id)]);
    r.alerts += Number(rows[0]?.n ?? 0);
  }

  // 6. Stored match score shown next to each applicant
  r.applications = (await query(
    `UPDATE applications a
     SET match_score = (SELECT total_score FROM fn_match_score(a.student_id, a.opening_id))`
  )).rowCount ?? 0;

  // 7. Admin statistics
  await query("SELECT fn_refresh_center_stats()");

  r.seconds = Math.round((Date.now() - started) / 100) / 10;
  return r;
}
