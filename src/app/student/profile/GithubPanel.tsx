"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote } from "@/components/AuthShell";
import { SuggestedSkills } from "./SuggestedSkills";

type Suggested = { id: number; name: string }[];

export function GithubPanel({ username, current }: { username: string | null; current: Record<number, number> }) {
  const router = useRouter();
  const [name, setName] = useState(username ?? "");
  const [editing, setEditing] = useState(!username);
  const [busy, setBusy] = useState<"save" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ summary: string; score: number; suggested: Suggested } | null>(null);

  async function saveName() {
    setBusy("save");
    setError(null);
    const res = await fetch("/api/student/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ githubUsername: name }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Could not save");
    setEditing(false);
    router.refresh();
  }

  async function sync() {
    setBusy("sync");
    setError(null);
    const res = await fetch("/api/student/github/sync", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? "Sync failed");
    setResult({ summary: data.summary, score: data.proof.score, suggested: data.suggestedSkills });
    router.refresh();
  }

  return (
    <div>
      {editing ? (
        <div className="flex flex-wrap gap-2">
          <div className="flex flex-1 items-center rounded-lg border border-line bg-card pl-3">
            <span className="text-sm text-muted">github.com/</span>
            <input value={name} onChange={(e) => setName(e.target.value.trim())} placeholder="username"
                   className="w-full bg-transparent px-1 py-2 text-sm outline-none" />
          </div>
          <button className="btn" disabled={!name || busy !== null} onClick={saveName}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <a href={`https://github.com/${username}`} target="_blank" rel="noreferrer" className="font-medium text-accent">@{username}</a>
          <button className="btn px-3 py-1.5 text-sm" disabled={busy !== null} onClick={sync}>
            {busy === "sync" ? "Reading your repos…" : "Sync GitHub"}
          </button>
          <button className="text-sm text-muted underline" onClick={() => setEditing(true)}>Change</button>
        </div>
      )}
      <ErrorNote message={error} />
      {result && (
        <p className="mt-3 text-sm">
          Proof-of-work score <strong>{result.score}</strong>: {result.summary}
        </p>
      )}
      {result && <SuggestedSkills suggested={result.suggested} current={current} source="repositories" />}
    </div>
  );
}
