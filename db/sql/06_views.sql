-- =====================================================================
-- Praxis — 06_views.sql
-- Views for dashboards (JOIN + GROUP BY + aggregate functions)
-- =====================================================================

-- Pipeline of every opening: how many applicants are at each stage
CREATE OR REPLACE VIEW v_opening_pipeline AS
SELECT
    o.opening_id,
    o.title,
    rc.center_id,
    rc.name                                              AS center_name,
    f.full_name                                          AS faculty_name,
    o.status,
    o.deadline,
    o.seats_total,
    o.seats_filled,
    COUNT(a.application_id)                              AS total_applications,
    COUNT(*) FILTER (WHERE a.status = 'applied')         AS applied,
    COUNT(*) FILTER (WHERE a.status = 'shortlisted')     AS shortlisted,
    COUNT(*) FILTER (WHERE a.status = 'offered')         AS offered,
    COUNT(*) FILTER (WHERE a.status = 'accepted')        AS accepted,
    COUNT(*) FILTER (WHERE a.status = 'rejected')        AS rejected,
    ROUND(AVG(a.match_score), 3)                         AS avg_match_score
FROM openings o
JOIN research_centers rc ON rc.center_id = o.center_id
JOIN faculty f           ON f.faculty_id = o.faculty_id
LEFT JOIN applications a ON a.opening_id = o.opening_id
GROUP BY o.opening_id, rc.center_id, rc.name, f.full_name;

-- Skills each student has had endorsed by faculty after an internship
CREATE OR REPLACE VIEW v_student_verified_skills AS
SELECT
    a.student_id,
    sk.skill_id,
    sk.name                                AS skill_name,
    COUNT(*)                               AS endorsement_count,
    string_agg(DISTINCT f.full_name, ', ') AS endorsed_by,
    MAX(e.endorsed_at)                     AS last_endorsed_at
FROM skill_endorsements e
JOIN internships i  ON i.internship_id  = e.internship_id
JOIN applications a ON a.application_id = i.application_id
JOIN skills sk      ON sk.skill_id      = e.skill_id
JOIN faculty f      ON f.faculty_id     = e.endorsed_by
GROUP BY a.student_id, sk.skill_id, sk.name;

-- Per-center statistics for the admin dashboard.
-- Materialized: refresh with  REFRESH MATERIALIZED VIEW mv_center_stats;
CREATE MATERIALIZED VIEW mv_center_stats AS
SELECT
    rc.center_id,
    rc.name                                                  AS center_name,
    COUNT(DISTINCT o.opening_id)                             AS openings,
    COUNT(DISTINCT a.application_id)                         AS applications,
    COUNT(DISTINCT a.application_id) FILTER (WHERE a.status = 'accepted')  AS accepted,
    COUNT(DISTINCT a.application_id) FILTER (WHERE a.status IN ('offered', 'accepted', 'rejected')
                                              AND EXISTS (SELECT 1 FROM application_status_history h
                                                          WHERE h.application_id = a.application_id
                                                            AND h.new_status = 'offered')) AS offers_made,
    ROUND(AVG(i.final_rating), 2)                            AS avg_intern_rating,
    now()                                                    AS refreshed_at
FROM research_centers rc
LEFT JOIN openings o     ON o.center_id      = rc.center_id
LEFT JOIN applications a ON a.opening_id     = o.opening_id
LEFT JOIN internships i  ON i.application_id = a.application_id
GROUP BY rc.center_id, rc.name;

CREATE UNIQUE INDEX uq_mv_center_stats ON mv_center_stats (center_id);

-- The app's database user is not the owner of the materialized view, so it
-- refreshes through this SECURITY DEFINER function (runs with owner rights).
CREATE OR REPLACE FUNCTION fn_refresh_center_stats()
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_center_stats;
$$;
