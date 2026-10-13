use rusqlite::Connection;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::adapters::sqlite::{
    AuditEventRecord, LegacySourceReferenceRecord, SqliteDatabase, StorageResult, TemplateRecord,
    TemplateRepository, TemplateVersionRecord, VisualListQuery, VisualRecord, VisualRepository,
    VisualVersionRecord,
};
use crate::application::catalog::{
    lifecycle_transition_allowed, CatalogListQuery, CatalogPage, CatalogPort, CatalogVisualSummary,
    CreateVisualRequest, LegacySourceReferenceData, LifecycleAction, SaveDraftRequest,
    TemplateChoice, TemplateData, TemplateListQuery, TransitionRequest, VisualData, VisualDetail,
    VisualFields, VisualVersionData,
};

type AppResult<T> = Result<T, String>;

pub struct CatalogGateway<'a> {
    database: &'a SqliteDatabase,
}

impl<'a> CatalogGateway<'a> {
    pub fn new(database: &'a SqliteDatabase) -> Self {
        Self { database }
    }

    fn list_impl(&self, query: &CatalogListQuery) -> AppResult<CatalogPage> {
        let connection = self.database.connect().map_err(as_message)?;
        let storage_query = VisualListQuery {
            search: query.search.clone(),
            visual_type: query.visual_type.clone(),
            lifecycle_state: query.lifecycle_state.clone(),
            template_family: query.template_family.clone(),
            stock_class: query.stock_class.clone(),
            location: query.location.clone(),
            flow: query.flow.clone(),
            description: query.description.clone(),
            legacy_source: query.legacy_source.clone(),
            sort_by: query.sort_by.clone(),
            sort_order: query.sort_order.clone(),
            page: query.page,
            page_size: query.page_size,
        };
        let result = VisualRepository
            .list_page(&connection, &storage_query)
            .map_err(as_message)?;
        Ok(CatalogPage {
            items: result
                .items
                .into_iter()
                .map(|row| CatalogVisualSummary {
                    visual: visual_to_data(row.visual),
                    template_family: row.template_family,
                    legacy_search_text: row.legacy_search_text,
                })
                .collect(),
            page: result.page,
            page_size: result.page_size,
            total: result.total,
            total_pages: result.total_pages,
        })
    }

    pub fn list(&self, query: &CatalogListQuery) -> AppResult<CatalogPage> {
        self.list_impl(query)
    }

    fn templates_impl(&self, query: &TemplateListQuery) -> AppResult<Vec<TemplateChoice>> {
        let connection = self.database.connect().map_err(as_message)?;
        let storage_query = crate::adapters::sqlite::TemplateListQuery {
            search: query.search.clone(),
            family: query.family.clone(),
        };
        let mut choices = Vec::new();
        for template in TemplateRepository
            .list(&connection, &storage_query)
            .map_err(as_message)?
        {
            let versions = TemplateRepository
                .list_versions(&connection, &template.id)
                .map_err(as_message)?;
            let selected = template
                .active_published_version_id
                .as_deref()
                .and_then(|id| versions.iter().find(|version| version.id == id))
                .or_else(|| versions.last())
                .ok_or_else(|| format!("Template {} has no usable version.", template.name))?;
            choices.push(TemplateChoice {
                template: template_to_data(template),
                selected_version_id: selected.id.clone(),
                selected_version_number: selected.version_number,
            });
        }
        Ok(choices)
    }

    pub fn templates(&self, query: &TemplateListQuery) -> AppResult<Vec<TemplateChoice>> {
        self.templates_impl(query)
    }

    /// Adds an explicitly requested synthetic catalog for evaluation; never runs during startup.
    pub fn initialize_synthetic_samples(&self) -> AppResult<()> {
        const FAMILIES: [(&str, &str, &str, i64, i64); 5] = [
            ("gang-standard-2up", "Gang standard 2-up", "gang", 2, 1),
            ("gang-special-2up", "Gang composite 2-up", "gang", 2, 1),
            (
                "flow-sticker-12up",
                "Flow sticker 12-up",
                "flow_sticker",
                4,
                3,
            ),
            ("stand-standard-3up", "Stand standard 3-up", "stand", 3, 1),
            (
                "stand-level-instruction-3up",
                "Stand level / instruction 3-up",
                "stand",
                3,
                1,
            ),
        ];
        let now = utc_now(self.database).map_err(as_message)?;
        self.database
            .transaction(|transaction| {
                let existing: i64 = transaction.query_row("SELECT COUNT(*) FROM templates", [], |row| row.get(0))?;
                if existing != 0 {
                    return Err(invalid_data("Synthetic samples can only initialize an empty template catalog."));
                }
                for (index, (family, name, visual_type, rows, columns)) in FAMILIES.iter().enumerate() {
                    let template_id = format!("sample-template-{family}");
                    let template_version_id = format!("sample-template-version-{family}");
                    TemplateRepository.create(transaction, &TemplateRecord {
                        id: template_id.clone(), family: (*family).to_owned(), name: format!("{name} · sample"),
                        visual_type: (*visual_type).to_owned(), lifecycle_state: "Draft".to_owned(),
                        active_published_version_id: None, created_at: now.clone(), updated_at: now.clone(),
                        provenance: Some("Synthetic sample; replace or edit before production use.".to_owned()),
                    })?;
                    let width = 210.0;
                    let height = 297.0;
                    let document = json!({
                        "schema_version": 1,
                        "page": { "width_mm": width, "height_mm": height, "orientation": "portrait" },
                        "print_rules": { "copies_per_page": rows * columns,
                            "margins_mm": { "top": 5, "right": 5, "bottom": 5, "left": 5 },
                            "gap_mm": 2, "slots": { "rows": rows, "columns": columns } },
                        "repetition": { "kind": "none" }, "defaults": {}, "elements": []
                    });
                    let template_version = TemplateVersionRecord {
                        id: template_version_id.clone(), template_id: template_id.clone(), version_number: 1,
                        document, created_by: Some("synthetic-sample".to_owned()), created_at: now.clone(), published_at: None,
                    };
                    TemplateRepository.add_version(transaction, &template_version, &audit_event(
                        &format!("sample-audit-template-version-{index}"), "template_version", &template_version_id,
                        Some(&template_version_id), "synthetic_template_created", &now, Some("synthetic-sample".to_owned()),
                    ))?;
                    let visual_id = format!("sample-visual-{family}");
                    let visual_version_id = format!("sample-visual-version-{family}");
                    let visual = VisualRecord {
                        id: visual_id.clone(), name: format!("Sample {name}"), visual_type: (*visual_type).to_owned(),
                        template_id, stock_class: Some("SAMPLE".to_owned()), location: Some(format!("SAMPLE-{:02}", index + 1)),
                        flow: Some("SYNTHETIC-FLOW".to_owned()),
                        description: Some("Synthetic example only; no operational data.".to_owned()),
                        accent_color: Some("#D40511".to_owned()), lifecycle_state: "Draft".to_owned(),
                        current_draft_version_id: Some(visual_version_id.clone()), current_published_version_id: None,
                        created_at: now.clone(), updated_at: now.clone(),
                    };
                    VisualRepository.create(transaction, &visual)?;
                    let version = VisualVersionRecord {
                        id: visual_version_id.clone(), visual_id: visual_id.clone(), version_number: 1,
                        template_version_id,
                        values: snapshot_values(
                            &json!({ "location": visual.location, "flow": visual.flow }),
                            &visual_fields_from_record(&visual),
                        ).map_err(|message| invalid_data(&message))?,
                        notes: Some("Synthetic sample".to_owned()), special_validation: special_pending(family),
                        created_by: Some("synthetic-sample".to_owned()), created_at: now.clone(), published_at: None,
                    };
                    VisualRepository.add_version(transaction, &version, &audit_event(
                        &format!("sample-audit-visual-version-{index}"), "visual_version", &visual_version_id,
                        Some(&visual_version_id), "synthetic_sample_created", &now, Some("synthetic-sample".to_owned()),
                    ))?;
                    VisualRepository.set_current_draft_version(transaction, &visual_id, &visual_version_id, &audit_event(
                        &format!("sample-audit-visual-{index}"), "visual", &visual_id, Some(&visual_version_id),
                        "synthetic_sample_selected", &now, Some("synthetic-sample".to_owned()),
                    ))?;
                }
                Ok(())
            })
            .map_err(as_message)
    }

    pub fn detail(&self, visual_id: &str) -> AppResult<VisualDetail> {
        let connection = self.database.connect().map_err(as_message)?;
        detail_from(&connection, visual_id)
    }

    pub fn create(&self, request: CreateVisualRequest) -> AppResult<VisualDetail> {
        validate_fields(&request.visual)?;
        validate_scalar_object(&request.values)?;
        validate_projection_matches(&request.values, &request.visual)?;
        let now = utc_now(self.database).map_err(as_message)?;
        let visual_id = Uuid::new_v4().to_string();
        let version_id = Uuid::new_v4().to_string();
        self.database
            .transaction(|transaction| {
                let template = TemplateRepository
                    .get(transaction, &request.template_id)?
                    .ok_or_else(|| invalid_data("Selected template does not exist."))?;
                if template.visual_type != request.visual.visual_type {
                    return Err(invalid_data(
                        "Visual type does not match its selected template.",
                    ));
                }
                let visual = VisualRecord {
                    id: visual_id.clone(),
                    name: request.visual.name.clone(),
                    visual_type: request.visual.visual_type.clone(),
                    template_id: request.template_id.clone(),
                    stock_class: request.visual.stock_class.clone(),
                    location: request.visual.location.clone(),
                    flow: request.visual.flow.clone(),
                    description: request.visual.description.clone(),
                    accent_color: request.visual.accent_color.clone(),
                    lifecycle_state: "Draft".to_owned(),
                    current_draft_version_id: Some(version_id.clone()),
                    current_published_version_id: None,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                };
                VisualRepository.create(transaction, &visual)?;
                let version = VisualVersionRecord {
                    id: version_id.clone(),
                    visual_id: visual_id.clone(),
                    version_number: 1,
                    template_version_id: request.template_version_id.clone(),
                    values: snapshot_values(&request.values, &request.visual)?,
                    notes: None,
                    special_validation: special_pending(&template.family),
                    created_by: request.actor.clone(),
                    created_at: now.clone(),
                    published_at: None,
                };
                VisualRepository.add_version(
                    transaction,
                    &version,
                    &audit_event(
                        &version.id,
                        "visual_version",
                        &version.id,
                        Some(&version.id),
                        "draft_created",
                        &now,
                        request.actor.clone(),
                    ),
                )?;
                VisualRepository.set_current_draft_version(
                    transaction,
                    &visual.id,
                    &version.id,
                    &audit_event(
                        &Uuid::new_v4().to_string(),
                        "visual",
                        &visual.id,
                        Some(&version.id),
                        "draft_selected",
                        &now,
                        request.actor.clone(),
                    ),
                )?;
                Ok(())
            })
            .map_err(as_message)?;
        self.detail(&visual_id)
    }

    pub fn save_draft(&self, request: SaveDraftRequest) -> AppResult<VisualDetail> {
        validate_fields(&request.visual)?;
        validate_scalar_object(&request.values)?;
        validate_projection_matches(&request.values, &request.visual)?;
        let now = utc_now(self.database).map_err(as_message)?;
        let new_version_id = Uuid::new_v4().to_string();
        self.database
            .transaction(|transaction| {
                let current = VisualRepository
                    .get(transaction, &request.visual_id)?
                    .ok_or_else(|| invalid_data("Visual does not exist."))?;
                let current_revision = current_revision(&current);
                if current_revision != Some(request.expected_revision_id.as_str()) {
                    return Err(invalid_data(
                        "Draft save is stale; reload the visual before saving.",
                    ));
                }
                if !matches!(current.lifecycle_state.as_str(), "Draft" | "Published") {
                    return Err(invalid_data(
                        "Only Draft or Published visuals can be edited.",
                    ));
                }
                let versions = VisualRepository.list_versions(transaction, &request.visual_id)?;
                let latest = versions
                    .last()
                    .ok_or_else(|| invalid_data("Visual has no version to edit."))?;
                let template = TemplateRepository
                    .get(transaction, &current.template_id)?
                    .ok_or_else(|| invalid_data("Visual template does not exist."))?;
                if template.visual_type != request.visual.visual_type {
                    return Err(invalid_data(
                        "Visual type does not match its selected template.",
                    ));
                }
                let version = VisualVersionRecord {
                    id: new_version_id.clone(),
                    visual_id: current.id.clone(),
                    version_number: latest.version_number + 1,
                    template_version_id: request.template_version_id.clone(),
                    values: snapshot_values(&request.values, &request.visual)?,
                    notes: request.notes.clone(),
                    special_validation: if template.family == "gang-special-2up" {
                        request
                            .special_validation
                            .clone()
                            .or_else(|| latest.special_validation.clone())
                            .or_else(|| Some(json!({ "state": "pending" })))
                    } else {
                        None
                    },
                    created_by: request.actor.clone(),
                    created_at: now.clone(),
                    published_at: None,
                };
                let mut save_event = audit_event(
                    &version.id,
                    "visual_version",
                    &version.id,
                    Some(&version.id),
                    "draft_saved",
                    &now,
                    request.actor.clone(),
                );
                save_event.details = json!({
                    "source": "local_application",
                    "action": "draft_saved",
                    "prior_version_id": latest.id,
                    "new_version_id": version.id,
                    "changed_fields": changed_projection_fields(
                        &visual_fields_from_record(&current),
                        &request.visual,
                    ),
                });
                VisualRepository.add_version(transaction, &version, &save_event)?;
                let mut projection = current.clone();
                projection.name = request.visual.name.clone();
                projection.visual_type = request.visual.visual_type.clone();
                projection.stock_class = request.visual.stock_class.clone();
                projection.location = request.visual.location.clone();
                projection.flow = request.visual.flow.clone();
                projection.description = request.visual.description.clone();
                projection.accent_color = request.visual.accent_color.clone();
                projection.updated_at = now.clone();
                VisualRepository.update_draft_projection(
                    transaction,
                    current_revision,
                    &projection,
                )?;
                VisualRepository.set_current_draft_version(
                    transaction,
                    &current.id,
                    &version.id,
                    &audit_event(
                        &Uuid::new_v4().to_string(),
                        "visual",
                        &current.id,
                        Some(&version.id),
                        "draft_selected",
                        &now,
                        request.actor.clone(),
                    ),
                )?;
                Ok(())
            })
            .map_err(as_message)?;
        self.detail(&request.visual_id)
    }

    pub fn duplicate(&self, visual_id: &str, actor: Option<String>) -> AppResult<VisualDetail> {
        let now = utc_now(self.database).map_err(as_message)?;
        let new_visual_id = Uuid::new_v4().to_string();
        let new_version_id = Uuid::new_v4().to_string();
        self.database
            .transaction(|transaction| {
                let source = VisualRepository
                    .get(transaction, visual_id)?
                    .ok_or_else(|| invalid_data("Visual does not exist."))?;
                let source_versions = VisualRepository.list_versions(transaction, visual_id)?;
                let source_version = source_versions
                    .iter()
                    .find(|version| {
                        Some(version.id.as_str()) == source.current_draft_version_id.as_deref()
                    })
                    .or_else(|| {
                        source_versions.iter().find(|version| {
                            Some(version.id.as_str())
                                == source.current_published_version_id.as_deref()
                        })
                    })
                    .ok_or_else(|| invalid_data("Visual has no current version to duplicate."))?;
                let template = TemplateRepository
                    .get(transaction, &source.template_id)?
                    .ok_or_else(|| invalid_data("Visual template does not exist."))?;
                let copied = VisualRecord {
                    id: new_visual_id.clone(),
                    name: format!("{} copy", source.name),
                    lifecycle_state: "Draft".to_owned(),
                    current_draft_version_id: Some(new_version_id.clone()),
                    current_published_version_id: None,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    ..source.clone()
                };
                let source_fields = visual_fields_from_record(&source);
                validate_projection_matches(&source_version.values, &source_fields)
                    .map_err(|message| invalid_data(&message))?;
                let copied_values =
                    snapshot_values(&source_version.values, &visual_fields_from_record(&copied))
                        .map_err(|message| invalid_data(&message))?;
                VisualRepository.create(transaction, &copied)?;
                let version = VisualVersionRecord {
                    id: new_version_id.clone(),
                    visual_id: copied.id.clone(),
                    version_number: 1,
                    template_version_id: source_version.template_version_id.clone(),
                    values: copied_values,
                    notes: source_version.notes.clone(),
                    special_validation: special_pending(&template.family)
                        .or_else(|| source_version.special_validation.clone()),
                    created_by: actor.clone(),
                    created_at: now.clone(),
                    published_at: None,
                };
                VisualRepository.add_version(
                    transaction,
                    &version,
                    &audit_event(
                        &version.id,
                        "visual_version",
                        &version.id,
                        Some(&version.id),
                        "duplicate_created",
                        &now,
                        actor.clone(),
                    ),
                )?;
                for reference in VisualRepository.list_source_references(transaction, visual_id)? {
                    VisualRepository.add_source_reference(
                        transaction,
                        &LegacySourceReferenceRecord {
                            id: Uuid::new_v4().to_string(),
                            visual_id: copied.id.clone(),
                            migration_batch: format!(
                                "duplicate:{}:{}",
                                copied.id, reference.migration_batch
                            ),
                            ..reference
                        },
                    )?;
                }
                VisualRepository.set_current_draft_version(
                    transaction,
                    &copied.id,
                    &version.id,
                    &audit_event(
                        &Uuid::new_v4().to_string(),
                        "visual",
                        &copied.id,
                        Some(&version.id),
                        "draft_selected",
                        &now,
                        actor.clone(),
                    ),
                )?;
                Ok(())
            })
            .map_err(as_message)?;
        self.detail(&new_visual_id)
    }

    pub fn transition(&self, request: TransitionRequest) -> AppResult<VisualDetail> {
        if !lifecycle_transition_allowed(&request.expected_state, request.action) {
            return Err("Lifecycle action is not allowed from the expected state.".to_owned());
        }
        let now = utc_now(self.database).map_err(as_message)?;
        self.database
            .transaction(|transaction| {
                let visual = VisualRepository
                    .get(transaction, &request.visual_id)?
                    .ok_or_else(|| invalid_data("Visual does not exist."))?;
                let current_revision = current_revision(&visual);
                if visual.lifecycle_state != request.expected_state
                    || current_revision != Some(request.expected_revision_id.as_str())
                {
                    return Err(invalid_data(
                        "Lifecycle action is stale; reload the visual before continuing.",
                    ));
                }
                let versions = VisualRepository.list_versions(transaction, &visual.id)?;
                let current_version = versions
                    .iter()
                    .find(|version| Some(version.id.as_str()) == current_revision)
                    .ok_or_else(|| invalid_data("Current visual version is unavailable."))?;
                match request.action {
                    LifecycleAction::SubmitForReview => {
                        VisualRepository.transition_state(
                            transaction,
                            &visual.id,
                            "Draft",
                            "Review",
                            &audit_event(
                                &Uuid::new_v4().to_string(),
                                "visual",
                                &visual.id,
                                Some(&current_version.id),
                                "submitted_for_review",
                                &now,
                                request.actor.clone(),
                            ),
                        )?;
                    }
                    LifecycleAction::ReturnToDraft => {
                        VisualRepository.transition_state(
                            transaction,
                            &visual.id,
                            "Review",
                            "Draft",
                            &audit_event(
                                &Uuid::new_v4().to_string(),
                                "visual",
                                &visual.id,
                                Some(&current_version.id),
                                "returned_to_draft",
                                &now,
                                request.actor.clone(),
                            ),
                        )?;
                    }
                    LifecycleAction::Retire => {
                        VisualRepository.transition_state(
                            transaction,
                            &visual.id,
                            "Published",
                            "Retired",
                            &audit_event(
                                &Uuid::new_v4().to_string(),
                                "visual",
                                &visual.id,
                                Some(&current_version.id),
                                "retired",
                                &now,
                                request.actor.clone(),
                            ),
                        )?;
                    }
                    LifecycleAction::Publish | LifecycleAction::Reactivate => {
                        let publish = request.action == LifecycleAction::Publish;
                        if (publish && visual.lifecycle_state != "Review")
                            || (!publish && visual.lifecycle_state != "Retired")
                        {
                            return Err(invalid_data(
                                "Visual is in the wrong lifecycle state for this action.",
                            ));
                        }
                        let projected_fields = visual_fields_from_record(&visual);
                        validate_projection_matches(&current_version.values, &projected_fields)
                            .map_err(|message| invalid_data(&message))?;
                        let normalized_values =
                            snapshot_values(&current_version.values, &projected_fields)
                                .map_err(|message| invalid_data(&message))?;
                        let version_id = Uuid::new_v4().to_string();
                        let new_version = VisualVersionRecord {
                            id: version_id.clone(),
                            visual_id: visual.id.clone(),
                            version_number: versions
                                .last()
                                .map_or(1, |version| version.version_number + 1),
                            template_version_id: current_version.template_version_id.clone(),
                            values: normalized_values,
                            notes: current_version.notes.clone(),
                            special_validation: current_version.special_validation.clone(),
                            created_by: request.actor.clone(),
                            created_at: now.clone(),
                            published_at: if publish { Some(now.clone()) } else { None },
                        };
                        VisualRepository.add_version(
                            transaction,
                            &new_version,
                            &audit_event(
                                &version_id,
                                "visual_version",
                                &version_id,
                                Some(&version_id),
                                if publish {
                                    "published_version_created"
                                } else {
                                    "reactivation_version_created"
                                },
                                &now,
                                request.actor.clone(),
                            ),
                        )?;
                        if publish {
                            VisualRepository.set_current_published_version(
                                transaction,
                                &visual.id,
                                &version_id,
                                &audit_event(
                                    &Uuid::new_v4().to_string(),
                                    "visual",
                                    &visual.id,
                                    Some(&version_id),
                                    "published_version_selected",
                                    &now,
                                    request.actor.clone(),
                                ),
                            )?;
                        } else {
                            VisualRepository.set_current_draft_version(
                                transaction,
                                &visual.id,
                                &version_id,
                                &audit_event(
                                    &Uuid::new_v4().to_string(),
                                    "visual",
                                    &visual.id,
                                    Some(&version_id),
                                    "reactivated_as_draft",
                                    &now,
                                    request.actor.clone(),
                                ),
                            )?;
                        }
                    }
                }
                Ok(())
            })
            .map_err(as_message)?;
        self.detail(&request.visual_id)
    }
}

impl CatalogPort for CatalogGateway<'_> {
    fn list(&self, query: &CatalogListQuery) -> AppResult<CatalogPage> {
        self.list_impl(query)
    }

    fn templates(&self, query: &TemplateListQuery) -> AppResult<Vec<TemplateChoice>> {
        self.templates_impl(query)
    }

    fn initialize_synthetic_samples(&self) -> AppResult<()> {
        CatalogGateway::initialize_synthetic_samples(self)
    }

    fn detail(&self, visual_id: &str) -> AppResult<VisualDetail> {
        CatalogGateway::detail(self, visual_id)
    }

    fn create(&self, request: CreateVisualRequest) -> AppResult<VisualDetail> {
        CatalogGateway::create(self, request)
    }

    fn duplicate(&self, visual_id: &str, actor: Option<String>) -> AppResult<VisualDetail> {
        CatalogGateway::duplicate(self, visual_id, actor)
    }

    fn save_draft(&self, request: SaveDraftRequest) -> AppResult<VisualDetail> {
        CatalogGateway::save_draft(self, request)
    }

    fn transition(&self, request: TransitionRequest) -> AppResult<VisualDetail> {
        CatalogGateway::transition(self, request)
    }
}

fn detail_from(connection: &Connection, visual_id: &str) -> AppResult<VisualDetail> {
    let visual = VisualRepository
        .get(connection, visual_id)
        .map_err(as_message)?
        .ok_or_else(|| "Visual does not exist.".to_owned())?;
    let template = TemplateRepository
        .get(connection, &visual.template_id)
        .map_err(as_message)?
        .ok_or_else(|| "Visual template does not exist.".to_owned())?;
    let history = VisualRepository
        .list_versions(connection, visual_id)
        .map_err(as_message)?;
    let current_id = current_revision(&visual);
    let current_version = history
        .iter()
        .find(|version| Some(version.id.as_str()) == current_id)
        .cloned();
    let source_references = VisualRepository
        .list_source_references(connection, visual_id)
        .map_err(as_message)?;
    Ok(VisualDetail {
        visual: visual_to_data(visual),
        template_family: template.family,
        current_version: current_version.map(version_to_data),
        history: history.into_iter().map(version_to_data).collect(),
        source_references: source_references
            .into_iter()
            .map(source_reference_to_data)
            .collect(),
    })
}

fn visual_to_data(row: VisualRecord) -> VisualData {
    VisualData {
        id: row.id,
        name: row.name,
        visual_type: row.visual_type,
        template_id: row.template_id,
        stock_class: row.stock_class,
        location: row.location,
        flow: row.flow,
        description: row.description,
        accent_color: row.accent_color,
        lifecycle_state: row.lifecycle_state,
        current_draft_version_id: row.current_draft_version_id,
        current_published_version_id: row.current_published_version_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
    }
}

fn version_to_data(row: VisualVersionRecord) -> VisualVersionData {
    VisualVersionData {
        id: row.id,
        visual_id: row.visual_id,
        version_number: row.version_number,
        template_version_id: row.template_version_id,
        values: row.values,
        notes: row.notes,
        special_validation: row.special_validation,
        created_by: row.created_by,
        created_at: row.created_at,
        published_at: row.published_at,
    }
}

fn source_reference_to_data(row: LegacySourceReferenceRecord) -> LegacySourceReferenceData {
    LegacySourceReferenceData {
        id: row.id,
        visual_id: row.visual_id,
        source_id: row.source_id,
        source_name: row.source_name,
        sheet_or_slide: row.sheet_or_slide,
        side: row.side,
        raw_source_text: row.raw_source_text,
        migration_batch: row.migration_batch,
        validation_state: row.validation_state,
    }
}

fn template_to_data(row: TemplateRecord) -> TemplateData {
    TemplateData {
        id: row.id,
        family: row.family,
        name: row.name,
        visual_type: row.visual_type,
        lifecycle_state: row.lifecycle_state,
        active_published_version_id: row.active_published_version_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        provenance: row.provenance,
    }
}

fn current_revision(visual: &VisualRecord) -> Option<&str> {
    if matches!(visual.lifecycle_state.as_str(), "Published" | "Retired") {
        visual
            .current_published_version_id
            .as_deref()
            .or(visual.current_draft_version_id.as_deref())
    } else {
        visual
            .current_draft_version_id
            .as_deref()
            .or(visual.current_published_version_id.as_deref())
    }
}

fn validate_fields(fields: &VisualFields) -> AppResult<()> {
    if fields.name.trim().is_empty() || fields.visual_type.trim().is_empty() {
        return Err("Visual name and type are required.".to_owned());
    }
    if fields
        .accent_color
        .as_deref()
        .is_some_and(|value| !valid_color(value))
    {
        return Err("Visual accent color must be a hex color token.".to_owned());
    }
    Ok(())
}

fn validate_scalar_object(value: &Value) -> AppResult<()> {
    if !value.is_object()
        || !value.as_object().is_some_and(|object| {
            object.values().all(|item| {
                item.is_null() || item.is_string() || item.is_number() || item.is_boolean()
            })
        })
    {
        return Err("Visual values must be a flat object of scalar fields.".to_owned());
    }
    Ok(())
}

fn validate_projection_matches(values: &Value, visual: &VisualFields) -> AppResult<()> {
    let fields = [
        ("name", Some(visual.name.as_str())),
        ("visual_type", Some(visual.visual_type.as_str())),
        ("stock_class", visual.stock_class.as_deref()),
        ("location", visual.location.as_deref()),
        ("flow", visual.flow.as_deref()),
        ("description", visual.description.as_deref()),
        ("accent_color", visual.accent_color.as_deref()),
    ];
    for (key, projected) in fields {
        if let Some(value) = values.get(key) {
            let matches = match value {
                Value::String(content) => projected == Some(content.as_str()),
                Value::Null => projected.is_none(),
                // Legacy versions may omit canonical keys, but a present key
                // must use the string/null representation of the projection.
                _ => false,
            };
            if !matches {
                return Err(format!(
                    "Visual projection field '{key}' does not match its version content."
                ));
            }
        }
    }
    Ok(())
}

fn visual_fields_from_record(visual: &VisualRecord) -> VisualFields {
    VisualFields {
        name: visual.name.clone(),
        visual_type: visual.visual_type.clone(),
        stock_class: visual.stock_class.clone(),
        location: visual.location.clone(),
        flow: visual.flow.clone(),
        description: visual.description.clone(),
        accent_color: visual.accent_color.clone(),
    }
}

fn changed_projection_fields(previous: &VisualFields, next: &VisualFields) -> Vec<&'static str> {
    [
        ("name", previous.name != next.name),
        ("visual_type", previous.visual_type != next.visual_type),
        ("stock_class", previous.stock_class != next.stock_class),
        ("location", previous.location != next.location),
        ("flow", previous.flow != next.flow),
        ("description", previous.description != next.description),
        ("accent_color", previous.accent_color != next.accent_color),
    ]
    .into_iter()
    .filter_map(|(name, changed)| changed.then_some(name))
    .collect()
}

fn snapshot_values(values: &Value, visual: &VisualFields) -> AppResult<Value> {
    let mut snapshot = values
        .as_object()
        .cloned()
        .ok_or_else(|| "Visual values must be a flat object of scalar fields.".to_owned())?;
    for (key, value) in [
        ("name", Some(visual.name.as_str())),
        ("visual_type", Some(visual.visual_type.as_str())),
        ("stock_class", visual.stock_class.as_deref()),
        ("location", visual.location.as_deref()),
        ("flow", visual.flow.as_deref()),
        ("description", visual.description.as_deref()),
        ("accent_color", visual.accent_color.as_deref()),
    ] {
        snapshot.insert(
            key.to_owned(),
            value.map_or(Value::Null, |value| Value::String(value.to_owned())),
        );
    }
    Ok(Value::Object(snapshot))
}

fn valid_color(value: &str) -> bool {
    let Some(digits) = value.strip_prefix('#') else {
        return false;
    };
    matches!(digits.len(), 3 | 4 | 6 | 8)
        && digits
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

fn special_pending(family: &str) -> Option<Value> {
    (family == "gang-special-2up").then(|| json!({ "state": "pending" }))
}

fn audit_event(
    id: &str,
    entity_kind: &str,
    entity_id: &str,
    version_id: Option<&str>,
    action: &str,
    occurred_at: &str,
    actor: Option<String>,
) -> AuditEventRecord {
    AuditEventRecord {
        id: id.to_owned(),
        entity_kind: entity_kind.to_owned(),
        entity_id: entity_id.to_owned(),
        version_id: version_id.map(str::to_owned),
        action: action.to_owned(),
        occurred_at: occurred_at.to_owned(),
        actor,
        details: json!({ "source": "local_application", "action": action }),
    }
}

fn utc_now(database: &SqliteDatabase) -> StorageResult<String> {
    let connection = database.connect()?;
    Ok(
        connection.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')", [], |row| {
            row.get(0)
        })?,
    )
}

fn as_message(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn invalid_data(message: &str) -> Box<dyn std::error::Error + Send + Sync> {
    Box::new(std::io::Error::new(
        std::io::ErrorKind::InvalidData,
        message.to_owned(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::{TemplateRecord, TemplateVersionRecord};
    use serde_json::json;
    use tempfile::TempDir;

    fn seed_template(database: &SqliteDatabase, family: &str, visual_type: &str, published: bool) {
        let connection = database.connect().expect("connection opens");
        let template = TemplateRecord {
            id: format!("template-{family}"),
            family: family.to_owned(),
            name: format!("Synthetic {family}"),
            visual_type: visual_type.to_owned(),
            lifecycle_state: if published { "Published" } else { "Draft" }.to_owned(),
            active_published_version_id: None,
            created_at: "2026-10-13T00:00:00.000Z".to_owned(),
            updated_at: "2026-10-13T00:00:00.000Z".to_owned(),
            provenance: None,
        };
        TemplateRepository
            .create(&connection, &template)
            .expect("template inserts");
        let version = TemplateVersionRecord {
            id: format!("template-version-{family}"),
            template_id: template.id.clone(),
            version_number: 1,
            document: json!({
                "schema_version": 1,
                "page": { "width_mm": 210, "height_mm": 297, "orientation": "portrait" },
                "print_rules": { "copies_per_page": 1, "margins_mm": { "top": 5, "right": 5, "bottom": 5, "left": 5 }, "gap_mm": 0,
                    "slots": { "rows": 1, "columns": 1 } },
                "repetition": { "kind": "none" }, "defaults": {}, "elements": []
            }),
            created_by: Some("synthetic-test".to_owned()),
            created_at: "2026-10-13T00:00:00.000Z".to_owned(),
            published_at: published.then(|| "2026-10-13T00:00:00.000Z".to_owned()),
        };
        database
            .transaction(|transaction| {
                TemplateRepository.add_version(
                    transaction,
                    &version,
                    &AuditEventRecord {
                        id: format!("audit-{}", version.id),
                        entity_kind: "template_version".to_owned(),
                        entity_id: version.id.clone(),
                        version_id: Some(version.id.clone()),
                        action: "template_version_created".to_owned(),
                        occurred_at: version.created_at.clone(),
                        actor: Some("synthetic-test".to_owned()),
                        details: json!({}),
                    },
                )?;
                if published {
                    TemplateRepository.set_active_published_version(
                        transaction,
                        &template.id,
                        &version.id,
                        &AuditEventRecord {
                            id: format!("audit-publish-{}", template.id),
                            entity_kind: "template".to_owned(),
                            entity_id: template.id.clone(),
                            version_id: Some(version.id.clone()),
                            action: "template_published".to_owned(),
                            occurred_at: version.created_at.clone(),
                            actor: Some("synthetic-test".to_owned()),
                            details: json!({}),
                        },
                    )?;
                }
                Ok(())
            })
            .expect("template version seed commits");
    }

    fn request(family: &str, visual_type: &str) -> CreateVisualRequest {
        CreateVisualRequest {
            template_id: format!("template-{family}"),
            template_version_id: format!("template-version-{family}"),
            visual: VisualFields {
                name: "Synthetic aisle marker".to_owned(),
                visual_type: visual_type.to_owned(),
                stock_class: Some("synthetic-stock".to_owned()),
                location: Some("A-01".to_owned()),
                flow: Some("SYN-FLOW-01".to_owned()),
                description: Some("Synthetic fixture".to_owned()),
                accent_color: Some("#123456".to_owned()),
            },
            values: json!({ "location": "A-01", "flow": "SYN-FLOW-01" }),
            actor: Some("synthetic-test".to_owned()),
        }
    }

    fn gateway() -> (TempDir, SqliteDatabase) {
        let directory = TempDir::new().expect("temporary data directory");
        let database =
            SqliteDatabase::open(directory.path().join("wvm.sqlite")).expect("database opens");
        (directory, database)
    }

    fn assert_complete_snapshot(values: &Value, visual: &VisualData) {
        for (key, value) in [
            ("name", Some(visual.name.as_str())),
            ("visual_type", Some(visual.visual_type.as_str())),
            ("stock_class", visual.stock_class.as_deref()),
            ("location", visual.location.as_deref()),
            ("flow", visual.flow.as_deref()),
            ("description", visual.description.as_deref()),
            ("accent_color", visual.accent_color.as_deref()),
        ] {
            assert_eq!(
                values.get(key),
                Some(&value.map_or(Value::Null, |value| Value::String(value.to_owned()))),
                "snapshot {key}"
            );
        }
    }

    fn seed_visual_with_version(
        database: &SqliteDatabase,
        values: Value,
        published: bool,
    ) -> VisualRecord {
        let now = "2026-10-13T00:00:00.000Z".to_owned();
        let visual = VisualRecord {
            id: "legacy-visual".to_owned(),
            name: "Legacy visual".to_owned(),
            visual_type: "gang".to_owned(),
            template_id: "template-gang-standard-2up".to_owned(),
            stock_class: Some("synthetic-stock".to_owned()),
            location: Some("A-01".to_owned()),
            flow: Some("SYN-FLOW-01".to_owned()),
            description: Some("Synthetic fixture".to_owned()),
            accent_color: Some("#123456".to_owned()),
            lifecycle_state: "Draft".to_owned(),
            current_draft_version_id: None,
            current_published_version_id: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let version = VisualVersionRecord {
            id: "legacy-version-1".to_owned(),
            visual_id: visual.id.clone(),
            version_number: 1,
            template_version_id: "template-version-gang-standard-2up".to_owned(),
            values,
            notes: None,
            special_validation: None,
            created_by: Some("synthetic-test".to_owned()),
            created_at: now.clone(),
            published_at: published.then_some(now.clone()),
        };
        database
            .transaction(|transaction| {
                VisualRepository.create(transaction, &visual)?;
                VisualRepository.add_version(
                    transaction,
                    &version,
                    &audit_event(
                        "legacy-version-audit",
                        "visual_version",
                        &version.id,
                        Some(&version.id),
                        "legacy_seed",
                        &now,
                        None,
                    ),
                )?;
                let event = audit_event(
                    "legacy-pointer-audit",
                    "visual",
                    &visual.id,
                    Some(&version.id),
                    "legacy_seed_selected",
                    &now,
                    None,
                );
                if published {
                    VisualRepository.set_current_published_version(
                        transaction,
                        &visual.id,
                        &version.id,
                        &event,
                    )?;
                } else {
                    VisualRepository.set_current_draft_version(
                        transaction,
                        &visual.id,
                        &version.id,
                        &event,
                    )?;
                }
                Ok(())
            })
            .expect("legacy fixture commits");
        visual
    }

    #[test]
    fn synthetic_sample_catalog_requires_explicit_empty_catalog_and_creates_five_families_atomically(
    ) {
        let (_directory, database) = gateway();
        let gateway = CatalogGateway::new(&database);
        gateway
            .initialize_synthetic_samples()
            .expect("explicit initialization succeeds");
        let choices = gateway
            .templates(&TemplateListQuery::default())
            .expect("template choices load");
        assert_eq!(choices.len(), 5);
        let page = gateway
            .list(&CatalogListQuery::default())
            .expect("sample visuals load");
        assert_eq!(page.total, 5);
        for summary in page.items {
            let detail = gateway
                .detail(&summary.visual.id)
                .expect("sample detail loads");
            assert_complete_snapshot(
                &detail
                    .current_version
                    .as_ref()
                    .expect("sample version")
                    .values,
                &detail.visual,
            );
        }
        assert!(choices.iter().all(|choice| choice
            .template
            .provenance
            .as_deref()
            .unwrap_or("")
            .contains("Synthetic sample")));
        assert!(gateway
            .initialize_synthetic_samples()
            .unwrap_err()
            .contains("empty template catalog"));
        assert_eq!(
            gateway
                .templates(&TemplateListQuery::default())
                .expect("samples remain")
                .len(),
            5
        );
    }

    #[test]
    fn create_duplicate_and_save_use_new_draft_identities_and_persist_revisions() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-standard-2up", "gang", false);
        let gateway = CatalogGateway::new(&database);
        let created = gateway
            .create(request("gang-standard-2up", "gang"))
            .expect("visual creates");
        let initial_revision = created
            .current_version
            .as_ref()
            .expect("initial revision")
            .id
            .clone();
        let initial_values = &created.current_version.as_ref().unwrap().values;
        assert_eq!(
            initial_values["name"].as_str(),
            Some(created.visual.name.as_str())
        );
        assert_eq!(
            initial_values["location"].as_str(),
            created.visual.location.as_deref()
        );
        let saved = gateway
            .save_draft(SaveDraftRequest {
                visual_id: created.visual.id.clone(),
                expected_revision_id: initial_revision.clone(),
                template_version_id: "template-version-gang-standard-2up".to_owned(),
                visual: VisualFields {
                    location: Some("B-02".to_owned()),
                    ..request("gang-standard-2up", "gang").visual
                },
                values: json!({ "location": "B-02", "flow": "SYN-FLOW-01" }),
                notes: None,
                special_validation: None,
                actor: Some("synthetic-test".to_owned()),
            })
            .expect("draft saves");
        assert_eq!(saved.history.len(), 2);
        assert_eq!(saved.visual.location.as_deref(), Some("B-02"));
        assert_eq!(
            saved.current_version.as_ref().unwrap().values["name"].as_str(),
            Some(saved.visual.name.as_str())
        );
        assert_ne!(
            saved.current_version.as_ref().expect("new revision").id,
            initial_revision
        );
        let connection = database.connect().expect("audit connection opens");
        let audit_details: String = connection.query_row(
            "SELECT details_json FROM audit_events WHERE action = 'draft_saved' AND entity_id = ?1",
            [&saved.current_version.as_ref().unwrap().id],
            |row| row.get(0),
        ).expect("draft save audit exists");
        let audit_details: Value = serde_json::from_str(&audit_details).expect("audit JSON parses");
        assert_eq!(audit_details["prior_version_id"], json!(initial_revision));
        assert_eq!(
            audit_details["new_version_id"],
            json!(saved.current_version.as_ref().unwrap().id)
        );
        assert_eq!(audit_details["changed_fields"], json!(["location"]));

        let duplicated = gateway
            .duplicate(&created.visual.id, Some("synthetic-test".to_owned()))
            .expect("visual duplicates");
        assert_ne!(duplicated.visual.id, created.visual.id);
        assert_eq!(duplicated.visual.lifecycle_state, "Draft");
        let duplicate_version = duplicated
            .current_version
            .as_ref()
            .expect("copied revision");
        assert_complete_snapshot(&duplicate_version.values, &duplicated.visual);
        assert_eq!(
            duplicate_version.values["name"],
            json!(duplicated.visual.name)
        );
        assert_eq!(
            duplicate_version.values["location"],
            saved.current_version.unwrap().values["location"]
        );
    }

    #[test]
    fn stale_saves_and_foreign_template_versions_are_rejected_without_partial_writes() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-standard-2up", "gang", false);
        seed_template(&database, "stand-standard-3up", "stand", false);
        let gateway = CatalogGateway::new(&database);
        let created = gateway
            .create(request("gang-standard-2up", "gang"))
            .expect("visual creates");
        let current = created
            .current_version
            .as_ref()
            .expect("current version")
            .id
            .clone();
        let foreign = gateway.save_draft(SaveDraftRequest {
            visual_id: created.visual.id.clone(),
            expected_revision_id: current.clone(),
            template_version_id: "template-version-stand-standard-3up".to_owned(),
            visual: request("gang-standard-2up", "gang").visual,
            values: json!({ "location": "A-01" }),
            notes: None,
            special_validation: None,
            actor: None,
        });
        assert!(foreign.is_err());
        assert_eq!(
            gateway
                .detail(&created.visual.id)
                .expect("detail survives")
                .history
                .len(),
            1
        );

        gateway
            .save_draft(SaveDraftRequest {
                visual_id: created.visual.id.clone(),
                expected_revision_id: current.clone(),
                template_version_id: "template-version-gang-standard-2up".to_owned(),
                visual: VisualFields {
                    location: Some("B-01".to_owned()),
                    ..request("gang-standard-2up", "gang").visual
                },
                values: json!({ "location": "B-01" }),
                notes: None,
                special_validation: None,
                actor: None,
            })
            .expect("first draft save succeeds");
        let stale = gateway.save_draft(SaveDraftRequest {
            visual_id: created.visual.id.clone(),
            expected_revision_id: current,
            template_version_id: "template-version-gang-standard-2up".to_owned(),
            visual: VisualFields {
                location: Some("C-01".to_owned()),
                ..request("gang-standard-2up", "gang").visual
            },
            values: json!({ "location": "C-01" }),
            notes: None,
            special_validation: None,
            actor: None,
        });
        assert!(stale.unwrap_err().contains("stale"));
        assert_eq!(
            gateway
                .detail(&created.visual.id)
                .expect("detail survives")
                .history
                .len(),
            2
        );
    }

    #[test]
    fn create_and_save_reject_conflicting_projection_values_without_partial_writes() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-standard-2up", "gang", true);
        let gateway = CatalogGateway::new(&database);
        let mut conflicting_create = request("gang-standard-2up", "gang");
        conflicting_create.values["location"] = json!("OTHER-LOCATION");
        assert!(gateway
            .create(conflicting_create)
            .unwrap_err()
            .contains("location"));
        assert_eq!(gateway.list(&CatalogListQuery::default()).unwrap().total, 0);

        let created = gateway
            .create(request("gang-standard-2up", "gang"))
            .expect("valid visual creates");
        let initial_revision = created.current_version.as_ref().unwrap().id.clone();
        let mut conflicting_save_values =
            json!({ "location": "OTHER-LOCATION", "flow": "SYN-FLOW-01" });
        conflicting_save_values["name"] = json!("Different name");
        let saved = gateway.save_draft(SaveDraftRequest {
            visual_id: created.visual.id.clone(),
            expected_revision_id: initial_revision.clone(),
            template_version_id: "template-version-gang-standard-2up".to_owned(),
            visual: request("gang-standard-2up", "gang").visual,
            values: conflicting_save_values,
            notes: None,
            special_validation: None,
            actor: None,
        });
        assert!(saved.unwrap_err().contains("name"));
        let unchanged = gateway
            .detail(&created.visual.id)
            .expect("original remains");
        assert_eq!(unchanged.history.len(), 1);
        assert_eq!(
            unchanged.visual.current_draft_version_id.as_deref(),
            Some(initial_revision.as_str())
        );
        let connection = database.connect().expect("connection opens");
        let audit_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE entity_id = ?1",
                [&created.visual.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(audit_count, 1);
    }

    #[test]
    fn publish_normalizes_missing_legacy_snapshot_fields_without_rewriting_history() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-standard-2up", "gang", true);
        let old_values = json!({ "location": "A-01" });
        let visual = seed_visual_with_version(&database, old_values.clone(), false);
        let gateway = CatalogGateway::new(&database);
        let review = gateway
            .transition(TransitionRequest {
                visual_id: visual.id.clone(),
                expected_state: "Draft".to_owned(),
                expected_revision_id: "legacy-version-1".to_owned(),
                action: LifecycleAction::SubmitForReview,
                actor: None,
            })
            .expect("legacy version enters review");
        let published = gateway
            .transition(TransitionRequest {
                visual_id: visual.id.clone(),
                expected_state: "Review".to_owned(),
                expected_revision_id: review.current_version.as_ref().unwrap().id.clone(),
                action: LifecycleAction::Publish,
                actor: None,
            })
            .expect("missing canonical fields are filled for the new published version");

        assert_eq!(published.history[0].values, old_values);
        assert_complete_snapshot(
            &published.current_version.as_ref().unwrap().values,
            &published.visual,
        );
        assert_eq!(published.history.len(), 2);
    }

    #[test]
    fn contradictory_legacy_snapshot_cannot_be_published_or_repaired_silently() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-standard-2up", "gang", true);
        let old_values = json!({ "location": "CONTRADICTORY-99" });
        let visual = seed_visual_with_version(&database, old_values.clone(), false);
        let catalog = CatalogGateway::new(&database);
        let review = catalog
            .transition(TransitionRequest {
                visual_id: visual.id.clone(),
                expected_state: "Draft".to_owned(),
                expected_revision_id: "legacy-version-1".to_owned(),
                action: LifecycleAction::SubmitForReview,
                actor: None,
            })
            .expect("legacy version enters review");
        let result = catalog.transition(TransitionRequest {
            visual_id: visual.id.clone(),
            expected_state: "Review".to_owned(),
            expected_revision_id: review.current_version.as_ref().unwrap().id.clone(),
            action: LifecycleAction::Publish,
            actor: None,
        });

        assert!(result.unwrap_err().contains("location"));
        let unchanged = catalog
            .detail(&visual.id)
            .expect("visual remains reviewable");
        assert_eq!(unchanged.visual.lifecycle_state, "Review");
        assert_eq!(unchanged.history.len(), 1);
        assert_eq!(unchanged.history[0].values, old_values);
    }

    #[test]
    fn non_string_legacy_projection_is_rejected_without_partial_publish_or_reactivation() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-standard-2up", "gang", true);
        let old_values = json!({ "location": 123 });
        let visual = seed_visual_with_version(&database, old_values.clone(), false);
        let catalog = CatalogGateway::new(&database);
        let review = catalog
            .transition(TransitionRequest {
                visual_id: visual.id.clone(),
                expected_state: "Draft".to_owned(),
                expected_revision_id: "legacy-version-1".to_owned(),
                action: LifecycleAction::SubmitForReview,
                actor: None,
            })
            .expect("legacy version enters review");
        let result = catalog.transition(TransitionRequest {
            visual_id: visual.id.clone(),
            expected_state: "Review".to_owned(),
            expected_revision_id: review.current_version.as_ref().unwrap().id.clone(),
            action: LifecycleAction::Publish,
            actor: None,
        });

        assert!(result.unwrap_err().contains("location"));
        let unchanged = catalog
            .detail(&visual.id)
            .expect("visual remains reviewable");
        assert_eq!(unchanged.visual.lifecycle_state, "Review");
        assert_eq!(unchanged.history.len(), 1);
        assert_eq!(unchanged.history[0].values, old_values);

        let (_directory, database) = gateway();
        seed_template(&database, "gang-standard-2up", "gang", true);
        let visual = seed_visual_with_version(&database, old_values.clone(), true);
        let gateway = CatalogGateway::new(&database);
        let retired = gateway
            .transition(TransitionRequest {
                visual_id: visual.id.clone(),
                expected_state: "Published".to_owned(),
                expected_revision_id: "legacy-version-1".to_owned(),
                action: LifecycleAction::Retire,
                actor: None,
            })
            .expect("legacy visual retires");
        let result = gateway.transition(TransitionRequest {
            visual_id: visual.id.clone(),
            expected_state: "Retired".to_owned(),
            expected_revision_id: retired.current_version.as_ref().unwrap().id.clone(),
            action: LifecycleAction::Reactivate,
            actor: None,
        });

        assert!(result.unwrap_err().contains("location"));
        let unchanged = gateway.detail(&visual.id).expect("visual remains retired");
        assert_eq!(unchanged.visual.lifecycle_state, "Retired");
        assert_eq!(unchanged.history.len(), 1);
        assert_eq!(unchanged.history[0].values, old_values);
    }

    #[test]
    fn reactivate_normalizes_a_new_version_and_preserves_the_retired_snapshot() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-standard-2up", "gang", true);
        let old_values = json!({ "location": "A-01" });
        let visual = seed_visual_with_version(&database, old_values.clone(), true);
        let gateway = CatalogGateway::new(&database);
        let retired = gateway
            .transition(TransitionRequest {
                visual_id: visual.id.clone(),
                expected_state: "Published".to_owned(),
                expected_revision_id: "legacy-version-1".to_owned(),
                action: LifecycleAction::Retire,
                actor: None,
            })
            .expect("visual retires");
        let active = gateway
            .transition(TransitionRequest {
                visual_id: visual.id.clone(),
                expected_state: "Retired".to_owned(),
                expected_revision_id: retired.current_version.as_ref().unwrap().id.clone(),
                action: LifecycleAction::Reactivate,
                actor: None,
            })
            .expect("reactivation adds a normalized draft snapshot");

        assert_eq!(active.history[0].values, old_values);
        assert_complete_snapshot(
            &active.current_version.as_ref().unwrap().values,
            &active.visual,
        );
        assert_eq!(active.visual.lifecycle_state, "Draft");
    }

    #[test]
    fn contradictory_legacy_snapshot_cannot_be_reactivated() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-standard-2up", "gang", true);
        let old_values = json!({ "location": "CONTRADICTORY-99" });
        let visual = seed_visual_with_version(&database, old_values.clone(), true);
        let gateway = CatalogGateway::new(&database);
        let retired = gateway
            .transition(TransitionRequest {
                visual_id: visual.id.clone(),
                expected_state: "Published".to_owned(),
                expected_revision_id: "legacy-version-1".to_owned(),
                action: LifecycleAction::Retire,
                actor: None,
            })
            .expect("legacy visual retires");
        let result = gateway.transition(TransitionRequest {
            visual_id: visual.id.clone(),
            expected_state: "Retired".to_owned(),
            expected_revision_id: retired.current_version.as_ref().unwrap().id.clone(),
            action: LifecycleAction::Reactivate,
            actor: None,
        });

        assert!(result.unwrap_err().contains("location"));
        let unchanged = gateway.detail(&visual.id).expect("visual remains retired");
        assert_eq!(unchanged.visual.lifecycle_state, "Retired");
        assert_eq!(unchanged.history.len(), 1);
        assert_eq!(unchanged.history[0].values, old_values);
    }

    #[test]
    fn rejected_special_publication_leaves_review_state_and_history_unchanged() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-special-2up", "gang", true);
        let gateway = CatalogGateway::new(&database);
        let created = gateway
            .create(request("gang-special-2up", "gang"))
            .expect("visual creates");
        let revision = created
            .current_version
            .as_ref()
            .expect("current revision")
            .id
            .clone();
        let review = gateway
            .transition(TransitionRequest {
                visual_id: created.visual.id.clone(),
                expected_state: "Draft".to_owned(),
                expected_revision_id: revision.clone(),
                action: LifecycleAction::SubmitForReview,
                actor: None,
            })
            .expect("visual enters review");
        let review_revision = review
            .current_version
            .as_ref()
            .expect("review revision")
            .id
            .clone();
        let before = review.history.len();
        let publish = gateway.transition(TransitionRequest {
            visual_id: created.visual.id.clone(),
            expected_state: "Review".to_owned(),
            expected_revision_id: review_revision,
            action: LifecycleAction::Publish,
            actor: None,
        });
        assert!(publish.unwrap_err().to_lowercase().contains("special"));
        let after = gateway
            .detail(&created.visual.id)
            .expect("review visual remains");
        assert_eq!(after.visual.lifecycle_state, "Review");
        assert_eq!(after.history.len(), before);
    }

    #[test]
    fn validated_special_visual_publishes_an_immutable_version_and_clears_the_draft_pointer() {
        let (_directory, database) = gateway();
        seed_template(&database, "gang-special-2up", "gang", true);
        let gateway = CatalogGateway::new(&database);
        let created = gateway
            .create(request("gang-special-2up", "gang"))
            .expect("visual creates");
        let first_revision = created
            .current_version
            .as_ref()
            .expect("current revision")
            .id
            .clone();
        let validated = gateway.save_draft(SaveDraftRequest {
            visual_id: created.visual.id.clone(), expected_revision_id: first_revision,
            template_version_id: "template-version-gang-special-2up".to_owned(),
            visual: request("gang-special-2up", "gang").visual,
            values: json!({ "location": "A-01", "flow": "SYN-FLOW-01" }), notes: None,
            special_validation: Some(json!({
                "state": "validated", "reviewer_id": "synthetic-reviewer",
                "reviewed_at": "2026-10-13T12:00:00.000Z", "evidence_ref": "synthetic-evidence-1"
            })), actor: Some("synthetic-reviewer".to_owned()),
        }).expect("validation recorded on draft");
        let validated_revision = validated
            .current_version
            .as_ref()
            .expect("validated revision")
            .id
            .clone();
        let review = gateway
            .transition(TransitionRequest {
                visual_id: created.visual.id.clone(),
                expected_state: "Draft".to_owned(),
                expected_revision_id: validated_revision.clone(),
                action: LifecycleAction::SubmitForReview,
                actor: Some("synthetic-reviewer".to_owned()),
            })
            .expect("visual enters review");
        let published = gateway
            .transition(TransitionRequest {
                visual_id: created.visual.id.clone(),
                expected_state: "Review".to_owned(),
                expected_revision_id: review.current_version.as_ref().unwrap().id.clone(),
                action: LifecycleAction::Publish,
                actor: Some("synthetic-reviewer".to_owned()),
            })
            .expect("validated visual publishes");

        assert_eq!(published.visual.lifecycle_state, "Published");
        assert!(published.visual.current_draft_version_id.is_none());
        assert_eq!(
            published.visual.current_published_version_id.as_deref(),
            Some(published.current_version.as_ref().unwrap().id.as_str())
        );
        assert!(published
            .current_version
            .as_ref()
            .unwrap()
            .published_at
            .is_some());
        assert_eq!(
            published
                .current_version
                .as_ref()
                .unwrap()
                .special_validation
                .as_ref()
                .unwrap()["state"],
            "validated"
        );
    }
}
