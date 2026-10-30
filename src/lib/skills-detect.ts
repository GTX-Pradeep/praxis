import "server-only";
import { query } from "./db";

// Skill names that need a looser match than a plain word search
const ALIASES: Record<string, string[]> = {
  "C++": ["c++", "cpp"],
  JavaScript: ["javascript", "js"],
  TypeScript: ["typescript"],
  "Next.js": ["next.js", "nextjs"],
  "Node.js": ["node.js", "nodejs"],
  "scikit-learn": ["scikit-learn", "sklearn"],
  "Computer Vision": ["computer vision", "computer-vision", "opencv", "image segmentation", "object detection"],
  NLP: ["nlp", "natural language processing"],
  "Reinforcement Learning": ["reinforcement learning", "reinforcement-learning"],
  PostgreSQL: ["postgresql", "postgres"],
  "Apache Spark": ["apache spark", "pyspark", "spark"],
  "Embedded C": ["embedded c", "embedded", "arduino", "stm32"],
  Go: ["golang"],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Find catalogue skills mentioned in free text (resume, repo topics, languages). */
export async function detectSkills(text: string): Promise<{ id: number; name: string }[]> {
  const catalogue = await query<{ skill_id: string; name: string }>("SELECT skill_id, name FROM skills");
  const hay = ` ${text.toLowerCase()} `;
  const found: { id: number; name: string }[] = [];
  for (const s of catalogue.rows) {
    const terms = ALIASES[s.name] ?? [s.name.toLowerCase()];
    const hit = terms.some((t) => new RegExp(`(^|[^a-z0-9+#])${escape(t)}($|[^a-z0-9+#])`).test(hay));
    if (hit) found.push({ id: Number(s.skill_id), name: s.name });
  }
  return found;
}
