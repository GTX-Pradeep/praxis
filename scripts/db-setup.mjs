// Sets up both databases from scratch:
//   1. Runs db/sql/*.sql in order as the owner user (DROP + CREATE everything)
//   2. Creates the restricted app user and grants it only what it needs
//   3. Creates MongoDB collections with validators and indexes
//
// Usage:  npm run db:setup      (reads .env.local)

import { config } from "dotenv";
import pg from "pg";
import { MongoClient } from "mongodb";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collections } from "../db/mongo/collections.mjs";

config({ path: ".env.local", override: true });

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const need = (k) => {
  if (!process.env[k]) { console.error(`Missing ${k} in .env.local`); process.exit(1); }
  return process.env[k];
};

// Right after `docker compose up`, PostgreSQL may still be starting.
// Keep trying for up to ~60 seconds before giving up.
async function connectWithRetry(makeClient, label) {
  for (let attempt = 1; attempt <= 30; attempt++) {
    const client = makeClient();
    try {
      await client.connect();
      return client;
    } catch (e) {
      await client.end?.().catch?.(() => {});
      if (attempt === 30) throw e;
      if (attempt === 1) process.stdout.write(`Waiting for ${label} to start`);
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function setupPostgres() {
  const admin = await connectWithRetry(() => new pg.Client({ connectionString: need("DATABASE_ADMIN_URL") }), "PostgreSQL");
  console.log("\nPostgreSQL: running schema files");

  const dir = join(root, "db", "sql");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await admin.query(readFileSync(join(dir, f), "utf8"));
    console.log(`  ✓ ${f}`);
  }

  // Restricted application role: data access only, no DDL
  const appUrl = new URL(need("DATABASE_URL"));
  const appUser = decodeURIComponent(appUrl.username);
  const appPass = decodeURIComponent(appUrl.password);
  const dbName = appUrl.pathname.slice(1);
  const ident = admin.escapeIdentifier(appUser);
  const literal = admin.escapeLiteral(appPass);

  const exists = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [appUser]);
  await admin.query(exists.rowCount
    ? `ALTER ROLE ${ident} WITH LOGIN PASSWORD ${literal}`
    : `CREATE ROLE ${ident} WITH LOGIN PASSWORD ${literal}`);

  await admin.query(`
    GRANT CONNECT ON DATABASE ${admin.escapeIdentifier(dbName)} TO ${ident};
    GRANT USAGE ON SCHEMA public TO ${ident};
    REVOKE CREATE ON SCHEMA public FROM ${ident};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ident};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ident};
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${ident};
    GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO ${ident};
    -- History rows are written by triggers only; the app may read but not edit them
    REVOKE INSERT, UPDATE, DELETE ON application_status_history FROM ${ident};
  `);
  console.log(`  ✓ app role "${appUser}" ready (data access only, no DDL)`);
  await admin.end();
}

async function setupMongo() {
  const client = await connectWithRetry(
    () => new MongoClient(need("MONGODB_URI"), { serverSelectionTimeoutMS: 2000 }), "MongoDB");
  const db = client.db(process.env.MONGODB_DB || "praxis");
  console.log("MongoDB: creating collections");

  const existing = new Set((await db.listCollections().toArray()).map((c) => c.name));
  for (const [name, def] of Object.entries(collections)) {
    if (existing.has(name)) {
      await db.command({ collMod: name, validator: def.validator, validationLevel: "strict" });
    } else {
      await db.createCollection(name, { validator: def.validator, validationLevel: "strict" });
    }
    for (const ix of def.indexes) await db.collection(name).createIndex(ix.key, ix.options);
    console.log(`  ✓ ${name} (${def.indexes.length} index${def.indexes.length > 1 ? "es" : ""})`);
  }
  await client.close();
}

try {
  await setupPostgres();
  await setupMongo();
  console.log("\nDone. Next: npm run db:seed, then npm run dev");
} catch (e) {
  console.error("\nSetup failed:", e.message);
  process.exit(1);
}
