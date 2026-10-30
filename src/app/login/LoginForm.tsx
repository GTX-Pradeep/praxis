"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ErrorNote, Field } from "@/components/AuthShell";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? "Login failed");
    // Only follow internal paths for ?next= (prevents open redirects)
    const target = next && next.startsWith("/") && !next.startsWith("//") ? next : data.redirect;
    router.push(target);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Email">
        <input name="email" type="email" required autoComplete="email" className="input" />
      </Field>
      <Field label="Password">
        <input name="password" type="password" required autoComplete="current-password" className="input" />
      </Field>
      <ErrorNote message={error} />
      <button type="submit" disabled={loading} className="btn w-full">
        {loading ? "Signing in…" : "Log in"}
      </button>
      <p className="text-center text-sm text-muted">
        New here? <Link href="/register" className="font-medium text-accent">Create an account</Link>
      </p>
    </form>
  );
}
