import "server-only";
import path from "node:path";

// Text → 384-dimensional vector with all-MiniLM-L6-v2, run locally through
// Transformers.js (no API key, no paid service). The model (~23 MB) is
// downloaded from Hugging Face on first use and cached in .cache/models.
//
// Vectors are mean-pooled and L2-normalised, so cosine similarity = dot product,
// which pgvector computes with the <=> (cosine distance) operator.

export const EMBED_MODEL = "Xenova/all-MiniLM-L6-v2";
export const EMBED_DIM = 384;

type Extractor = (
  texts: string[],
  opts: { pooling: "mean"; normalize: boolean }
) => Promise<{ tolist(): number[][] }>;

const globalForEmbed = globalThis as unknown as { extractor?: Promise<Extractor> };

function getExtractor(): Promise<Extractor> {
  if (!globalForEmbed.extractor) {
    globalForEmbed.extractor = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = process.env.EMBED_CACHE_DIR || path.join(process.cwd(), ".cache", "models");
      if (process.env.EMBED_MODEL_PATH) {
        // optional: load the model from a local folder instead of downloading it
        env.localModelPath = process.env.EMBED_MODEL_PATH;
        env.allowRemoteModels = false;
      }
      const dtype = (process.env.EMBED_DTYPE || "q8") as "q8" | "fp32";
      return (await pipeline("feature-extraction", EMBED_MODEL, { dtype })) as unknown as Extractor;
    })().catch((err) => {
      globalForEmbed.extractor = undefined; // retry on the next call
      throw err;
    });
  }
  return globalForEmbed.extractor;
}

/** Embed several short texts at once */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = await getExtractor();
  const out = await extractor(texts.map((t) => t.slice(0, 4000)), { pooling: "mean", normalize: true });
  return out.tolist();
}

export async function embedText(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}

/**
 * Long documents (a resume) exceed the model's 256-token window, so they are
 * split into ~180-word chunks; the chunk vectors are averaged and re-normalised.
 */
export async function embedLong(text: string, maxChunks = 8): Promise<number[]> {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length && chunks.length < maxChunks; i += 180) {
    chunks.push(words.slice(i, i + 180).join(" "));
  }
  return meanNormalize(await embedTexts(chunks.length ? chunks : [text]));
}

/** Weighted average of vectors, re-normalised to unit length */
export function meanNormalize(vectors: number[][], weights?: number[]): number[] {
  const out = new Array(EMBED_DIM).fill(0);
  vectors.forEach((v, i) => {
    const w = weights?.[i] ?? 1;
    for (let d = 0; d < EMBED_DIM; d++) out[d] += v[d] * w;
  });
  const norm = Math.hypot(...out) || 1;
  return out.map((x) => x / norm);
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** pgvector text format: '[0.1,0.2,...]' (pass as a parameter and cast with ::vector) */
export function toPgVector(v: number[]): string {
  return `[${v.map((x) => x.toFixed(6)).join(",")}]`;
}

export function fromPgVector(s: string | null): number[] | null {
  return s ? (JSON.parse(s) as number[]) : null;
}

/** Text that represents an opening for matching */
export function openingText(o: { title: string; domain: string; description: string; skills: string[] }): string {
  return `${o.title}. ${o.domain}. ${o.description} Skills needed: ${o.skills.join(", ")}.`;
}

/** Text that represents one repository for matching */
export function repoText(r: {
  name: string; description: string | null; topics: string[];
  languages: Record<string, number>; readme_excerpt: string | null;
}): string {
  const langs = Object.keys(r.languages).join(", ");
  return [
    r.name.replace(/[-_.]+/g, " "),
    r.description ?? "",
    r.topics.length ? `Topics: ${r.topics.join(", ")}.` : "",
    langs ? `Languages: ${langs}.` : "",
    (r.readme_excerpt ?? "").slice(0, 800),
  ].filter(Boolean).join(". ");
}
