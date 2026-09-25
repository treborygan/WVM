use std::io;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use tempfile::TempDir;

use super::{
    apply_migrations, AssetRecord, AssetRepository, AuditEventRecord, Migration, SqliteDatabase,
    StorageResult, TemplateListQuery, TemplateRecord, TemplateRepository, TemplateVersionRecord,
    VisualListQuery, VisualRecord, VisualRepository, VisualVersionRecord,
};

fn open_database() -> (TempDir, SqliteDatabase) {
    let directory = TempDir::new().expect("temporary directory");
    let database =
        SqliteDatabase::open(directory.path().join("wvm.sqlite")).expect("database opens");
    (directory, database)
}

fn template(id: &str) -> TemplateRecord {
    TemplateRecord {
        id: id.to_owned(),
        family: "gang-standard-2up".to_owned(),
        name: "Synthetic Gang".to_owned(),
        visual_type: "gang".to_owned(),
        lifecycle_state: "Draft".to_owned(),
        active_published_version_id: None,
        created_at: "2026-09-25T08:00:00.000Z".to_owned(),
        updated_at: "2026-09-25T08:00:00.000Z".to_owned(),
        provenance: None,
    }
}

fn visual(id: &str, template_id: &str, name: &str, flow: &str) -> VisualRecord {
    VisualRecord {
        id: id.to_owned(),
        name: name.to_owned(),
        visual_type: "gang".to_owned(),
        template_id: template_id.to_owned(),
        stock_class: Some("synthetic-stock".to_owned()),
        location: Some("A-01".to_owned()),
        flow: Some(flow.to_owned()),
        description: Some("Synthetic fixture".to_owned()),
        accent_color: Some("#123".to_owned()),
        lifecycle_state: "Draft".to_owned(),
        current_draft_version_id: None,
        current_published_version_id: None,
        created_at: "2026-09-25T08:00:00.000Z".to_owned(),
        updated_at: "2026-09-25T08:00:00.000Z".to_owned(),
    }
}

fn document() -> Value {
    json!({
        "schema_version": 1,
        "page": { "width_mm": 210, "height_mm": 297, "orientation": "portrait" },
        "print_rules": {
            "copies_per_page": 1,
            "margins_mm": { "top": 5, "right": 5, "bottom": 5, "left": 5 },
            "gap_mm": 0,
            "slots": { "rows": 1, "columns": 1 }
        },
        "repetition": { "kind": "none" },
        "defaults": {},
        "elements": []
    })
}

fn template_version(id: &str, template_id: &str) -> TemplateVersionRecord {
    TemplateVersionRecord {
        id: id.to_owned(),
        template_id: template_id.to_owned(),
        version_number: 1,
        document: document(),
        created_by: Some("synthetic-test".to_owned()),
        created_at: "2026-09-25T08:00:00.000Z".to_owned(),
        published_at: Some("2026-09-25T08:00:00.000Z".to_owned()),
    }
}

fn visual_version(id: &str, visual_id: &str, template_version_id: &str) -> VisualVersionRecord {
    VisualVersionRecord {
        id: id.to_owned(),
        visual_id: visual_id.to_owned(),
        version_number: 1,
        template_version_id: template_version_id.to_owned(),
        values: json!({ "location": "A-01", "flow": "outbound" }),
        notes: None,
        special_validation: None,
        created_by: Some("synthetic-test".to_owned()),
        created_at: "2026-09-25T08:00:00.000Z".to_owned(),
        published_at: None,
    }
}

fn audit(id: &str, entity_id: &str) -> AuditEventRecord {
    AuditEventRecord {
        id: id.to_owned(),
        entity_kind: "visual_version".to_owned(),
        entity_id: entity_id.to_owned(),
        version_id: Some(entity_id.to_owned()),
        action: "version_created".to_owned(),
        occurred_at: "2026-09-25T08:00:00.000Z".to_owned(),
        actor: Some("synthetic-test".to_owned()),
        details: json!({ "source": "synthetic-test" }),
    }
}

fn template_audit(id: &str, entity_id: &str) -> AuditEventRecord {
    AuditEventRecord {
        entity_kind: "template_version".to_owned(),
        ..audit(id, entity_id)
    }
}

fn pointer_audit(
    id: &str,
    entity_kind: &str,
    entity_id: &str,
    version_id: &str,
) -> AuditEventRecord {
    AuditEventRecord {
        id: id.to_owned(),
        entity_kind: entity_kind.to_owned(),
        entity_id: entity_id.to_owned(),
        version_id: Some(version_id.to_owned()),
        action: "current_version_changed".to_owned(),
        occurred_at: "2026-09-25T08:00:00.000Z".to_owned(),
        actor: Some("synthetic-test".to_owned()),
        details: json!({ "source": "synthetic-test" }),
    }
}

fn add_parent_records(database: &SqliteDatabase) {
    let connection = database.connect().expect("connection opens");
    TemplateRepository
        .create(&connection, &template("template-1"))
        .expect("template inserts");
    database
        .transaction(|transaction| {
            TemplateRepository.add_version(
                transaction,
                &template_version("template-version-1", "template-1"),
                &template_audit("template-audit-1", "template-version-1"),
            )
        })
        .expect("template version inserts");
    VisualRepository
        .create(
            &connection,
            &visual("visual-1", "template-1", "Synthetic outbound", "outbound"),
        )
        .expect("visual inserts");
}

#[test]
fn repository_contract_preserves_stable_ids_and_searches_catalog_fields() {
    let (_directory, database) = open_database();
    let connection = database.connect().expect("connection opens");
    TemplateRepository
        .create(&connection, &template("legacy-template-1"))
        .expect("template inserts");
    let mut special_template = template("legacy-template-special");
    special_template.family = "gang-special-2up".to_owned();
    TemplateRepository
        .create(&connection, &special_template)
        .expect("special template inserts");
    VisualRepository
        .create(
            &connection,
            &visual(
                "POC-GANG-124",
                "legacy-template-1",
                "Synthetic outbound",
                "Outbound Flow",
            ),
        )
        .expect("legacy visual ID inserts unchanged");
    VisualRepository
        .create(
            &connection,
            &visual(
                "POC-GANG-125",
                "legacy-template-1",
                "Synthetic return",
                "Return Flow",
            ),
        )
        .expect("second visual inserts");
    connection
        .execute(
            "UPDATE visuals SET lifecycle_state = 'Review' WHERE id = 'POC-GANG-125'",
            [],
        )
        .expect("second visual enters review");

    let found = VisualRepository
        .get(&connection, "POC-GANG-124")
        .expect("visual query");
    let filtered = VisualRepository
        .list(
            &connection,
            &VisualListQuery {
                search: Some("outbound".to_owned()),
                lifecycle_state: Some("Draft".to_owned()),
                template_family: Some("gang-standard-2up".to_owned()),
            },
        )
        .expect("visual list");
    let by_location = VisualRepository
        .list(
            &connection,
            &VisualListQuery {
                search: Some("a-01".to_owned()),
                ..Default::default()
            },
        )
        .expect("location search");
    let special_templates = TemplateRepository
        .list(
            &connection,
            &TemplateListQuery {
                family: Some("gang-special-2up".to_owned()),
                ..Default::default()
            },
        )
        .expect("template family filter");

    assert_eq!(found.expect("stable ID remains present").id, "POC-GANG-124");
    assert_eq!(filtered.len(), 1);
    assert_eq!(filtered[0].id, "POC-GANG-124");
    assert_eq!(by_location.len(), 2);
    assert_eq!(special_templates.len(), 1);
    assert_eq!(special_templates[0].id, "legacy-template-special");
}

#[test]
fn repository_contract_enables_foreign_keys_on_every_connection() {
    let (_directory, database) = open_database();
    for _ in 0..2 {
        let connection = database.connect().expect("connection opens");
        let enabled: i64 = connection
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .expect("foreign key setting is readable");
        assert_eq!(enabled, 1);
        assert!(VisualRepository
            .create(
                &connection,
                &visual("orphan", "missing-template", "Orphan", "flow")
            )
            .is_err());
    }
}

#[test]
fn repository_contract_enforces_version_immutability_and_unique_numbers() {
    let (_directory, database) = open_database();
    let connection = database.connect().expect("connection opens");
    TemplateRepository
        .create(&connection, &template("template-1"))
        .expect("template inserts");
    let first = template_version("template-version-1", "template-1");
    database
        .transaction(|transaction| {
            TemplateRepository.add_version(
                transaction,
                &first,
                &template_audit("template-audit-1", &first.id),
            )
        })
        .expect("template version inserts");
    let unpublished_template = TemplateRepository
        .get(&connection, "template-1")
        .expect("template query")
        .expect("template exists");
    assert_eq!(unpublished_template.active_published_version_id, None);
    assert_eq!(unpublished_template.lifecycle_state, "Draft");

    let mut skipped = template_version("template-version-3", "template-1");
    skipped.version_number = 3;
    assert!(database
        .transaction(|transaction| TemplateRepository.add_version(
            transaction,
            &skipped,
            &template_audit("template-audit-3", &skipped.id),
        ))
        .is_ok());

    assert!(connection
        .execute(
            "UPDATE template_versions SET created_by = 'changed' WHERE id = ?1",
            [&first.id]
        )
        .is_err());
    assert!(connection
        .execute("DELETE FROM template_versions WHERE id = ?1", [&first.id])
        .is_err());
    let mut duplicate = first.clone();
    duplicate.id = "template-version-duplicate".to_owned();
    assert!(database
        .transaction(|transaction| TemplateRepository.add_version(
            transaction,
            &duplicate,
            &template_audit("template-audit-2", &duplicate.id)
        ))
        .is_err());
}

#[test]
fn repository_contract_writes_version_pointer_and_audit_in_one_transaction() {
    let (_directory, database) = open_database();
    add_parent_records(&database);
    let connection = database.connect().expect("connection opens");
    let version = visual_version("visual-version-1", "visual-1", "template-version-1");
    let event = audit("visual-audit-1", &version.id);
    let pointer_event = pointer_audit("visual-pointer-audit-1", "visual", "visual-1", &version.id);

    database
        .transaction(|transaction| {
            VisualRepository.add_version(transaction, &version, &event)?;
            let pointer: Option<String> = transaction.query_row(
                "SELECT current_draft_version_id FROM visuals WHERE id = 'visual-1'",
                [],
                |row| row.get(0),
            )?;
            assert_eq!(
                pointer, None,
                "adding a version must not change its pointer without a pointer audit"
            );
            VisualRepository.set_current_draft_version(
                transaction,
                "visual-1",
                &version.id,
                &pointer_event,
            )
        })
        .expect("version and audit commit");

    let visual = VisualRepository
        .get(&connection, "visual-1")
        .expect("visual query")
        .expect("visual exists");
    let (versions, audits): (i64, i64) = connection
        .query_row(
            "SELECT (SELECT COUNT(*) FROM visual_versions WHERE id = ?1),
             (SELECT COUNT(*) FROM audit_events WHERE id IN (?2, ?3))",
            (&version.id, &event.id, &pointer_event.id),
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("version and audit counts query");

    assert_eq!(
        visual.current_draft_version_id.as_deref(),
        Some(version.id.as_str())
    );
    assert_eq!((versions, audits), (1, 2));
    assert_eq!(
        VisualRepository
            .list_versions(&connection, "visual-1")
            .expect("versions read"),
        vec![version]
    );
    assert!(connection
        .execute(
            "UPDATE audit_events SET action = 'changed' WHERE id = ?1",
            [&event.id]
        )
        .is_err());
    assert!(connection
        .execute("DELETE FROM audit_events WHERE id = ?1", [&event.id])
        .is_err());
}

#[test]
fn repository_contract_audits_template_pointer_changes() {
    let (_directory, database) = open_database();
    add_parent_records(&database);
    let event = pointer_audit(
        "template-pointer-audit",
        "template",
        "template-1",
        "template-version-1",
    );
    database
        .transaction(|transaction| {
            TemplateRepository.set_active_published_version(
                transaction,
                "template-1",
                "template-version-1",
                &event,
            )
        })
        .expect("template pointer and audit commit");
    let connection = database.connect().expect("connection opens");
    let count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM audit_events WHERE id = ?1",
            [&event.id],
            |row| row.get(0),
        )
        .expect("audit count query");
    assert_eq!(count, 1);
}

#[test]
fn repository_contract_rejects_cross_template_versions_and_misassociated_audits() {
    let (_directory, database) = open_database();
    add_parent_records(&database);
    let connection = database.connect().expect("connection opens");
    TemplateRepository
        .create(&connection, &template("other-template"))
        .expect("other template inserts");
    database
        .transaction(|transaction| {
            TemplateRepository.add_version(
                transaction,
                &template_version("other-template-version", "other-template"),
                &template_audit("other-template-audit", "other-template-version"),
            )
        })
        .expect("second template version inserts");

    let mut version = visual_version(
        "visual-version-wrong-template",
        "visual-1",
        "other-template-version",
    );
    let result = database.transaction(|transaction| {
        VisualRepository.add_version(
            transaction,
            &version,
            &audit("visual-audit-wrong-template", &version.id),
        )
    });
    assert!(result.is_err());

    version.template_version_id = "template-version-1".to_owned();
    let mut wrong_audit = audit("visual-audit-wrong-entity", &version.id);
    wrong_audit.entity_id = "different-version".to_owned();
    assert!(database
        .transaction(|transaction| VisualRepository.add_version(
            transaction,
            &version,
            &wrong_audit
        ))
        .is_err());
}

#[test]
fn repository_contract_requires_visual_version_numbers_to_increase_monotonically() {
    let (_directory, database) = open_database();
    add_parent_records(&database);
    let version = visual_version("visual-version-3", "visual-1", "template-version-1");
    let mut version = version;
    version.version_number = 3;
    assert!(database
        .transaction(|transaction| VisualRepository.add_version(
            transaction,
            &version,
            &audit("visual-audit-3", &version.id),
        ))
        .is_ok());

    let mut older = visual_version("visual-version-2", "visual-1", "template-version-1");
    older.version_number = 2;
    assert!(database
        .transaction(|transaction| VisualRepository.add_version(
            transaction,
            &older,
            &audit("visual-audit-2", &older.id),
        ))
        .is_err());
}

#[test]
fn repository_contract_upgrades_existing_v1_databases_with_special_publication_gate() {
    let directory = TempDir::new().expect("temporary directory");
    let path = directory.path().join("wvm.sqlite");
    let mut connection = Connection::open(&path).expect("connection opens");
    super::configure_connection(&connection).expect("connection configured");
    let v1 = [Migration {
        version: 1,
        name: "0001_initial.sql",
        sql: super::INITIAL_SCHEMA,
    }];
    apply_migrations(&mut connection, &v1).expect("v1 schema applies");
    connection
        .execute_batch(super::SPECIAL_PUBLICATION_GATE)
        .expect("shipped v1 publication trigger applies without recording a second migration");
    drop(connection);

    let database = SqliteDatabase::open(&path).expect("database upgrades");
    assert_eq!(database.schema_version().expect("schema version"), 3);
    let connection = database.connect().expect("connection opens");
    let trigger_count: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name = 'special_visual_versions_require_validation'",
            [],
            |row| row.get(0),
        )
        .expect("trigger lookup");
    assert_eq!(trigger_count, 1);
}

#[test]
fn repository_contract_blocks_unvalidated_special_visual_publication() {
    let (_directory, database) = open_database();
    let connection = database.connect().expect("connection opens");
    let mut special_template = template("special-template");
    special_template.family = "gang-special-2up".to_owned();
    TemplateRepository
        .create(&connection, &special_template)
        .expect("special template inserts");
    database
        .transaction(|transaction| {
            TemplateRepository.add_version(
                transaction,
                &template_version("special-template-version", "special-template"),
                &template_audit("special-template-audit", "special-template-version"),
            )
        })
        .expect("published template version inserts");
    VisualRepository
        .create(
            &connection,
            &visual(
                "special-visual",
                "special-template",
                "Synthetic special",
                "special flow",
            ),
        )
        .expect("special visual inserts");

    let mut version = visual_version(
        "special-visual-version",
        "special-visual",
        "special-template-version",
    );
    version.published_at = Some("2026-09-25T08:00:00.000Z".to_owned());
    assert!(database
        .transaction(|transaction| {
            VisualRepository.add_version(
                transaction,
                &version,
                &audit("special-visual-audit", &version.id),
            )
        })
        .is_err());
    assert!(connection.execute(
        "INSERT INTO visual_versions(id, visual_id, version_number, template_version_id, values_json,
         created_at, published_at) VALUES ('special-visual-direct', 'special-visual', 1,
         'special-template-version', '{}', '2026-09-25T08:00:00.000Z', '2026-09-25T08:00:00.000Z')",
        [],
    ).is_err());

    for (id, version_number, evidence) in [
        (
            "special-visual-numeric-reviewer",
            2_i64,
            json!({
                "state": "validated",
                "reviewer_id": 123,
                "reviewed_at": "2026-09-25T08:00:00.000Z",
                "evidence_ref": "synthetic-evidence"
            }),
        ),
        (
            "special-visual-object-evidence",
            3_i64,
            json!({
                "state": "validated",
                "reviewer_id": "reviewer-1",
                "reviewed_at": "2026-09-25T08:00:00.000Z",
                "evidence_ref": { "ref": "synthetic-evidence" }
            }),
        ),
        (
            "special-visual-24-hour-time",
            4_i64,
            json!({
                "state": "validated",
                "reviewer_id": "reviewer-1",
                "reviewed_at": "2026-01-01T24:00:00.000Z",
                "evidence_ref": "synthetic-evidence"
            }),
        ),
    ] {
        let result = connection.execute(
            "INSERT INTO visual_versions(id, visual_id, version_number, template_version_id, values_json,
             special_validation_json, created_at, published_at) VALUES (?1, 'special-visual', ?2,
             'special-template-version', '{}', ?3, '2026-09-25T08:00:00.000Z', '2026-09-25T08:00:00.000Z')",
            params![id, version_number, evidence.to_string()],
        );
        assert!(result.is_err(), "database trigger accepted invalid evidence: {id}");
    }

    version.special_validation = Some(json!({
        "state": "validated",
        "reviewer_id": "reviewer-1",
        "reviewed_at": "2026-02-30T08:00:00.000Z",
        "evidence_ref": "synthetic-evidence-1"
    }));
    assert!(database
        .transaction(|transaction| {
            VisualRepository.add_version(
                transaction,
                &version,
                &audit("special-visual-audit-invalid-date", &version.id),
            )
        })
        .is_err());

    version.special_validation = Some(json!({
        "state": "validated",
        "reviewer_id": "reviewer-1",
        "reviewed_at": "2026-09-25T08:00:00.000Z",
        "evidence_ref": "synthetic-evidence-1"
    }));
    assert!(database
        .transaction(|transaction| {
            VisualRepository.add_version(
                transaction,
                &version,
                &audit("special-visual-audit-valid", &version.id),
            )
        })
        .is_ok());
}

#[test]
fn repository_contract_rejects_nested_visual_version_values() {
    let (_directory, database) = open_database();
    add_parent_records(&database);

    for invalid_value in [json!([]), json!({ "nested": "value" })] {
        let mut version = visual_version(
            "visual-version-invalid-value",
            "visual-1",
            "template-version-1",
        );
        version.values["location"] = invalid_value;
        let result = database.transaction(|transaction| {
            VisualRepository.add_version(
                transaction,
                &version,
                &audit("visual-audit-invalid-value", &version.id),
            )
        });
        assert!(result.is_err(), "accepted nested visual value: {}", version.values);
    }
}

#[test]
fn repository_contract_rolls_back_version_pointer_and_audit_after_injected_failure() {
    let (_directory, database) = open_database();
    add_parent_records(&database);
    let version = visual_version("visual-version-fail", "visual-1", "template-version-1");
    let event = audit("visual-audit-fail", &version.id);
    let pointer_event = pointer_audit(
        "visual-pointer-audit-fail",
        "visual",
        "visual-1",
        &version.id,
    );

    let result: StorageResult<()> = database.transaction(|transaction| {
        VisualRepository.add_version(transaction, &version, &event)?;
        VisualRepository.set_current_draft_version(
            transaction,
            "visual-1",
            &version.id,
            &pointer_event,
        )?;
        Err(Box::new(io::Error::other("injected transaction failure")))
    });
    assert!(result.is_err());

    let connection = database.connect().expect("connection opens");
    let pointer: Option<String> = connection
        .query_row(
            "SELECT current_draft_version_id FROM visuals WHERE id = 'visual-1'",
            [],
            |row| row.get(0),
        )
        .expect("pointer query");
    let (versions, version_audits, pointer_audits): (i64, i64, i64) = connection
        .query_row(
            "SELECT (SELECT COUNT(*) FROM visual_versions WHERE id = ?1),
             (SELECT COUNT(*) FROM audit_events WHERE id = ?2),
             (SELECT COUNT(*) FROM audit_events WHERE id = ?3)",
            (&version.id, &event.id, &pointer_event.id),
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("version and audit counts query");

    assert_eq!(pointer, None);
    assert_eq!((versions, version_audits, pointer_audits), (0, 0, 0));
}

#[test]
fn repository_contract_rejects_invalid_template_document_json() {
    let (_directory, database) = open_database();
    let connection = database.connect().expect("connection opens");
    TemplateRepository
        .create(&connection, &template("template-1"))
        .expect("template inserts");
    let mut invalid = template_version("invalid-document", "template-1");
    invalid.document["schema_version"] = json!(2);

    assert!(database
        .transaction(|transaction| TemplateRepository.add_version(
            transaction,
            &invalid,
            &template_audit("template-audit-invalid", &invalid.id)
        ))
        .is_err());
}

#[test]
fn repository_contract_rolls_back_failed_migrations() {
    let directory = TempDir::new().expect("temporary directory");
    let mut connection =
        Connection::open(directory.path().join("migration.sqlite")).expect("db opens");
    let broken = [Migration {
        version: 1,
        name: "0001_broken",
        sql: "CREATE TABLE must_rollback (id INTEGER); THIS IS NOT VALID SQL;",
    }];

    assert!(apply_migrations(&mut connection, &broken).is_err());
    let version: i64 = connection
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .expect("migration version query");
    let table: Option<String> = connection
        .query_row(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'must_rollback'",
            [],
            |row| row.get(0),
        )
        .optional()
        .expect("table lookup");

    assert_eq!(version, 0);
    assert_eq!(table, None);
}

#[test]
fn repository_contract_reads_and_writes_asset_metadata() {
    let (_directory, database) = open_database();
    let connection = database.connect().expect("connection opens");
    let asset = AssetRecord {
        id: "asset-synthetic-1".to_owned(),
        kind: "image".to_owned(),
        original_name: "synthetic.png".to_owned(),
        mime_type: "image/png".to_owned(),
        content_hash: "sha256:synthetic".to_owned(),
        storage_locator: "assets/synthetic.png".to_owned(),
        intrinsic_width_px: Some(32),
        intrinsic_height_px: Some(24),
        created_at: "2026-09-25T08:00:00.000Z".to_owned(),
    };
    AssetRepository
        .create(&connection, &asset)
        .expect("asset metadata inserts");

    assert_eq!(
        AssetRepository
            .get(&connection, &asset.id)
            .expect("asset query"),
        Some(asset)
    );
}
