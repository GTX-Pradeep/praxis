-- =====================================================================
-- Praxis — 02_alter.sql
-- ALTER statements: changes that can only be made after the base tables
-- exist, plus a generated column for full-text search.
-- =====================================================================

-- research_centers <-> faculty reference each other, so one side has to
-- be added after both tables exist.
ALTER TABLE research_centers
    ADD CONSTRAINT fk_center_head
    FOREIGN KEY (head_faculty_id) REFERENCES faculty(faculty_id) ON DELETE SET NULL;

-- Full-text search column, kept in sync by Postgres itself.
-- Title words rank higher (A) than description words (B).
ALTER TABLE openings
    ADD COLUMN search_tsv tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(domain, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

-- Skill names must not be blank (case-insensitive uniqueness is an index in 03).
ALTER TABLE skills
    ADD CONSTRAINT chk_skill_name_len CHECK (length(trim(name)) >= 1);
