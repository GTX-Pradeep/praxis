"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote } from "@/components/AuthShell";

type Skill = { id: number; name: string; category: string };

const LEVELS = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"];

export function SkillsEditor({ catalogue, initial }: { catalogue: Skill[]; initial: Record<number, number> }) {
  const router = useRouter();
  const [mine, setMine] = useState<Record<number, number>>(initial);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byCategory = useMemo(() => {
    const m = new Map<string, Skill[]>();
    for (const s of catalogue) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()];
  }, [catalogue]);

  const dirty = JSON.stringify(mine) !== JSON.stringify(initial);

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    const res = await fetch("/api/student/skills", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skills: Object.entries(mine).map(([skillId, proficiency]) => ({ skillId: Number(skillId), proficiency })) }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error ?? "Could not save");
    setMsg(`Saved ${data.count} skill${data.count === 1 ? "" : "s"}.`);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {byCategory.map(([cat, list]) => (
        <div key={cat}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{cat}</div>
          <div className="flex flex-wrap gap-2">
            {list.map((s) => {
              const on = s.id in mine;
              return (
                <span key={s.id} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft" : "border-line"}`}>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input type="checkbox" checked={on} onChange={() => setMine((m) => {
                      const n = { ...m };
                      if (on) delete n[s.id]; else n[s.id] = 3;
                      return n;
                    })} />
                    {s.name}
                  </label>
                  {on && (
                    <select aria-label={`Level for ${s.name}`} value={mine[s.id]}
                            onChange={(e) => setMine((m) => ({ ...m, [s.id]: Number(e.target.value) }))}
                            className="ml-1 rounded border border-line bg-card text-xs">
                      {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>{LEVELS[l]}</option>)}
                    </select>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <ErrorNote message={error} />
      <div className="flex items-center gap-3">
        <button className="btn" disabled={!dirty || saving} onClick={save}>{saving ? "Saving…" : "Save skills"}</button>
        {msg && <span className="text-sm text-accent">{msg}</span>}
      </div>
    </div>
  );
}
