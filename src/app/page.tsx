import Link from "next/link";
import { Logo } from "@/components/Logo";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

const pillars = [
  {
    title: "Proof over claims",
    body: "Every student gets a proof-of-work score from their GitHub history: original repos, their own commits, and steady activity over time.",
  },
  {
    title: "Learns from outcomes",
    body: "When a lab rates an intern highly, their profile shapes the lab's success profile, so the next shortlist looks like the last great hire.",
  },
  {
    title: "Always watching",
    body: "Requirements stay live. When a student's profile grows into a match, the lab is alerted without posting again.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5">
      <header className="flex items-center justify-between py-6">
        <Logo />
        <nav className="flex gap-2">
          <Link href="/login" className="btn-ghost">Log in</Link>
          <Link href="/register" className="btn">Create account</Link>
        </nav>
      </header>

      <main className="flex-1 py-16 sm:py-24">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-accent">
          University research internships
        </p>
        <h1 className="max-w-3xl font-serif text-4xl leading-tight font-semibold sm:text-6xl">
          Match research labs with students by what they have{" "}
          <em className="text-accent">proven</em>, not what they claim.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          {APP_NAME} reads verified GitHub work, faculty-endorsed skills and each lab&apos;s history
          of successful interns to recommend the right students for every opening.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/register" className="btn">I&apos;m a student</Link>
          <Link href="/register?role=faculty" className="btn-ghost">I run a research lab</Link>
        </div>

        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {pillars.map((p) => (
            <div key={p.title} className="rounded-xl border border-line bg-card p-5">
              <h2 className="font-serif text-lg font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line py-6 text-sm text-muted">
        {APP_NAME} — {APP_TAGLINE}
      </footer>
    </div>
  );
}
