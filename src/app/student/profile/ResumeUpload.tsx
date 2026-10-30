"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorNote } from "@/components/AuthShell";
import { SuggestedSkills } from "./SuggestedSkills";

export function ResumeUpload({ current }: { current: Record<number, number> }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sections: string[]; suggested: { id: number; name: string }[] } | null>(null);

  async function upload(file: File) {
    if (file.size > 5 * 1024 * 1024) return setError("The file is larger than 5 MB");
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/student/resume", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (input.current) input.current.value = "";
    if (!res.ok) return setError(data.error ?? "Upload failed");
    setResult({ sections: data.sections, suggested: data.suggestedSkills });
    router.refresh();
  }

  return (
    <div>
      <input ref={input} type="file" accept="application/pdf" className="hidden"
             onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button className="btn-ghost" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Reading PDF…" : "Upload resume (PDF)"}
      </button>
      <ErrorNote message={error} />
      {result && (
        <p className="mt-3 text-sm text-muted">
          Read sections: {result.sections.length ? result.sections.join(", ") : "none recognised (text still saved)"}
        </p>
      )}
      {result && <SuggestedSkills suggested={result.suggested} current={current} source="resume" />}
    </div>
  );
}
