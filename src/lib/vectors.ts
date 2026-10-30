import "server-only";
import { Long } from "mongodb";
import { query } from "./db";
import { getMongo } from "./mongo";
import { embedLong, embedText, embedTexts, meanNormalize, openingText, repoText, toPgVector } from "./embed";
import type { RepoSnapshot } from "./github";

// Keeps the pgvector columns in sync with the source data:
//   openings.embedding               ← title + domain + description + skills
//   student_embeddings (resume)      ← resume text (MongoDB resumes)
//   student_embeddings (github)      ← weighted average of each original repo's vector

/** Embed one opening and store the vector. Returns false if the model is unavailable. */
export async function refreshOpeningEmbedding(openingId: number): Promise<boolean> {
  const { rows } = await query<{ title: string; domain: string; description: string; skills: string[] }>(
    `SELECT o.title, o.domain, o.description,
            ARRAY(SELECT s.name FROM opening_skills os JOIN skills s ON s.skill_id = os.skill_id
                  WHERE os.opening_id = o.opening_id ORDER BY os.weight DESC) AS skills
     FROM openings o WHERE o.opening_id = $1`,
    [openingId]
  );
  if (!rows[0]) return false;
  try {
    const v = await embedText(openingText(rows[0]));
    await query("UPDATE openings SET embedding = $1::vector WHERE opening_id = $2", [toPgVector(v), openingId]);
    return true;
  } catch (err) {
    console.warn(`embedding for opening ${openingId} skipped:`, (err as Error).message);
    return false;
  }
}

/** Embed resume text and store it as the student's 'resume' vector */
export async function refreshResumeEmbedding(studentId: number, text: string): Promise<boolean> {
  try {
    const v = await embedLong(text);
    await upsertStudentVector(studentId, "resume", v);
    return true;
  } catch (err) {
    console.warn(`resume embedding for student ${studentId} skipped:`, (err as Error).message);
    return false;
  }
}

/**
 * Embed each original repo (stored back in MongoDB for "best evidence"
 * explanations) and store their weighted average as the 'github' vector.
 * Repos with more of the student's own commits count for more.
 */
export async function embedRepos(repos: RepoSnapshot[]): Promise<(RepoSnapshot & { embedding?: number[] })[]> {
  const originals = repos.filter((r) => !r.is_fork);
  try {
    const vectors = await embedTexts(originals.map(repoText));
    const byName = new Map(originals.map((r, i) => [r.name, vectors[i]]));
    return repos.map((r) => (byName.has(r.name) ? { ...r, embedding: byName.get(r.name)!.map((x) => Number(x.toFixed(5))) } : r));
  } catch (err) {
    console.warn("repo embeddings skipped:", (err as Error).message);
    return repos;
  }
}

export async function refreshGithubEmbedding(studentId: number, repos: (RepoSnapshot & { embedding?: number[] })[]): Promise<boolean> {
  const withVec = repos.filter((r) => !r.is_fork && r.embedding);
  if (!withVec.length) {
    await query("DELETE FROM student_embeddings WHERE student_id = $1 AND source = 'github'", [studentId]);
    return false;
  }
  const v = meanNormalize(withVec.map((r) => r.embedding!), withVec.map((r) => 1 + Math.log1p(r.own_commits)));
  await upsertStudentVector(studentId, "github", v);
  return true;
}

async function upsertStudentVector(studentId: number, source: "resume" | "github", v: number[]) {
  await query(
    `INSERT INTO student_embeddings (student_id, source, embedding, updated_at)
     VALUES ($1, $2, $3::vector, now())
     ON CONFLICT (student_id, source) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = now()`,
    [studentId, source, toPgVector(v)]
  );
}

/** After a profile change: look for openings this student now matches (match_alerts) */
export async function checkAlerts(studentId: number): Promise<number> {
  try {
    const { rows } = await query<{ n: number }>("SELECT fn_check_alerts($1) AS n", [studentId]);
    return rows[0]?.n ?? 0;
  } catch (err) {
    console.warn("alert check skipped:", (err as Error).message);
    return 0;
  }
}

/** Admin tool: rebuild every vector from the stored source data */
export async function rebuildAllEmbeddings() {
  const result = { openings: 0, resumes: 0, github: 0, failed: 0, mongoError: null as string | null };

  const openings = await query<{ opening_id: string }>("SELECT opening_id FROM openings");
  for (const o of openings.rows) {
    if (await refreshOpeningEmbedding(Number(o.opening_id))) result.openings++; else result.failed++;
  }

  try {
    const mongo = await getMongo();
    for await (const doc of mongo.collection("resumes").find({}, { projection: { student_id: 1, raw_text: 1 } })) {
      if (await refreshResumeEmbedding(Number(doc.student_id), doc.raw_text)) result.resumes++; else result.failed++;
    }
    const profiles = mongo.collection("github_profiles");
    for await (const doc of profiles.find({}, { projection: { student_id: 1, repos: 1 } })) {
      const repos = await embedRepos(doc.repos as RepoSnapshot[]);
      await profiles.updateOne({ _id: doc._id }, { $set: { repos } });
      if (await refreshGithubEmbedding(Number(doc.student_id), repos)) result.github++; else result.failed++;
    }
  } catch (err) {
    // Student vectors come from MongoDB documents; opening vectors are still rebuilt
    result.mongoError = (err as Error).message;
  }
  return result;
}

/** Best-matching repo per student for an opening vector (explains a ranking) */
export async function bestEvidence(studentIds: number[], openingVec: number[] | null) {
  const out = new Map<number, { repo: string; similarity: number }>();
  if (!openingVec || studentIds.length === 0) return out;
  try {
    const mongo = await getMongo();
    const docs = mongo.collection("github_profiles").find(
      { student_id: { $in: studentIds.map((id) => Long.fromNumber(id)) } },
      { projection: { student_id: 1, "repos.name": 1, "repos.embedding": 1, "repos.is_fork": 1 } }
    );
    const { cosine } = await import("./embed");
    for await (const d of docs) {
      let best: { repo: string; similarity: number } | null = null;
      for (const r of (d.repos ?? []) as { name: string; embedding?: number[]; is_fork: boolean }[]) {
        if (r.is_fork || !r.embedding) continue;
        const s = cosine(openingVec, r.embedding);
        if (!best || s > best.similarity) best = { repo: r.name, similarity: s };
      }
      if (best) out.set(Number(d.student_id), best);
    }
  } catch (err) {
    console.warn("evidence lookup skipped:", (err as Error).message);
  }
  return out;
}
