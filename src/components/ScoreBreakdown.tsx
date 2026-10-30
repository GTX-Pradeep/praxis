// Small horizontal bars showing what makes up a match score

export function ScoreBreakdown({
  parts,
}: {
  parts: { label: string; value: number; weight: number }[];
}) {
  return (
    <div className="grid w-full max-w-xs grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-xs">
      {parts.filter((p) => p.weight > 0).map((p) => (
        <div key={p.label} className="contents">
          <span className="text-muted">{p.label}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-line">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(Math.max(0, Math.min(1, p.value)) * 100)}%` }} />
          </span>
          <span className="w-8 text-right tabular-nums">{Math.round(p.value * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

/** Weights used by fn_match_score in 05_procedures.sql */
export function scoreParts(r: { sem_score: string; success_score: string; skill_score: string; proof_part: string }, hasSuccessProfile: boolean) {
  return [
    { label: "Work matches opening", value: Number(r.sem_score), weight: hasSuccessProfile ? 0.4 : 0.6 },
    { label: "Like past top interns", value: Number(r.success_score), weight: hasSuccessProfile ? 0.2 : 0 },
    { label: "Required skills", value: Number(r.skill_score), weight: 0.2 },
    { label: "Proof-of-work", value: Number(r.proof_part), weight: 0.2 },
  ];
}
