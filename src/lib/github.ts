import "server-only";

// Reads a student's PUBLIC GitHub data through the REST API.
// With GITHUB_TOKEN set (no scopes needed) the limit is 5,000 requests/hour;
// without it, 60/hour, so we inspect fewer repositories.

export type RepoSnapshot = {
  name: string;
  description: string | null;
  is_fork: boolean;
  languages: Record<string, number>;
  topics: string[];
  stars: number;
  own_commits: number;     // commits authored by the student (first 100 counted)
  total_commits: number;   // all commits in the default branch
  active_weeks: number;    // distinct ISO weeks with an own commit
  weeks: string[];         // those weeks, e.g. "2026-W14"
  readme_excerpt: string | null;
  last_pushed: Date | null;
};

export class GithubError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Fetch = typeof fetch;
const API = "https://api.github.com";

function headers(raw = false): HeadersInit {
  const h: Record<string, string> = {
    Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "praxis-dbms-project",
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function gh(f: Fetch, path: string, raw = false): Promise<Response> {
  const res = await f(`${API}${path}`, { headers: headers(raw), cache: "no-store" });
  if ((res.status === 403 || res.status === 429) && res.headers.get("x-ratelimit-remaining") === "0") {
    throw new GithubError("GitHub's hourly request limit was reached. Try again later (or set GITHUB_TOKEN).", 429);
  }
  return res;
}

/** ISO-8601 week key, e.g. 2026-W05 */
export function isoWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Total commit count from the Link header of a per_page=1 request */
function countFromLink(res: Response, pageLength: number): number {
  const link = res.headers.get("link");
  const m = link?.match(/[?&]page=(\d+)>;\s*rel="last"/);
  return m ? Number(m[1]) : pageLength;
}

async function inspectRepo(f: Fetch, owner: string, username: string, repo: GhRepo): Promise<RepoSnapshot> {
  const base: RepoSnapshot = {
    name: repo.name,
    description: repo.description,
    is_fork: repo.fork,
    languages: {},
    topics: repo.topics ?? [],
    stars: repo.stargazers_count ?? 0,
    own_commits: 0,
    total_commits: 0,
    active_weeks: 0,
    weeks: [],
    readme_excerpt: null,
    last_pushed: repo.pushed_at ? new Date(repo.pushed_at) : null,
  };
  // Forks are someone else's work: record them, but don't spend API calls on them
  if (repo.fork) return base;

  const p = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.name)}`;
  const [langRes, ownRes, allRes, readmeRes] = await Promise.all([
    gh(f, `${p}/languages`),
    gh(f, `${p}/commits?author=${encodeURIComponent(username)}&per_page=100`),
    gh(f, `${p}/commits?per_page=1`),
    gh(f, `${p}/readme`, true),
  ]);

  if (langRes.ok) base.languages = await langRes.json();

  // 409 = empty repository (no commits yet)
  if (ownRes.ok) {
    const own: { commit: { author: { date: string } | null } }[] = await ownRes.json();
    base.own_commits = own.length;
    base.weeks = [...new Set(own.map((c) => c.commit.author?.date).filter(Boolean).map((d) => isoWeek(d!)))];
    base.active_weeks = base.weeks.length;
  }
  if (allRes.ok) {
    const page: unknown[] = await allRes.json();
    base.total_commits = Math.max(countFromLink(allRes, page.length), base.own_commits);
  }
  if (readmeRes.ok) {
    const text = await readmeRes.text();
    base.readme_excerpt = text.replace(/\s+/g, " ").trim().slice(0, 1500) || null;
  }
  return base;
}

type GhRepo = {
  name: string; description: string | null; fork: boolean; topics?: string[];
  stargazers_count?: number; pushed_at?: string | null;
};

/** Fetch a student's public repositories with commit authorship data */
export async function fetchGithubProfile(username: string, f: Fetch = fetch) {
  const userRes = await gh(f, `/users/${encodeURIComponent(username)}`);
  if (userRes.status === 404) throw new GithubError(`GitHub user "${username}" was not found`, 404);
  if (!userRes.ok) throw new GithubError(`GitHub returned an error (${userRes.status})`, 502);
  const user: { login: string } = await userRes.json();

  const reposRes = await gh(f, `/users/${encodeURIComponent(user.login)}/repos?type=owner&sort=pushed&per_page=100`);
  if (!reposRes.ok) throw new GithubError(`Could not list repositories (${reposRes.status})`, 502);
  const all: GhRepo[] = await reposRes.json();

  // Inspect the most recently pushed original repos in detail (4 calls each)
  const limit = process.env.GITHUB_TOKEN ? 25 : 10;
  const originals = all.filter((r) => !r.fork).slice(0, limit);
  const forks = all.filter((r) => r.fork);

  const repos: RepoSnapshot[] = [];
  for (let i = 0; i < originals.length; i += 4) {
    // small batches keep us polite to the API
    const batch = await Promise.all(originals.slice(i, i + 4).map((r) => inspectRepo(f, user.login, user.login, r)));
    repos.push(...batch);
  }
  for (const r of forks) repos.push(await inspectRepo(f, user.login, user.login, r));

  const language_totals: Record<string, number> = {};
  for (const r of repos) {
    for (const [lang, bytes] of Object.entries(r.languages)) {
      language_totals[lang] = (language_totals[lang] ?? 0) + bytes;
    }
  }
  return { username: user.login, repos, language_totals };
}
