"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ErrorNote, Field } from "@/components/AuthShell";

type Center = { id: number; name: string };

export function RegisterForm({ initialRole }: { initialRole: "student" | "faculty" }) {
  const router = useRouter();
  const [role, setRole] = useState(initialRole);
  const [centers, setCenters] = useState<Center[]>([]);
  const [centerChoice, setCenterChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (role === "faculty" && centers.length === 0) {
      fetch("/api/centers").then((r) => r.json()).then(setCenters).catch(() => setCenters([]));
    }
  }, [role, centers.length]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const body = { role, ...Object.fromEntries(new FormData(e.currentTarget)) };
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Registration failed");
    router.push(data.redirect);
    router.refresh();
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-2 rounded-lg border border-line p-1 text-sm font-medium">
        {(["student", "faculty"] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={`rounded-md py-2 ${role === r ? "bg-accent text-paper" : "text-muted"}`}
          >
            {r === "student" ? "Student" : "Faculty / Researcher"}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-4" key={role}>
        <Field label="Full name">
          <input name="fullName" required className="input" autoComplete="name" />
        </Field>
        <Field label="College email">
          <input name="email" type="email" required className="input" autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters, with a letter and a number.">
          <input name="password" type="password" required minLength={8} className="input" autoComplete="new-password" />
        </Field>

        {role === "student" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SRN">
                <input name="srn" required className="input" placeholder="PES1UG22CS001" />
              </Field>
              <Field label="Branch">
                <input name="branch" required className="input" placeholder="CSE" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Semester">
                <select name="semester" required className="input" defaultValue="">
                  <option value="" disabled>Select</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="CGPA">
                <input name="cgpa" type="number" step="0.01" min="0" max="10" required className="input" />
              </Field>
            </div>
            <Field label="GitHub username" hint="Optional now; you can link it later from your profile.">
              <input name="githubUsername" className="input" placeholder="octocat" />
            </Field>
          </>
        ) : (
          <>
            <Field label="Research center / lab">
              <select
                name="centerId"
                required
                className="input"
                value={centerChoice}
                onChange={(e) => setCenterChoice(e.target.value)}
              >
                <option value="" disabled>Select your center</option>
                {centers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="new">+ My lab isn&apos;t listed: add it</option>
              </select>
            </Field>
            {centerChoice === "new" && (
              <div className="space-y-3 rounded-lg border border-line p-3">
                <Field label="Lab / center name">
                  <input name="newCenterName" required minLength={3} maxLength={150} className="input"
                         placeholder="e.g. Computer Vision Research Lab" />
                </Field>
                <Field label="What does your lab work on?" hint="Shown to students browsing labs.">
                  <textarea name="newCenterDescription" rows={3} maxLength={1000} className="input"
                            placeholder="Medical image segmentation, explainable AI…" />
                </Field>
              </div>
            )}
            <Field label="Designation">
              <input name="designation" className="input" placeholder="Assistant Professor" />
            </Field>
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-xs">
              Faculty accounts (and any new lab you add) can post openings after an admin verifies them.
            </p>
          </>
        )}

        <ErrorNote message={error} />
        <button type="submit" disabled={loading} className="btn w-full">
          {loading ? "Creating account…" : "Create account"}
        </button>
        <p className="text-center text-sm text-muted">
          Already registered? <Link href="/login" className="font-medium text-accent">Log in</Link>
        </p>
      </form>
    </>
  );
}
