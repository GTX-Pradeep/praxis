-- =====================================================================
-- Praxis — 05_procedures.sql
-- Stored functions/procedures: eligibility, hybrid match score, ranking,
-- the offer-acceptance transaction, success profiles and match alerts.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Is this student allowed to be considered for this opening?
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_is_eligible(p_student_id BIGINT, p_opening_id BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM students s
        JOIN users u    ON u.user_id = s.student_id AND u.is_active
        JOIN openings o ON o.opening_id = p_opening_id
        WHERE s.student_id = p_student_id
          AND s.cgpa >= o.min_cgpa
          AND (
                NOT EXISTS (SELECT 1 FROM opening_eligible_semesters e
                            WHERE e.opening_id = o.opening_id)
             OR EXISTS     (SELECT 1 FROM opening_eligible_semesters e
                            WHERE e.opening_id = o.opening_id AND e.semester = s.semester)
          )
          AND NOT EXISTS (
                SELECT 1 FROM applications a
                JOIN internships i ON i.application_id = a.application_id
                WHERE a.student_id = s.student_id
                  AND a.status = 'accepted'
                  AND i.end_date IS NULL
          )
    );
$$;

-- ---------------------------------------------------------------------
-- Hybrid match score for one student and one opening (all parts 0..1)
--
--   With a lab success profile:    0.4 semantic + 0.2 success + 0.2 skills + 0.2 proof
--   Without one (no history yet):  0.6 semantic               + 0.2 skills + 0.2 proof
--
--   semantic = cosine similarity of the student's vectors to the opening
--   success  = cosine similarity to the lab's best past interns
--   skills   = weighted overlap with required skills; endorsed skills count double
--   proof    = verified GitHub proof-of-work score / 100
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_match_score(p_student_id BIGINT, p_opening_id BIGINT)
RETURNS TABLE (
    sem_score      NUMERIC,
    success_score  NUMERIC,
    skill_score    NUMERIC,
    proof_part     NUMERIC,
    total_score    NUMERIC,
    matched_skills TEXT[]
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v_op          openings%ROWTYPE;
    v_center_vec  vector(384);
    v_sem         NUMERIC := 0;
    v_succ        NUMERIC := 0;
    v_skill       NUMERIC := 0;
    v_proof       NUMERIC := 0;
    v_matched     TEXT[]  := '{}';
    v_total       NUMERIC;
BEGIN
    SELECT * INTO v_op FROM openings WHERE opening_id = p_opening_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Opening % does not exist', p_opening_id;
    END IF;

    SELECT csp.embedding INTO v_center_vec
    FROM center_success_profiles csp WHERE csp.center_id = v_op.center_id;

    IF v_op.embedding IS NOT NULL THEN
        SELECT COALESCE(AVG(GREATEST(0, 1 - (se.embedding <=> v_op.embedding))), 0)
        INTO v_sem
        FROM student_embeddings se WHERE se.student_id = p_student_id;
    END IF;

    IF v_center_vec IS NOT NULL THEN
        SELECT COALESCE(AVG(GREATEST(0, 1 - (se.embedding <=> v_center_vec))), 0)
        INTO v_succ
        FROM student_embeddings se WHERE se.student_id = p_student_id;
    END IF;

    SELECT
        COALESCE(
            SUM(os.weight * LEAST(1, COALESCE(ss.proficiency, 0) / 5.0
                                    * CASE WHEN en.skill_id IS NOT NULL THEN 2 ELSE 1 END))
            / NULLIF(SUM(os.weight), 0), 0),
        COALESCE(array_agg(sk.name ORDER BY os.weight DESC)
                 FILTER (WHERE ss.skill_id IS NOT NULL OR en.skill_id IS NOT NULL), '{}')
    INTO v_skill, v_matched
    FROM opening_skills os
    JOIN skills sk ON sk.skill_id = os.skill_id
    LEFT JOIN student_skills ss
           ON ss.skill_id = os.skill_id AND ss.student_id = p_student_id
    LEFT JOIN (
        SELECT DISTINCT e.skill_id
        FROM skill_endorsements e
        JOIN internships i  ON i.internship_id  = e.internship_id
        JOIN applications a ON a.application_id = i.application_id
        WHERE a.student_id = p_student_id
    ) en ON en.skill_id = os.skill_id
    WHERE os.opening_id = p_opening_id;

    SELECT s.proof_score / 100.0 INTO v_proof
    FROM students s WHERE s.student_id = p_student_id;

    IF v_center_vec IS NULL THEN
        v_total := 0.6 * v_sem + 0.2 * v_skill + 0.2 * COALESCE(v_proof, 0);
    ELSE
        v_total := 0.4 * v_sem + 0.2 * v_succ + 0.2 * v_skill + 0.2 * COALESCE(v_proof, 0);
    END IF;

    RETURN QUERY SELECT
        round(v_sem, 4), round(v_succ, 4), round(v_skill, 4),
        round(COALESCE(v_proof, 0), 4), round(LEAST(1, v_total), 4), v_matched;
END;
$$;

-- ---------------------------------------------------------------------
-- Ranked candidates for an opening (eligible students only, applied or not)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_rank_candidates(p_opening_id BIGINT, p_limit INT DEFAULT 20)
RETURNS TABLE (
    student_id     BIGINT,
    full_name      VARCHAR,
    srn            VARCHAR,
    branch         VARCHAR,
    semester       SMALLINT,
    cgpa           NUMERIC,
    sem_score      NUMERIC,
    success_score  NUMERIC,
    skill_score    NUMERIC,
    proof_part     NUMERIC,
    total_score    NUMERIC,
    matched_skills TEXT[],
    application_status application_status
)
LANGUAGE sql STABLE AS $$
    SELECT s.student_id, s.full_name, s.srn, s.branch, s.semester, s.cgpa,
           m.sem_score, m.success_score, m.skill_score, m.proof_part,
           m.total_score, m.matched_skills,
           a.status
    FROM students s
    CROSS JOIN LATERAL fn_match_score(s.student_id, p_opening_id) m
    LEFT JOIN applications a
           ON a.student_id = s.student_id AND a.opening_id = p_opening_id
    WHERE fn_is_eligible(s.student_id, p_opening_id)
    ORDER BY m.total_score DESC, s.cgpa DESC
    LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------
-- TRANSACTION: a student accepts an offer.
-- Call inside BEGIN ... COMMIT. Row locks (FOR UPDATE) make two students
-- racing for the last seat safe: the second one waits, then fails cleanly.
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_accept_offer(
    p_application_id BIGINT,
    p_student_id     BIGINT,
    INOUT p_internship_id BIGINT DEFAULT NULL
)
LANGUAGE plpgsql AS $$
DECLARE
    v_app      applications%ROWTYPE;
    v_opening  openings%ROWTYPE;
BEGIN
    -- 1. Lock the application row
    SELECT * INTO v_app FROM applications
    WHERE application_id = p_application_id
    FOR UPDATE;

    IF NOT FOUND OR v_app.student_id <> p_student_id THEN
        RAISE EXCEPTION 'Application % not found for this student', p_application_id
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_app.status <> 'offered' THEN
        RAISE EXCEPTION 'Only an offered application can be accepted (current: %)', v_app.status
            USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Lock the opening row and check seats
    SELECT * INTO v_opening FROM openings
    WHERE opening_id = v_app.opening_id
    FOR UPDATE;

    IF v_opening.seats_filled >= v_opening.seats_total THEN
        RAISE EXCEPTION 'No seats left in opening %', v_opening.opening_id
            USING ERRCODE = 'check_violation';
    END IF;

    -- 3. Accept, take the seat, start the internship
    UPDATE applications SET status = 'accepted' WHERE application_id = p_application_id;
    UPDATE openings     SET seats_filled = seats_filled + 1 WHERE opening_id = v_opening.opening_id;

    INSERT INTO internships (application_id, start_date)
    VALUES (p_application_id, CURRENT_DATE)
    RETURNING internship_id INTO p_internship_id;

    -- 4. Withdraw the student's other open applications
    UPDATE applications
    SET status = 'withdrawn'
    WHERE student_id = p_student_id
      AND application_id <> p_application_id
      AND status IN ('applied', 'shortlisted', 'offered');
END;
$$;

-- ---------------------------------------------------------------------
-- Success profile = average vector of a lab's interns rated 4 or 5
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_refresh_success_profile(p_center_id BIGINT)
LANGUAGE plpgsql AS $$
DECLARE
    v_vec    vector(384);
    v_count  INTEGER;
BEGIN
    SELECT AVG(se.embedding), COUNT(DISTINCT se.student_id)
    INTO v_vec, v_count
    FROM student_embeddings se
    WHERE se.student_id IN (
        SELECT a.student_id
        FROM internships i
        JOIN applications a ON a.application_id = i.application_id
        JOIN openings o     ON o.opening_id     = a.opening_id
        WHERE o.center_id = p_center_id
          AND i.final_rating >= 4
    );

    IF v_count = 0 OR v_vec IS NULL THEN
        DELETE FROM center_success_profiles WHERE center_id = p_center_id;
    ELSE
        INSERT INTO center_success_profiles (center_id, embedding, intern_count, updated_at)
        VALUES (p_center_id, v_vec, v_count, now())
        ON CONFLICT (center_id) DO UPDATE
            SET embedding = EXCLUDED.embedding,
                intern_count = EXCLUDED.intern_count,
                updated_at = now();
    END IF;
END;
$$;

-- Trigger: rating an internship refreshes that lab's success profile
CREATE OR REPLACE FUNCTION fn_internship_rated()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_center BIGINT;
BEGIN
    SELECT o.center_id INTO v_center
    FROM applications a JOIN openings o ON o.opening_id = a.opening_id
    WHERE a.application_id = NEW.application_id;

    CALL sp_refresh_success_profile(v_center);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_internship_rated
    AFTER UPDATE OF final_rating ON internships
    FOR EACH ROW
    WHEN (NEW.final_rating IS DISTINCT FROM OLD.final_rating)
    EXECUTE FUNCTION fn_internship_rated();

-- ---------------------------------------------------------------------
-- Match alerts: score a student against every open opening they have not
-- applied to; record an alert where the score crosses the lab's threshold.
-- Called by the app after a resume upload or GitHub re-sync.
-- Returns the number of new or improved alerts.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_alerts(p_student_id BIGINT)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO match_alerts (opening_id, student_id, score)
    SELECT o.opening_id, p_student_id, m.total_score
    FROM openings o
    CROSS JOIN LATERAL fn_match_score(p_student_id, o.opening_id) m
    WHERE o.status = 'open'
      AND o.deadline > now()
      AND fn_is_eligible(p_student_id, o.opening_id)
      AND NOT EXISTS (SELECT 1 FROM applications a
                      WHERE a.student_id = p_student_id AND a.opening_id = o.opening_id)
      AND m.total_score >= o.alert_threshold
    ON CONFLICT (opening_id, student_id) DO UPDATE
        SET score = EXCLUDED.score, is_seen = FALSE, created_at = now()
        WHERE match_alerts.score < EXCLUDED.score;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
