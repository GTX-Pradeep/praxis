"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote } from "@/components/AuthShell";

export function ApplyForm({ openingId }: { openingId: number }) {
  const router = useRouter();
  const [sop, setSop] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingId, sop }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Could not apply");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Why are you a good fit? (optional)</span>
        <textarea value={sop} onChange={(e) => setSop(e.target.value)} rows={5} maxLength={2000} className="input"
                  placeholder="Mention a project or repo that shows you can do this work." />
        <span className="mt-1 block text-right text-xs text-muted">{sop.length}/2000</span>
      </label>
      <ErrorNote message={error} />
      <button className="btn w-full" disabled={loading}>{loading ? "Applying…" : "Apply"}</button>
    </form>
  );
}
