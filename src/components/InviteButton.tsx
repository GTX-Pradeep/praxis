"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Faculty invite a suggested student to apply, with an optional short note. */
export function InviteButton({ openingId, studentId, name }: { openingId: number; studentId: number; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(true)}>Invite to apply</button>;
  }

  async function send() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ openingId, studentId, message }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not send the invitation");
    setOpen(false);
    router.refresh();
  }

  return (
    <span className="flex w-full max-w-sm flex-col gap-2">
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} maxLength={500} className="input text-sm"
                placeholder={`Optional note to ${name}, e.g. what caught your eye in their work`} />
      <span className="flex gap-2">
        <button type="button" className="btn px-3 py-1.5 text-sm" disabled={busy} onClick={send}>{busy ? "Sending…" : "Send invitation"}</button>
        <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button>
      </span>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
