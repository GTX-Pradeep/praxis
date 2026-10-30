// MongoDB collections for Praxis, with $jsonSchema validators (validation at
// the database level) and indexes. Used by scripts/db-setup.mjs.

export const collections = {
  // Parsed resume text, one document per student (latest upload)
  resumes: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["student_id", "raw_text", "file", "parsed_at"],
        properties: {
          student_id: { bsonType: "long", description: "users.user_id in PostgreSQL" },
          raw_text: { bsonType: "string", minLength: 20, maxLength: 100000 },
          file: {
            bsonType: "object",
            required: ["name", "size"],
            properties: {
              name: { bsonType: "string" },
              size: { bsonType: ["int", "long"], minimum: 1, maximum: 5242880 }, // 5 MB
            },
          },
          sections: { bsonType: "object" },
          parsed_at: { bsonType: "date" },
        },
      },
    },
    indexes: [
      { key: { student_id: 1 }, options: { unique: true, name: "uq_resume_student" } },
      { key: { raw_text: "text" }, options: { name: "txt_resume" } },
    ],
  },

  // Snapshot of a student's public GitHub data, refreshed on each sync
  github_profiles: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["student_id", "username", "repos", "fetched_at"],
        properties: {
          student_id: { bsonType: "long" },
          username: { bsonType: "string", pattern: "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$" },
          repos: {
            bsonType: "array",
            items: {
              bsonType: "object",
              required: ["name", "is_fork"],
              properties: {
                name: { bsonType: "string" },
                description: { bsonType: ["string", "null"] },
                is_fork: { bsonType: "bool" },
                languages: { bsonType: "object" },
                topics: { bsonType: "array", items: { bsonType: "string" } },
                stars: { bsonType: ["int", "long"], minimum: 0 },
                own_commits: { bsonType: ["int", "long"], minimum: 0 },
                total_commits: { bsonType: ["int", "long"], minimum: 0 },
                active_weeks: { bsonType: ["int", "long"], minimum: 0 },
                readme_excerpt: { bsonType: ["string", "null"] },
                last_pushed: { bsonType: ["date", "null"] },
              },
            },
          },
          language_totals: { bsonType: "object" },
          fetched_at: { bsonType: "date" },
        },
      },
    },
    indexes: [
      { key: { student_id: 1 }, options: { unique: true, name: "uq_github_student" } },
      { key: { "repos.topics": 1 }, options: { name: "idx_repo_topics" } },
    ],
  },

  // One document per student per month: the growth timeline
  profile_snapshots: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["student_id", "month", "repo_count", "original_repo_count", "own_commits", "proof_score"],
        properties: {
          student_id: { bsonType: "long" },
          month: { bsonType: "string", pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$" },
          repo_count: { bsonType: ["int", "long"], minimum: 0 },
          original_repo_count: { bsonType: ["int", "long"], minimum: 0 },
          own_commits: { bsonType: ["int", "long"], minimum: 0 },
          skills: { bsonType: "array", items: { bsonType: "string" } },
          proof_score: { bsonType: ["double", "int", "long", "decimal"], minimum: 0, maximum: 100 },
        },
      },
    },
    indexes: [
      { key: { student_id: 1, month: 1 }, options: { unique: true, name: "uq_snapshot_month" } },
    ],
  },

  // Audit log of important actions; auto-deleted after 180 days
  activity_logs: {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["actor_id", "role", "action", "ts"],
        properties: {
          actor_id: { bsonType: ["long", "null"] },
          role: { enum: ["admin", "faculty", "student", "system"] },
          action: { bsonType: "string" },
          entity: { bsonType: "string" },
          entity_id: { bsonType: ["long", "string", "null"] },
          details: { bsonType: "object" },
          ts: { bsonType: "date" },
        },
      },
    },
    indexes: [
      { key: { ts: 1 }, options: { expireAfterSeconds: 180 * 24 * 3600, name: "ttl_180_days" } },
      { key: { actor_id: 1, ts: -1 }, options: { name: "idx_actor_time" } },
    ],
  },
};
