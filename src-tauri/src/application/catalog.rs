use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct VisualFields {
    pub name: String,
    pub visual_type: String,
    pub stock_class: Option<String>,
    pub location: Option<String>,
    pub flow: Option<String>,
    pub description: Option<String>,
    pub accent_color: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct CreateVisualRequest {
    pub template_id: String,
    pub template_version_id: String,
    pub visual: VisualFields,
    pub values: Value,
    pub actor: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct SaveDraftRequest {
    pub visual_id: String,
    pub expected_revision_id: String,
    pub template_version_id: String,
    pub visual: VisualFields,
    pub values: Value,
    pub notes: Option<String>,
    pub special_validation: Option<Value>,
    pub actor: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LifecycleAction {
    SubmitForReview,
    ReturnToDraft,
    Publish,
    Retire,
    Reactivate,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TransitionRequest {
    pub visual_id: String,
    pub expected_state: String,
    pub expected_revision_id: String,
    pub action: LifecycleAction,
    pub actor: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct CatalogListQuery {
    pub search: Option<String>,
    pub visual_type: Option<String>,
    pub lifecycle_state: Option<String>,
    pub template_family: Option<String>,
    pub stock_class: Option<String>,
    pub location: Option<String>,
    pub flow: Option<String>,
    pub description: Option<String>,
    pub legacy_source: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
    pub page: usize,
    pub page_size: usize,
}

impl Default for CatalogListQuery {
    fn default() -> Self {
        Self {
            search: None,
            visual_type: None,
            lifecycle_state: None,
            template_family: None,
            stock_class: None,
            location: None,
            flow: None,
            description: None,
            legacy_source: None,
            sort_by: None,
            sort_order: None,
            page: 1,
            page_size: 50,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
pub struct TemplateListQuery {
    pub search: Option<String>,
    pub family: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct VisualData {
    pub id: String,
    pub name: String,
    pub visual_type: String,
    pub template_id: String,
    pub stock_class: Option<String>,
    pub location: Option<String>,
    pub flow: Option<String>,
    pub description: Option<String>,
    pub accent_color: Option<String>,
    pub lifecycle_state: String,
    pub current_draft_version_id: Option<String>,
    pub current_published_version_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct VisualVersionData {
    pub id: String,
    pub visual_id: String,
    pub version_number: i64,
    pub template_version_id: String,
    pub values: Value,
    pub notes: Option<String>,
    pub special_validation: Option<Value>,
    pub created_by: Option<String>,
    pub created_at: String,
    pub published_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct LegacySourceReferenceData {
    pub id: String,
    pub visual_id: String,
    pub source_id: String,
    pub source_name: String,
    pub sheet_or_slide: Option<String>,
    pub side: Option<String>,
    pub raw_source_text: Option<String>,
    pub migration_batch: String,
    pub validation_state: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TemplateData {
    pub id: String,
    pub family: String,
    pub name: String,
    pub visual_type: String,
    pub lifecycle_state: String,
    pub active_published_version_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub provenance: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CatalogVisualSummary {
    pub visual: VisualData,
    pub template_family: String,
    pub legacy_search_text: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CatalogPage {
    pub items: Vec<CatalogVisualSummary>,
    pub page: usize,
    pub page_size: usize,
    pub total: usize,
    pub total_pages: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct VisualDetail {
    pub visual: VisualData,
    pub template_family: String,
    pub current_version: Option<VisualVersionData>,
    pub history: Vec<VisualVersionData>,
    pub source_references: Vec<LegacySourceReferenceData>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct TemplateChoice {
    pub template: TemplateData,
    pub selected_version_id: String,
    pub selected_version_number: i64,
}

/// Decides lifecycle eligibility without exposing storage state or row types.
pub fn lifecycle_transition_allowed(expected: &str, action: LifecycleAction) -> bool {
    matches!(
        (expected, action),
        ("Draft", LifecycleAction::SubmitForReview)
            | ("Review", LifecycleAction::ReturnToDraft)
            | ("Review", LifecycleAction::Publish)
            | ("Published", LifecycleAction::Retire)
            | ("Retired", LifecycleAction::Reactivate)
    )
}

pub trait CatalogPort {
    fn list(&self, query: &CatalogListQuery) -> Result<CatalogPage, String>;
    fn templates(&self, query: &TemplateListQuery) -> Result<Vec<TemplateChoice>, String>;
    fn initialize_synthetic_samples(&self) -> Result<(), String>;
    fn detail(&self, visual_id: &str) -> Result<VisualDetail, String>;
    fn create(&self, request: CreateVisualRequest) -> Result<VisualDetail, String>;
    fn duplicate(&self, visual_id: &str, actor: Option<String>) -> Result<VisualDetail, String>;
    fn save_draft(&self, request: SaveDraftRequest) -> Result<VisualDetail, String>;
    fn transition(&self, request: TransitionRequest) -> Result<VisualDetail, String>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn catalog_wire_shape_keeps_query_paging_and_detail_field_names_stable() {
        let query = CatalogListQuery::default();
        assert_eq!(
            serde_json::to_value(query).unwrap(),
            json!({
                "search": null, "visual_type": null, "lifecycle_state": null,
                "template_family": null, "stock_class": null, "location": null,
                "flow": null, "description": null, "legacy_source": null,
                "sort_by": null, "sort_order": null, "page": 1, "page_size": 50
            })
        );
        let detail = VisualDetail {
            visual: VisualData {
                id: "v1".into(),
                name: "Example".into(),
                visual_type: "gang".into(),
                template_id: "t1".into(),
                stock_class: None,
                location: None,
                flow: None,
                description: None,
                accent_color: None,
                lifecycle_state: "Draft".into(),
                current_draft_version_id: None,
                current_published_version_id: None,
                created_at: "now".into(),
                updated_at: "now".into(),
            },
            template_family: "gang-standard-2up".into(),
            current_version: None,
            history: vec![],
            source_references: vec![],
        };
        let wire = serde_json::to_value(detail).unwrap();
        assert!(wire.get("visual").is_some());
        assert!(wire.get("template_family").is_some());
        assert!(wire.get("current_version").is_some());
        assert!(wire.get("history").is_some());
        assert!(wire.get("source_references").is_some());
        assert_eq!(wire["visual"]["current_draft_version_id"], Value::Null);
    }

    #[test]
    fn lifecycle_policy_allows_only_documented_state_action_pairs() {
        assert!(lifecycle_transition_allowed(
            "Draft",
            LifecycleAction::SubmitForReview
        ));
        assert!(lifecycle_transition_allowed(
            "Review",
            LifecycleAction::Publish
        ));
        assert!(lifecycle_transition_allowed(
            "Retired",
            LifecycleAction::Reactivate
        ));
        assert!(!lifecycle_transition_allowed(
            "Draft",
            LifecycleAction::Publish
        ));
        assert!(!lifecycle_transition_allowed(
            "Published",
            LifecycleAction::ReturnToDraft
        ));
    }
}
