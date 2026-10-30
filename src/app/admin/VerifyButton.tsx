"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function VerifyButton({ facultyId }: { facultyId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn px-3 py-1.5 text-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/admin/faculty/${facultyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isVerified: true }),
        });
        setBusy(false);
        if (res.ok) router.refresh();
        else alert((await res.json().catch(() => ({}))).error ?? "Could not verify");
      }}
    >
      {busy ? "Verifying…" : "Verify"}
    </button>
  );
}
