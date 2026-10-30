import { Long } from "mongodb";
import { query } from "@/lib/db";
import { getMongo } from "@/lib/mongo";
import { apiSession } from "@/lib/session";
import { fail, failFromError } from "@/lib/api";
import { MAX_RESUME_BYTES, looksLikePdf, pdfToText, splitSections } from "@/lib/resume";
import { detectSkills } from "@/lib/skills-detect";
import { logActivity } from "@/lib/activity";
import { checkAlerts, refreshResumeEmbedding } from "@/lib/vectors";

// POST /api/student/resume — multipart form with a "file" field (PDF, max 5 MB).
// The extracted text is stored in MongoDB (resumes collection); the PDF itself is not kept.
export async function POST(request: Request) {
  const session = await apiSession("student");
  if (!session) return fail(403, "Only students can upload a resume");

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "Choose a PDF file to upload");
  if (file.size === 0) return fail(400, "The file is empty");
  if (file.size > MAX_RESUME_BYTES) return fail(413, "The file is larger than 5 MB");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikePdf(bytes)) return fail(415, "Only PDF files are accepted");

  let text: string;
  try {
    text = await pdfToText(bytes);
  } catch {
    return fail(422, "Could not read this PDF. Try exporting it again from Word or Google Docs.");
  }
  if (text.length < 50) {
    return fail(422, "No text found. The PDF may be a scanned image; please upload a text-based PDF.");
  }

  try {
    const sid = Long.fromNumber(session.userId);
    const sections = splitSections(text);
    const mongo = await getMongo();
    await mongo.collection("resumes").replaceOne(
      { student_id: sid },
      {
        student_id: sid,
        raw_text: text.slice(0, 100000),
        file: { name: file.name.slice(0, 200), size: file.size },
        sections,
        parsed_at: new Date(),
      },
      { upsert: true }
    );
    await query("UPDATE students SET profile_updated_at = now() WHERE student_id = $1", [session.userId]);

    // Resume vector for semantic matching, then look for newly matching openings
    const embedded = await refreshResumeEmbedding(session.userId, text);
    if (embedded) await checkAlerts(session.userId);

    // Suggest catalogue skills mentioned in the resume that aren't on the profile yet
    const mine = (await query<{ skill_id: string }>(
      "SELECT skill_id FROM student_skills WHERE student_id = $1", [session.userId]
    )).rows.map((r) => Number(r.skill_id));
    const suggested = (await detectSkills(text)).filter((s) => !mine.includes(s.id));

    logActivity({ actorId: session.userId, role: "student", action: "resume_upload", entity: "resumes", details: { size: file.size } });
    return Response.json({
      characters: text.length,
      sections: Object.keys(sections),
      suggestedSkills: suggested,
      embedded,
    });
  } catch (err) {
    return failFromError(err);
  }
}
