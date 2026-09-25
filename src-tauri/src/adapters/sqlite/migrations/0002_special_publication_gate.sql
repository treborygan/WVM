CREATE TRIGGER IF NOT EXISTS special_visual_versions_require_validation
BEFORE INSERT ON visual_versions
WHEN NEW.published_at IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM visuals v JOIN templates t ON t.id = v.template_id
        WHERE v.id = NEW.visual_id AND t.family = 'gang-special-2up'
    )
    AND (
        COALESCE(json_valid(NEW.special_validation_json), 0) = 0
        OR COALESCE(json_extract(NEW.special_validation_json, '$.state') = 'validated', 0) = 0
        OR COALESCE(length(trim(json_extract(NEW.special_validation_json, '$.reviewer_id'))), 0) = 0
        OR COALESCE(length(trim(json_extract(NEW.special_validation_json, '$.evidence_ref'))), 0) = 0
        OR COALESCE(length(json_extract(NEW.special_validation_json, '$.reviewed_at')), 0) <> 24
        OR COALESCE(json_extract(NEW.special_validation_json, '$.reviewed_at') GLOB
            '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'
        , 0) = 0
        OR COALESCE(
            strftime('%Y-%m-%dT%H:%M:%fZ', json_extract(NEW.special_validation_json, '$.reviewed_at'))
                = json_extract(NEW.special_validation_json, '$.reviewed_at'),
            0
        ) = 0
    )
BEGIN
    SELECT RAISE(ABORT, 'special Gang versions require complete validation evidence before publication');
END;
