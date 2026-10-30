"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote, Field } from "@/components/AuthShell";

type Skill = { id: number; name: string; category: string };

export function OpeningForm({ skills, defaultDeadline }: { skills: Skill[]; defaultDeadline: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<Record<number, number>>({}); // skillId -> weight
  const [semesters, setSemesters] = useState<number[]>([]);

  const byCategory = useMemo(() => {
    const m = new Map<string, Skill[]>();
    for (const s of skills) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()];
  }, [skills]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const body = {
      title: f.get("title"),
      description: f.get("description"),
      domain: f.get("domain"),
      seatsTotal: f.get("seatsTotal"),
      minCgpa: f.get("minCgpa"),
      durationWeeks: f.get("durationWeeks"),
      stipend: f.get("stipend") || 0,
      deadline: new Date(String(f.get("deadline"))).toISOString(),
      alertThreshold: Number(f.get("alertThreshold")) / 100,
      semesters,
      skills: Object.entries(picked).map(([skillId, weight]) => ({ skillId: Number(skillId), weight })),
    };
    setLoading(true);
    const res = await fetch("/api/openings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Could not post the opening");
    router.push(`/faculty/openings/${data.openingId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <section className="space-y-4 rounded-xl border border-line bg-card p-5">
        <h2 className="font-serif text-lg font-semibold">The work</h2>
        <Field label="Title">
          <input name="title" required minLength={5} maxLength={150} className="input"
                 placeholder="Medical image segmentation intern" />
        </Field>
        <Field label="Description" hint="What the intern will build or study. Matching reads this text, so be specific.">
          <textarea name="description" required minLength={30} rows={6} className="input"
                    placeholder="Build and evaluate U-Net models to segment tumours in MRI scans…" />
        </Field>
        <Field label="Domain">
          <input name="domain" required className="input" placeholder="Medical Imaging" />
        </Field>
      </section>

      <section className="space-y-4 rounded-xl border border-line bg-card p-5">
        <h2 className="font-serif text-lg font-semibold">Required skills</h2>
        <p className="text-sm text-muted">Tick the skills you need and set how much each matters (1 = nice to have, 5 = essential).</p>
        {byCategory.map(([cat, list]) => (
          <div key={cat}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{cat}</div>
            <div className="flex flex-wrap gap-2">
              {list.map((s) => {
                const on = s.id in picked;
                return (
                  <span key={s.id} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft" : "border-line"}`}>
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setPicked((p) => {
                            const n = { ...p };
                            if (on) delete n[s.id]; else n[s.id] = 3;
                            return n;
                          })
                        }
                      />
                      {s.name}
                    </label>
                    {on && (
                      <select
                        aria-label={`Weight for ${s.name}`}
                        value={picked[s.id]}
                        onChange={(e) => setPicked((p) => ({ ...p, [s.id]: Number(e.target.value) }))}
                        className="ml-1 rounded border border-line bg-card text-xs"
                      >
                        {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>{w}</option>)}
                      </select>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 rounded-xl border border-line bg-card p-5 sm:grid-cols-2">
        <h2 className="font-serif text-lg font-semibold sm:col-span-2">Eligibility and terms</h2>
        <Field label="Seats">
          <input name="seatsTotal" type="number" min={1} max={50} defaultValue={1} required className="input" />
        </Field>
        <Field label="Minimum CGPA">
          <input name="minCgpa" type="number" min={0} max={10} step="0.1" defaultValue={7} required className="input" />
        </Field>
        <Field label="Duration (weeks)">
          <input name="durationWeeks" type="number" min={1} max={52} defaultValue={8} required className="input" />
        </Field>
        <Field label="Stipend (₹ per month)" hint="0 if unpaid">
          <input name="stipend" type="number" min={0} step={500} defaultValue={0} className="input" />
        </Field>
        <Field label="Application deadline">
          <input name="deadline" type="datetime-local" defaultValue={defaultDeadline} required className="input" />
        </Field>
        <Field label="Alert me when a student matches above (%)" hint="Used for automatic match alerts">
          <input name="alertThreshold" type="number" min={0} max={100} defaultValue={75} className="input" />
        </Field>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium">Eligible semesters</span>
          <div className="flex flex-wrap gap-3 text-sm">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <label key={s} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={semesters.includes(s)}
                  onChange={() => setSemesters((x) => (x.includes(s) ? x.filter((v) => v !== s) : [...x, s]))}
                />
                Sem {s}
              </label>
            ))}
          </div>
          <span className="mt-1 block text-xs text-muted">Leave all unticked to allow every semester.</span>
        </div>
      </section>

      <ErrorNote message={error} />
      <button type="submit" disabled={loading} className="btn">
        {loading ? "Posting…" : "Post opening"}
      </button>
    </form>
  );
}
