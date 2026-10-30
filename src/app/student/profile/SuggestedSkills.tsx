"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Shows skills detected in a resume or repos, and adds them to the profile in one click. */
export function SuggestedSkills({
  suggested,
  current,
  source,
}: {
  suggested: { id: number; name: string }[];
  current: Record<number, number>;
  source: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (!suggested.length || done) return null;

  async function addAll() {
    setBusy(true);
    const merged = { ...current };
    for (const s of suggested) merged[s.id] ??= 3;
    const res = await fetch("/api/student/skills", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: Object.entries(merged).map(([skillId, proficiency]) => ({ skillId: Number(skillId), proficiency })) }),
    });
    setBusy(false);
    if (res.ok) { setDone(true); router.refresh(); }
  }

  return (
    <div className="mt-3 rounded-lg bg-accent-soft p-3 text-sm">
      <p>Found in your {source}: <strong>{suggested.map((s) => s.name).join(", ")}</strong></p>
      <button className="btn mt-2 px-3 py-1.5 text-sm" disabled={busy} onClick={addAll}>
        {busy ? "Adding…" : `Add ${suggested.length === 1 ? "it" : "them"} to my skills`}
      </button>
    </div>
  );
}
