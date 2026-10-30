// Starter data: the admin account, research centers and the skill catalogue.
// (The full demo dataset with students and past internships comes in a later phase.)
// Usage:  npm run db:seed      (reads .env.local; safe to run more than once)

import { config } from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";

config({ path: ".env.local" });

const email = (process.env.SEED_ADMIN_EMAIL || "").toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || "";
if (!email || password.length < 8) {
  console.error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (8+ chars) in .env.local");
  process.exit(1);
}

const centers = [
  ["Center for Medical AI", "Deep learning for medical imaging, diagnostics and clinical NLP."],
  ["Center for Cloud Computing and Big Data", "Distributed systems, data pipelines and cloud-native infrastructure."],
  ["Center for Robotics and Autonomous Systems", "Perception, planning and control for drones and ground robots."],
  ["Center for Cyber Security", "Network security, malware analysis and secure systems."],
  ["Center for Natural Language Processing", "Language models, information retrieval and Indic language tools."],
];

const skills = [
  ["Python", "language"], ["C++", "language"], ["Java", "language"], ["JavaScript", "language"],
  ["TypeScript", "language"], ["Go", "language"], ["Rust", "language"], ["SQL", "data"],
  ["PyTorch", "ml"], ["TensorFlow", "ml"], ["scikit-learn", "ml"], ["Computer Vision", "ml"],
  ["NLP", "ml"], ["Transformers", "ml"], ["Reinforcement Learning", "ml"], ["OpenCV", "ml"],
  ["React", "web"], ["Next.js", "web"], ["Node.js", "web"], ["FastAPI", "web"],
  ["Docker", "devops"], ["Kubernetes", "devops"], ["AWS", "devops"], ["Linux", "devops"],
  ["PostgreSQL", "data"], ["MongoDB", "data"], ["Apache Spark", "data"], ["ROS", "robotics"],
  ["Embedded C", "robotics"], ["Networking", "security"], ["Cryptography", "security"],
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");

  const hash = await bcrypt.hash(password, 12);
  await client.query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, hash]
  );

  for (const [name, description] of centers) {
    await client.query(
      `INSERT INTO research_centers (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [name, description]
    );
  }
  for (const [name, category] of skills) {
    await client.query(
      `INSERT INTO skills (name, category) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [name, category]
    );
  }

  await client.query("COMMIT");
  console.log(`Seeded admin (${email}), ${centers.length} centers, ${skills.length} skills`);
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Seed failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
