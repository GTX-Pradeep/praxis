// Momentum = how fast a student's proof-of-work score is growing, in points per
// month, computed with a MongoDB aggregation over profile_snapshots (one doc per
// month). Only the last 6 months count, so old activity doesn't dominate.
//
//   momentum = (latest score − earliest score in window) / months between them

import type { Document, Long } from "mongodb";

export function momentumPipeline(studentId: Long | number, sinceMonth: string): Document[] {
  return [
    { $match: { student_id: studentId, month: { $gte: sinceMonth } } },
    { $sort: { month: 1 } },
    {
      $group: {
        _id: "$student_id",
        first: { $first: { month: "$month", score: "$proof_score" } },
        last: { $last: { month: "$month", score: "$proof_score" } },
        snapshots: { $sum: 1 },
      },
    },
    {
      // "2026-10" → 2026 * 12 + 10, so months can be subtracted
      $set: {
        months: {
          $subtract: [
            { $add: [{ $multiply: [{ $toInt: { $substrBytes: ["$last.month", 0, 4] } }, 12] }, { $toInt: { $substrBytes: ["$last.month", 5, 2] } }] },
            { $add: [{ $multiply: [{ $toInt: { $substrBytes: ["$first.month", 0, 4] } }, 12] }, { $toInt: { $substrBytes: ["$first.month", 5, 2] } }] },
          ],
        },
      },
    },
    {
      $project: {
        _id: 0,
        snapshots: 1,
        months: 1,
        from: "$first.score",
        to: "$last.score",
        momentum: {
          $cond: [
            { $gt: ["$months", 0] },
            { $round: [{ $divide: [{ $subtract: ["$last.score", "$first.score"] }, "$months"] }, 1] },
            0,
          ],
        },
      },
    },
  ];
}

/** "YYYY-MM" for the month n months before now (India time) */
export function monthsAgo(n: number): string {
  const now = new Date(Date.now() + 330 * 60e3); // shift to IST for the month boundary
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
