import Link from "next/link";
import { Logo } from "./Logo";
import { LogoutButton } from "./LogoutButton";
import type { Role } from "@/lib/config";

const roleLabel: Record<Role, string> = { admin: "Admin", faculty: "Faculty", student: "Student" };

const NAV: Record<Role, { href: string; label: string }[]> = {
  student: [
    { href: "/student", label: "Dashboard" },
    { href: "/student/openings", label: "Openings" },
    { href: "/student/applications", label: "Applications" },
    { href: "/student/profile", label: "Profile" },
  ],
  faculty: [
    { href: "/faculty", label: "Dashboard" },
    { href: "/faculty/openings/new", label: "Post opening" },
    { href: "/faculty/interns", label: "Interns" },
    { href: "/faculty/alerts", label: "Alerts" },
  ],
  admin: [
    { href: "/admin", label: "Overview" },
    { href: "/admin/analytics", label: "Analytics" },
  ],
};

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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-center gap-6">
            <Logo href={`/${role}`} />
            <nav className="hidden gap-1 md:flex">
              {NAV[role].map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 text-sm text-muted hover:bg-accent-soft hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm sm:inline">{name}</span>
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
              {roleLabel[role]}
            </span>
            <LogoutButton />
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-line px-3 py-2 md:hidden">
          {NAV[role].map((n) => (
            <Link key={n.href} href={n.href} className="shrink-0 rounded-md px-3 py-1 text-sm text-muted">
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}

export function Card({ title, children, note, action }: {
  title: string; children: React.ReactNode; note?: string; action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold">{title}</h2>
        {note && <span className="text-xs text-muted">{note}</span>}
        {action}
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

const statusStyle: Record<string, string> = {
  applied: "bg-line text-ink",
  shortlisted: "bg-warn-soft text-ink",
  offered: "bg-accent-soft text-accent",
  accepted: "bg-accent text-paper",
  rejected: "bg-danger-soft text-danger",
  withdrawn: "bg-line text-muted",
  open: "bg-accent-soft text-accent",
  closed: "bg-line text-muted",
  filled: "bg-accent text-paper",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusStyle[status] ?? "bg-line"}`}>
      {status}
    </span>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
