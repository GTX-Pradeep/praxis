"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Calls an API route, then refreshes the page. Shows the server's error message if it fails. */
export function ActionButton({
  url,
  method = "POST",
  body,
  label,
  busyLabel,
  confirm,
  variant = "primary",
  onDone,
}: {
  url: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  label: string;
  busyLabel?: string;
  confirm?: string;
  variant?: "primary" | "ghost" | "danger";
  onDone?: (data: Record<string, unknown>) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cls =
    variant === "primary" ? "btn px-3 py-1.5 text-sm"
    : variant === "danger" ? "btn-ghost text-danger"
    : "btn-ghost";

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        className={cls}
        disabled={busy}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError(null);
          const res = await fetch(url, {
            method,
            headers: body ? { "Content-Type": "application/json" } : undefined,
            body: body ? JSON.stringify(body) : undefined,
          });
          const data = await res.json().catch(() => ({}));
          setBusy(false);
          if (!res.ok) return setError(data.error ?? "Something went wrong");
          onDone?.(data);
          router.refresh();
        }}
      >
        {busy ? busyLabel ?? "Working…" : label}
      </button>
      {error && <span className="max-w-xs text-xs text-danger">{error}</span>}
    </span>
  );
}
