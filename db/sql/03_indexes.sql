-- =====================================================================
-- Praxis — 03_indexes.sql
-- B-tree, unique expression, partial, GIN (full-text) and HNSW (vector)
-- =====================================================================

-- Case-insensitive unique skill names
CREATE UNIQUE INDEX uq_skills_name_lower ON skills (lower(name));

-- Foreign-key lookups (Postgres does not index FKs automatically)
CREATE INDEX idx_faculty_center        ON faculty (center_id);
CREATE INDEX idx_openings_center       ON openings (center_id);
CREATE INDEX idx_openings_faculty      ON openings (faculty_id);
CREATE INDEX idx_student_skills_skill  ON student_skills (skill_id);
CREATE INDEX idx_opening_skills_skill  ON opening_skills (skill_id);
CREATE INDEX idx_history_application   ON application_status_history (application_id, changed_at);
CREATE INDEX idx_endorsements_skill    ON skill_endorsements (skill_id);
CREATE INDEX idx_alerts_student        ON match_alerts (student_id);

-- Composite indexes for the most common dashboard queries
CREATE INDEX idx_applications_opening_status ON applications (opening_id, status);
CREATE INDEX idx_applications_student_status ON applications (student_id, status);

-- Partial index: only open openings are browsed by deadline
CREATE INDEX idx_openings_open_deadline ON openings (deadline) WHERE status = 'open';

-- Unseen alerts per opening for the faculty bell icon
CREATE INDEX idx_alerts_unseen ON match_alerts (opening_id) WHERE is_seen = FALSE;

-- Full-text search
CREATE INDEX idx_openings_search ON openings USING GIN (search_tsv);

-- Vector similarity (cosine) — approximate nearest neighbour
CREATE INDEX idx_openings_embedding ON openings
    USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_student_embeddings_vec ON student_embeddings
    USING hnsw (embedding vector_cosine_ops);
