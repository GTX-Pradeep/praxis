-- =====================================================================
-- Praxis — 04_triggers.sql
-- Business rules enforced inside the database, so no client (web app,
-- psql, script) can break them.
--
-- The app tells the database who is acting with:
--     SET LOCAL app.current_user_id = '<user_id>';
-- inside each transaction; triggers read it for the audit trail.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Validate a new application
--    * opening must be open and before its deadline
--    * student must meet min CGPA and eligible semesters
--    * student must not already hold an active (accepted) internship
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_application()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_opening  openings%ROWTYPE;
    v_student  students%ROWTYPE;
BEGIN
    SELECT * INTO v_opening FROM openings WHERE opening_id = NEW.opening_id;
    SELECT * INTO v_student FROM students WHERE student_id = NEW.student_id;

    IF v_opening.status <> 'open' THEN
        RAISE EXCEPTION 'Opening % is not accepting applications (status: %)',
            NEW.opening_id, v_opening.status
            USING ERRCODE = 'check_violation';
    END IF;

    IF now() > v_opening.deadline THEN
        RAISE EXCEPTION 'The deadline for opening % has passed', NEW.opening_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_student.cgpa < v_opening.min_cgpa THEN
        RAISE EXCEPTION 'CGPA % is below the minimum % for this opening',
            v_student.cgpa, v_opening.min_cgpa
            USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (SELECT 1 FROM opening_eligible_semesters WHERE opening_id = NEW.opening_id)
       AND NOT EXISTS (SELECT 1 FROM opening_eligible_semesters
                       WHERE opening_id = NEW.opening_id
                         AND semester   = v_student.semester) THEN
        RAISE EXCEPTION 'Semester % is not eligible for this opening', v_student.semester
            USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (SELECT 1
               FROM applications a
               JOIN internships i ON i.application_id = a.application_id
               WHERE a.student_id = NEW.student_id
                 AND a.status = 'accepted'
                 AND i.end_date IS NULL) THEN
        RAISE EXCEPTION 'Student already has an ongoing internship'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.status := 'applied';   -- every application starts at 'applied'
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_application
    BEFORE INSERT ON applications
    FOR EACH ROW EXECUTE FUNCTION fn_validate_application();

-- ---------------------------------------------------------------------
-- 2. Application status is a state machine; illegal jumps are rejected
--    applied     -> shortlisted | rejected | withdrawn
--    shortlisted -> offered     | rejected | withdrawn
--    offered     -> accepted    | rejected | withdrawn
--    accepted / rejected / withdrawn are final
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_check_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.status = 'applied'     AND NEW.status IN ('shortlisted', 'rejected', 'withdrawn')) OR
        (OLD.status = 'shortlisted' AND NEW.status IN ('offered',     'rejected', 'withdrawn')) OR
        (OLD.status = 'offered'     AND NEW.status IN ('accepted',    'rejected', 'withdrawn'))
    ) THEN
        RAISE EXCEPTION 'Illegal status change: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_status_transition
    BEFORE UPDATE OF status ON applications
    FOR EACH ROW EXECUTE FUNCTION fn_check_status_transition();

-- ---------------------------------------------------------------------
-- 3. Audit trail: every status (including the first) is logged
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_log_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO application_status_history (application_id, old_status, new_status, changed_by)
        VALUES (
            NEW.application_id,
            CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
            NEW.status,
            NULLIF(current_setting('app.current_user_id', true), '')::BIGINT
        );
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_log_status_change
    AFTER INSERT OR UPDATE OF status ON applications
    FOR EACH ROW EXECUTE FUNCTION fn_log_status_change();

-- ---------------------------------------------------------------------
-- 4. An opening becomes 'filled' automatically when its last seat goes
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auto_fill_opening()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.seats_filled >= NEW.seats_total THEN
        NEW.status := 'filled';
    ELSIF OLD.status = 'filled' AND NEW.seats_filled < NEW.seats_total THEN
        NEW.status := 'open';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_fill_opening
    BEFORE UPDATE OF seats_filled, seats_total ON openings
    FOR EACH ROW EXECUTE FUNCTION fn_auto_fill_opening();

-- ---------------------------------------------------------------------
-- 5. Keep students.profile_updated_at fresh when skills change
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_touch_student_profile()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE students SET profile_updated_at = now()
    WHERE student_id = COALESCE(NEW.student_id, OLD.student_id);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_touch_student_profile
    AFTER INSERT OR UPDATE OR DELETE ON student_skills
    FOR EACH ROW EXECUTE FUNCTION fn_touch_student_profile();

-- ---------------------------------------------------------------------
-- 6. Skill endorsements are only valid when
--    * the internship has been completed (has an end date), and
--    * the endorser is the faculty member who owns that opening
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validate_endorsement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_end      DATE;
    v_faculty  BIGINT;
BEGIN
    SELECT i.end_date, o.faculty_id INTO v_end, v_faculty
    FROM internships i
    JOIN applications a ON a.application_id = i.application_id
    JOIN openings o     ON o.opening_id     = a.opening_id
    WHERE i.internship_id = NEW.internship_id;

    IF v_end IS NULL THEN
        RAISE EXCEPTION 'Skills can only be endorsed after the internship is completed'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.endorsed_by <> v_faculty THEN
        RAISE EXCEPTION 'Only the supervising faculty member can endorse skills for this internship'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_endorsement
    BEFORE INSERT OR UPDATE ON skill_endorsements
    FOR EACH ROW EXECUTE FUNCTION fn_validate_endorsement();
