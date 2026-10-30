-- =====================================================================
-- Praxis — 01_schema.sql
-- Core relational schema (DDL: DROP + CREATE, keys, constraints)
-- Re-runnable: drops everything first, then recreates it.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ---------- DROP (reverse dependency order) ----------
DROP MATERIALIZED VIEW IF EXISTS mv_center_stats;
DROP VIEW IF EXISTS v_opening_pipeline;
DROP VIEW IF EXISTS v_student_verified_skills;

DROP TABLE IF EXISTS match_alerts               CASCADE;
DROP TABLE IF EXISTS center_success_profiles    CASCADE;
DROP TABLE IF EXISTS student_embeddings         CASCADE;
DROP TABLE IF EXISTS skill_endorsements         CASCADE;
DROP TABLE IF EXISTS internships                CASCADE;
DROP TABLE IF EXISTS application_status_history CASCADE;
DROP TABLE IF EXISTS applications               CASCADE;
DROP TABLE IF EXISTS opening_eligible_semesters CASCADE;
DROP TABLE IF EXISTS opening_skills             CASCADE;
DROP TABLE IF EXISTS openings                   CASCADE;
DROP TABLE IF EXISTS student_skills             CASCADE;
DROP TABLE IF EXISTS skills                     CASCADE;
DROP TABLE IF EXISTS students                   CASCADE;
DROP TABLE IF EXISTS faculty                    CASCADE;
DROP TABLE IF EXISTS research_centers           CASCADE;
DROP TABLE IF EXISTS users                      CASCADE;

DROP TYPE IF EXISTS application_status CASCADE;
DROP TYPE IF EXISTS opening_status CASCADE;
DROP TYPE IF EXISTS embedding_source CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ---------- ENUM types (closed sets enforced by the database) ----------
CREATE TYPE user_role          AS ENUM ('admin', 'faculty', 'student');
CREATE TYPE opening_status     AS ENUM ('open', 'closed', 'filled');
CREATE TYPE application_status AS ENUM ('applied', 'shortlisted', 'offered',
                                        'accepted', 'rejected', 'withdrawn');
CREATE TYPE embedding_source   AS ENUM ('resume', 'github');

-- ---------- Users & roles ----------
CREATE TABLE users (
    user_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  CHAR(60)     NOT NULL,              -- bcrypt hash, never plain text
    role           user_role    NOT NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_users_email_format
        CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
    CONSTRAINT chk_users_email_lowercase
        CHECK (email = lower(email)),
    CONSTRAINT chk_users_bcrypt
        CHECK (password_hash LIKE '$2%')
);

CREATE TABLE research_centers (
    center_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name            VARCHAR(150) NOT NULL UNIQUE,
    description     TEXT,
    head_faculty_id BIGINT,                            -- FK added in 02_alter.sql (circular with faculty)
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_center_name_len CHECK (length(trim(name)) >= 3)
);

CREATE TABLE faculty (
    faculty_id   BIGINT PRIMARY KEY
                 REFERENCES users(user_id) ON DELETE CASCADE,
    center_id    BIGINT
                 REFERENCES research_centers(center_id) ON DELETE SET NULL,
    full_name    VARCHAR(120) NOT NULL,
    designation  VARCHAR(80),
    is_verified  BOOLEAN NOT NULL DEFAULT FALSE        -- admin must verify before posting
);

CREATE TABLE students (
    student_id          BIGINT PRIMARY KEY
                        REFERENCES users(user_id) ON DELETE CASCADE,
    srn                 VARCHAR(20)  NOT NULL UNIQUE,
    full_name           VARCHAR(120) NOT NULL,
    branch              VARCHAR(60)  NOT NULL,
    semester            SMALLINT     NOT NULL,
    cgpa                NUMERIC(4,2) NOT NULL,
    github_username     VARCHAR(39)  UNIQUE,
    proof_score         NUMERIC(5,2) NOT NULL DEFAULT 0,
    momentum_score      NUMERIC(6,2) NOT NULL DEFAULT 0,
    profile_updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_students_semester CHECK (semester BETWEEN 1 AND 8),
    CONSTRAINT chk_students_cgpa     CHECK (cgpa BETWEEN 0 AND 10),
    CONSTRAINT chk_students_proof    CHECK (proof_score BETWEEN 0 AND 100),
    CONSTRAINT chk_students_github   CHECK (github_username ~ '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$')
);

-- ---------- Skills ----------
CREATE TABLE skills (
    skill_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name      VARCHAR(60) NOT NULL,
    category  VARCHAR(40) NOT NULL DEFAULT 'general'
);

CREATE TABLE student_skills (
    student_id   BIGINT   NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    skill_id     BIGINT   NOT NULL REFERENCES skills(skill_id)     ON DELETE CASCADE,
    proficiency  SMALLINT NOT NULL,
    PRIMARY KEY (student_id, skill_id),
    CONSTRAINT chk_student_skill_prof CHECK (proficiency BETWEEN 1 AND 5)
);

-- ---------- Openings (lab requirements) ----------
CREATE TABLE openings (
    opening_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    center_id        BIGINT       NOT NULL REFERENCES research_centers(center_id) ON DELETE RESTRICT,
    faculty_id       BIGINT       NOT NULL REFERENCES faculty(faculty_id)         ON DELETE RESTRICT,
    title            VARCHAR(150) NOT NULL,
    description      TEXT         NOT NULL,
    domain           VARCHAR(80)  NOT NULL,
    seats_total      SMALLINT     NOT NULL,
    seats_filled     SMALLINT     NOT NULL DEFAULT 0,
    min_cgpa         NUMERIC(4,2) NOT NULL DEFAULT 0,
    duration_weeks   SMALLINT     NOT NULL,
    stipend          INTEGER      NOT NULL DEFAULT 0,  -- INR per month
    deadline         TIMESTAMPTZ  NOT NULL,
    status           opening_status NOT NULL DEFAULT 'open',
    alert_threshold  NUMERIC(4,3) NOT NULL DEFAULT 0.750,
    embedding        vector(384),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_openings_title     CHECK (length(trim(title)) >= 5),
    CONSTRAINT chk_openings_desc      CHECK (length(trim(description)) >= 30),
    CONSTRAINT chk_openings_seats     CHECK (seats_total BETWEEN 1 AND 50),
    CONSTRAINT chk_openings_filled    CHECK (seats_filled BETWEEN 0 AND seats_total),
    CONSTRAINT chk_openings_cgpa      CHECK (min_cgpa BETWEEN 0 AND 10),
    CONSTRAINT chk_openings_duration  CHECK (duration_weeks BETWEEN 1 AND 52),
    CONSTRAINT chk_openings_stipend   CHECK (stipend >= 0),
    CONSTRAINT chk_openings_deadline  CHECK (deadline > created_at),
    CONSTRAINT chk_openings_threshold CHECK (alert_threshold BETWEEN 0 AND 1)
);

CREATE TABLE opening_skills (
    opening_id  BIGINT   NOT NULL REFERENCES openings(opening_id) ON DELETE CASCADE,
    skill_id    BIGINT   NOT NULL REFERENCES skills(skill_id)     ON DELETE RESTRICT,
    weight      SMALLINT NOT NULL DEFAULT 3,
    PRIMARY KEY (opening_id, skill_id),
    CONSTRAINT chk_opening_skill_weight CHECK (weight BETWEEN 1 AND 5)
);

CREATE TABLE opening_eligible_semesters (
    opening_id  BIGINT   NOT NULL REFERENCES openings(opening_id) ON DELETE CASCADE,
    semester    SMALLINT NOT NULL,
    PRIMARY KEY (opening_id, semester),
    CONSTRAINT chk_eligible_semester CHECK (semester BETWEEN 1 AND 8)
);

-- ---------- Applications & selection ----------
CREATE TABLE applications (
    application_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    student_id      BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    opening_id      BIGINT NOT NULL REFERENCES openings(opening_id) ON DELETE CASCADE,
    sop             TEXT,
    match_score     NUMERIC(5,4),
    status          application_status NOT NULL DEFAULT 'applied',
    applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_application_once   UNIQUE (student_id, opening_id),   -- no duplicate applications
    CONSTRAINT chk_application_sop   CHECK (sop IS NULL OR length(sop) <= 2000),
    CONSTRAINT chk_application_score CHECK (match_score IS NULL OR match_score BETWEEN 0 AND 1)
);

CREATE TABLE application_status_history (
    history_id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id  BIGINT NOT NULL REFERENCES applications(application_id) ON DELETE CASCADE,
    old_status      application_status,
    new_status      application_status NOT NULL,
    changed_by      BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE internships (
    internship_id   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    application_id  BIGINT NOT NULL UNIQUE
                    REFERENCES applications(application_id) ON DELETE RESTRICT,
    start_date      DATE   NOT NULL DEFAULT CURRENT_DATE,
    end_date        DATE,
    final_rating    SMALLINT,
    remarks         TEXT,
    CONSTRAINT chk_internship_dates  CHECK (end_date IS NULL OR end_date > start_date),
    CONSTRAINT chk_internship_rating CHECK (final_rating IS NULL OR final_rating BETWEEN 1 AND 5),
    CONSTRAINT chk_rating_after_end  CHECK (final_rating IS NULL OR end_date IS NOT NULL)
);

CREATE TABLE skill_endorsements (
    internship_id  BIGINT NOT NULL REFERENCES internships(internship_id) ON DELETE CASCADE,
    skill_id       BIGINT NOT NULL REFERENCES skills(skill_id)           ON DELETE CASCADE,
    endorsed_by    BIGINT NOT NULL REFERENCES faculty(faculty_id)        ON DELETE CASCADE,
    endorsed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (internship_id, skill_id)
);

-- ---------- Vector data (pgvector) ----------
CREATE TABLE student_embeddings (
    student_id  BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    source      embedding_source NOT NULL,
    embedding   vector(384) NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, source)
);

CREATE TABLE center_success_profiles (
    center_id     BIGINT PRIMARY KEY REFERENCES research_centers(center_id) ON DELETE CASCADE,
    embedding     vector(384) NOT NULL,
    intern_count  INTEGER NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_success_count CHECK (intern_count >= 1)
);

CREATE TABLE match_alerts (
    alert_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    opening_id  BIGINT NOT NULL REFERENCES openings(opening_id) ON DELETE CASCADE,
    student_id  BIGINT NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
    score       NUMERIC(5,4) NOT NULL,
    is_seen     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_alert_once     UNIQUE (opening_id, student_id),
    CONSTRAINT chk_alert_score   CHECK (score BETWEEN 0 AND 1)
);
