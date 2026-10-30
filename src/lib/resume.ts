import "server-only";
import { PDFParse } from "pdf-parse";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MB, same limit as the MongoDB validator

const SECTION_HEADINGS: Record<string, RegExp> = {
  education: /^(education|academic (background|details|qualifications?))\b/i,
  experience: /^((work |professional )?experience|internships?|employment)\b/i,
  projects: /^((academic |personal |key )?projects?)\b/i,
  skills: /^((technical |key )?skills|technologies|tech stack|tools)\b/i,
  achievements: /^(achievements|awards|honou?rs|certifications?|publications?)\b/i,
};

/** Extract plain text from a PDF buffer */
export async function pdfToText(data: Uint8Array): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    return result.text
      .replace(/^-- \d+ of \d+ --$/gm, "") // page markers added by the parser
      .replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  } finally {
    await parser.destroy();
  }
}

/** Split resume text into common sections by spotting heading lines */
export function splitSections(text: string): Record<string, string[]> {
  const sections: Record<string, string[]> = {};
  let current = "summary";
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.length <= 40
      ? Object.entries(SECTION_HEADINGS).find(([, re]) => re.test(line.replace(/[:\-–|]+$/, "").trim()))
      : undefined;
    if (heading) { current = heading[0]; continue; }
    (sections[current] ??= []).push(line);
  }
  // keep documents small: at most 40 lines per section
  for (const k of Object.keys(sections)) sections[k] = sections[k].slice(0, 40);
  return sections;
}

/** Quick check that the bytes really are a PDF (not just a renamed file) */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}
