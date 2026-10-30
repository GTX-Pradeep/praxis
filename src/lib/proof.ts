// Proof-of-work score (0–100), computed INSIDE MongoDB with an aggregation
// pipeline over the student's github_profiles document.
//
//   consistency  40 pts  distinct active weeks, full marks at 26 weeks (~6 months)
//   volume       30 pts  number of original repos, full marks at 5
//   originality  15 pts  share of repos that are original (not forks)
//   authorship   15 pts  share of commits in original repos written by the student
//
// Consistency and volume carry most of the weight, so forks, copied code and
// one-night commit dumps all score low even when "authored" by the student.

import type { Document, Long } from "mongodb";

export type ProofResult = {
  total_repos: number;
  original_repos: number;
  own_commits: number;
  total_commits: number;
  active_weeks: number;
  originality: number;
  authorship: number;
  consistency: number;
  volume: number;
  score: number;
};

const ratio = (num: unknown, den: unknown) => ({
  $cond: [{ $gt: [den, 0] }, { $min: [1, { $divide: [num, den] }] }, 0],
});

export function proofPipeline(studentId: Long | number): Document[] {
  return [
    { $match: { student_id: studentId } },
    // keep only original repositories for the commit-based measures
    {
      $project: {
        total_repos: { $size: "$repos" },
        original: { $filter: { input: "$repos", as: "r", cond: { $eq: ["$$r.is_fork", false] } } },
      },
    },
    {
      $project: {
        total_repos: 1,
        original_repos: { $size: "$original" },
        own_commits: { $sum: "$original.own_commits" },
        total_commits: { $sum: "$original.total_commits" },
        // flatten every repo's week list, then de-duplicate with $setUnion
        active_weeks: {
          $size: {
            $setUnion: [
              { $reduce: { input: "$original.weeks", initialValue: [], in: { $concatArrays: ["$$value", { $ifNull: ["$$this", []] }] } } },
            ],
          },
        },
      },
    },
    {
      $set: {
        originality: ratio("$original_repos", "$total_repos"),
        authorship: ratio("$own_commits", "$total_commits"),
        consistency: { $min: [1, { $divide: ["$active_weeks", 26] }] },
        volume: { $min: [1, { $divide: ["$original_repos", 5] }] },
      },
    },
    {
      $set: {
        score: {
          $round: [
            { $add: [
              { $multiply: ["$originality", 15] },
              { $multiply: ["$authorship", 15] },
              { $multiply: ["$consistency", 40] },
              { $multiply: ["$volume", 30] },
            ] },
            1,
          ],
        },
      },
    },
    { $project: { _id: 0 } },
  ];
}

/** One-line human explanation shown on profiles and to faculty */
export function proofSummary(p: ProofResult): string {
  if (p.total_repos === 0) return "No public repositories yet";
  return `${p.original_repos} original repo${p.original_repos === 1 ? "" : "s"}, ` +
    `${p.own_commits} own commit${p.own_commits === 1 ? "" : "s"} over ${p.active_weeks} active week${p.active_weeks === 1 ? "" : "s"}` +
    (p.total_repos > p.original_repos ? ` (${p.total_repos - p.original_repos} fork${p.total_repos - p.original_repos === 1 ? "" : "s"} not counted)` : "");
}
