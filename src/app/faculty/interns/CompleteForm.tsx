"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote } from "@/components/AuthShell";

type Option = { id: number; name: string };

export function CompleteForm({
  internshipId, studentName, startDate, defaultEnd, options,
}: {
  internshipId: number; studentName: string; startDate: string; defaultEnd: string; options: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [skills, setSkills] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return <button className="btn px-3 py-1.5 text-sm" onClick={() => setOpen(true)}>Complete &amp; rate</button>;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const res = await fetch(`/api/internships/${internshipId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endDate: f.get("endDate"), rating, remarks: f.get("remarks"), skillIds: skills }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not save");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-3 w-full space-y-3 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">End date</span>
          <input name="endDate" type="date" required min={startDate} defaultValue={defaultEnd} className="input w-auto" />
        </label>
        <div className="text-sm">
          <span className="mb-1 block font-medium">Rating</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)}
                      className={`h-9 w-9 rounded-md border text-base ${n <= rating ? "border-accent bg-accent text-paper" : "border-line"}`}>
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted">Ratings of 4 or 5 add {studentName} to your lab&apos;s success profile, which shapes future candidate rankings.</p>

      <div>
        <span className="mb-1 block text-sm font-medium">Endorse skills they demonstrated</span>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = skills.includes(o.id);
            return (
              <label key={o.id} className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${on ? "border-accent bg-accent-soft" : "border-line"}`}>
                <input type="checkbox" checked={on} onChange={() => setSkills((s) => (on ? s.filter((x) => x !== o.id) : [...s, o.id]))} />
                {o.name}
              </label>
            );
          })}
        </div>
        <span className="mt-1 block text-xs text-muted">Endorsed skills appear as verified on the student&apos;s profile and count double in matching.</span>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Remarks (optional)</span>
        <textarea name="remarks" rows={3} maxLength={1000} className="input" />
      </label>

      <ErrorNote message={error} />
      <div className="flex gap-2">
        <button className="btn" disabled={busy || rating === 0}>{busy ? "Saving…" : "Save and complete"}</button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
