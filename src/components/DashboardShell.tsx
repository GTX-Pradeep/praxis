import { Logo } from "./Logo";
import { LogoutButton } from "./LogoutButton";
import type { Role } from "@/lib/config";

const roleLabel: Record<Role, string> = { admin: "Admin", faculty: "Faculty", student: "Student" };

export function DashboardShell({
  name,
  role,
  children,
}: {
  name: string;
  role: Role;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Logo href={`/${role}`} />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm sm:inline">{name}</span>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
              {roleLabel[role]}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}

export function Card({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        {note && <span className="text-xs text-muted">{note}</span>}
      </div>
      <div className="mt-3 text-sm">{children}</div>
    </section>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 font-serif text-3xl font-semibold">{value}</div>
    </div>
  );
}
