CREATE TABLE assets (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    kind TEXT NOT NULL CHECK (kind IN ('image', 'logo')),
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    content_hash TEXT NOT NULL UNIQUE,
    storage_locator TEXT NOT NULL,
    intrinsic_width_px INTEGER CHECK (intrinsic_width_px IS NULL OR intrinsic_width_px > 0),
    intrinsic_height_px INTEGER CHECK (intrinsic_height_px IS NULL OR intrinsic_height_px > 0),
    created_at TEXT NOT NULL
);

CREATE TABLE brand_profiles (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    name TEXT NOT NULL,
    logo_asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
    primary_color TEXT,
    accent_color TEXT,
    default_font_family TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE templates (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    family TEXT NOT NULL CHECK (family IN (
        'gang-standard-2up',
        'gang-special-2up',
        'flow-sticker-12up',
        'stand-standard-3up',
        'stand-level-instruction-3up'
    )),
    name TEXT NOT NULL,
    visual_type TEXT NOT NULL,
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('Draft', 'Review', 'Published', 'Retired')),
    active_published_version_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    provenance TEXT,
    FOREIGN KEY (active_published_version_id, id)
        REFERENCES template_versions(id, template_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE template_versions (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    document_json TEXT NOT NULL CHECK (
        json_valid(document_json) AND json_type(document_json) = 'object'
        AND json_extract(document_json, '$.schema_version') = 1
    ),
    created_by TEXT,
    created_at TEXT NOT NULL,
    published_at TEXT,
    UNIQUE (template_id, version_number),
    UNIQUE (id, template_id)
);

CREATE TABLE visuals (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    name TEXT NOT NULL,
    visual_type TEXT NOT NULL,
    template_id TEXT NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
    stock_class TEXT,
    location TEXT,
    flow TEXT,
    description TEXT,
    accent_color TEXT,
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('Draft', 'Review', 'Published', 'Retired')),
    current_draft_version_id TEXT,
    current_published_version_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (current_draft_version_id, id)
        REFERENCES visual_versions(id, visual_id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (current_published_version_id, id)
        REFERENCES visual_versions(id, visual_id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE visual_versions (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    visual_id TEXT NOT NULL REFERENCES visuals(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    template_version_id TEXT NOT NULL REFERENCES template_versions(id) ON DELETE RESTRICT,
    values_json TEXT NOT NULL CHECK (json_valid(values_json) AND json_type(values_json) = 'object'),
    notes TEXT,
    special_validation_json TEXT CHECK (
        special_validation_json IS NULL OR
        (json_valid(special_validation_json) AND json_type(special_validation_json) = 'object')
    ),
    created_by TEXT,
    created_at TEXT NOT NULL,
    published_at TEXT,
    UNIQUE (visual_id, version_number),
    UNIQUE (id, visual_id)
);

CREATE TRIGGER special_visual_versions_require_validation
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

CREATE TABLE legacy_source_references (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    visual_id TEXT NOT NULL REFERENCES visuals(id) ON DELETE RESTRICT,
    source_id TEXT NOT NULL,
    source_name TEXT NOT NULL,
    sheet_or_slide TEXT,
    side TEXT,
    raw_source_text TEXT,
    migration_batch TEXT NOT NULL,
    validation_state TEXT NOT NULL CHECK (validation_state IN ('unreviewed', 'pending', 'validated', 'rejected')),
    UNIQUE (migration_batch, source_id)
);

CREATE TABLE audit_events (
    id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
    entity_kind TEXT NOT NULL CHECK (entity_kind IN (
        'brand_profile', 'asset', 'template', 'template_version',
        'visual', 'visual_version', 'legacy_source_reference'
    )),
    entity_id TEXT NOT NULL,
    version_id TEXT,
    action TEXT NOT NULL CHECK (length(action) > 0),
    occurred_at TEXT NOT NULL,
    actor TEXT,
    details_json TEXT NOT NULL CHECK (json_valid(details_json) AND json_type(details_json) = 'object')
);

CREATE TRIGGER template_versions_are_immutable_update
BEFORE UPDATE ON template_versions
BEGIN
    SELECT RAISE(ABORT, 'template versions are immutable');
END;

CREATE TRIGGER template_versions_are_immutable_delete
BEFORE DELETE ON template_versions
BEGIN
    SELECT RAISE(ABORT, 'template versions are immutable');
END;

CREATE TRIGGER visual_versions_are_immutable_update
BEFORE UPDATE ON visual_versions
BEGIN
    SELECT RAISE(ABORT, 'visual versions are immutable');
END;

CREATE TRIGGER visual_versions_are_immutable_delete
BEFORE DELETE ON visual_versions
BEGIN
    SELECT RAISE(ABORT, 'visual versions are immutable');
END;

CREATE TRIGGER audit_events_are_immutable_update
BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are append-only');
END;

CREATE TRIGGER audit_events_are_immutable_delete
BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are append-only');
END;

CREATE INDEX idx_templates_family_name ON templates(family, name COLLATE NOCASE);
CREATE INDEX idx_templates_lifecycle ON templates(lifecycle_state);
CREATE INDEX idx_visuals_name ON visuals(name COLLATE NOCASE);
CREATE INDEX idx_visuals_type ON visuals(visual_type);
CREATE INDEX idx_visuals_template ON visuals(template_id);
CREATE INDEX idx_visuals_lifecycle ON visuals(lifecycle_state);
CREATE INDEX idx_visuals_stock_class ON visuals(stock_class);
CREATE INDEX idx_visuals_location ON visuals(location);
CREATE INDEX idx_visuals_flow ON visuals(flow);
CREATE INDEX idx_visual_versions_visual ON visual_versions(visual_id, version_number);
CREATE INDEX idx_template_versions_template ON template_versions(template_id, version_number);
CREATE INDEX idx_legacy_source_visual ON legacy_source_references(visual_id);
CREATE INDEX idx_audit_entity ON audit_events(entity_kind, entity_id, occurred_at);
