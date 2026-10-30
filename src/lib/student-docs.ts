import "server-only";
import { Long } from "mongodb";
import { getMongo } from "./mongo";
import { proofPipeline, proofSummary, type ProofResult } from "./proof";

export type StudentDocs = {
  github: { username: string; fetchedAt: Date; proof: ProofResult; summary: string; topLanguages: string[] } | null;
  resume: { fileName: string; size: number; parsedAt: Date; sections: string[] } | null;
  snapshots: { month: string; proof_score: number; original_repo_count: number; own_commits: number }[];
  mongoAvailable: boolean;
};

/** Everything a student has in MongoDB, summarised. Never throws: if MongoDB is down the page still loads. */
export async function getStudentDocs(studentId: number): Promise<StudentDocs> {
  const empty: StudentDocs = { github: null, resume: null, snapshots: [], mongoAvailable: false };
  try {
    const db = await getMongo();
    const sid = Long.fromNumber(studentId);

    const [gh, proofRows, resume, snapshots] = await Promise.all([
      db.collection("github_profiles").findOne({ student_id: sid }, { projection: { username: 1, fetched_at: 1, language_totals: 1 } }),
      db.collection("github_profiles").aggregate(proofPipeline(sid)).toArray(),
      db.collection("resumes").findOne({ student_id: sid }, { projection: { file: 1, parsed_at: 1, sections: 1 } }),
      db.collection("profile_snapshots")
        .find({ student_id: sid }, { projection: { _id: 0, month: 1, proof_score: 1, original_repo_count: 1, own_commits: 1 } })
        .sort({ month: 1 }).limit(12).toArray(),
    ]);

    const proof = proofRows[0] as unknown as ProofResult | undefined;
    const langs = Object.entries((gh?.language_totals ?? {}) as Record<string, number>)
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l]) => l);

    return {
      mongoAvailable: true,
      github: gh && proof ? { username: gh.username, fetchedAt: gh.fetched_at, proof, summary: proofSummary(proof), topLanguages: langs } : null,
      resume: resume ? {
        fileName: resume.file?.name ?? "resume.pdf",
        size: Number(resume.file?.size ?? 0),
        parsedAt: resume.parsed_at,
        sections: Object.keys(resume.sections ?? {}),
      } : null,
      snapshots: snapshots as unknown as StudentDocs["snapshots"],
    };
  } catch (err) {
    console.warn("MongoDB unavailable:", (err as Error).message);
    return empty;
  }
}
