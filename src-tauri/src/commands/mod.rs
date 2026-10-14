use std::fs;
use std::path::Path;

use tauri::State;

use crate::adapters::local_asset_store::LocalAssetStore;
use crate::adapters::sqlite::AssetRecord;
use crate::adapters::sqlite::{CatalogGateway, SqliteDatabase, StorageResult};
use crate::application::catalog::{
    CatalogListQuery, CatalogPage, CatalogPort, CreateVisualRequest, SaveDraftRequest,
    TemplateChoice, TemplateListQuery, TransitionRequest, VisualDetail,
};
use base64::engine::general_purpose::STANDARD;
use base64::Engine;

pub struct AppState {
    database: SqliteDatabase,
    asset_store: LocalAssetStore,
}

impl AppState {
    /// Opens the catalog beneath Tauri's platform-local application data directory.
    pub fn open_at(local_app_data_dir: impl AsRef<Path>) -> StorageResult<Self> {
        fs::create_dir_all(local_app_data_dir.as_ref())?;
        let database = SqliteDatabase::open(local_app_data_dir.as_ref().join("wvm.sqlite"))?;
        let asset_store = LocalAssetStore::new(local_app_data_dir.as_ref());
        Ok(Self {
            database,
            asset_store,
        })
    }

    pub fn database(&self) -> &SqliteDatabase {
        &self.database
    }

    pub fn database_path(&self) -> &Path {
        self.database.path()
    }
}

#[tauri::command]
pub fn asset_import_image(
    state: State<'_, AppState>,
    original_name: String,
    content_base64: String,
) -> Result<AssetRecord, String> {
    if content_base64.len() > 28 * 1024 * 1024 {
        return Err("Image upload is too large; choose an image no larger than 20 MiB.".to_owned());
    }
    let bytes = STANDARD
        .decode(content_base64)
        .map_err(|_| "The selected image data is invalid.".to_owned())?;
    state
        .asset_store
        .import_bytes(&state.database, &original_name, &bytes)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn asset_load_data_url(
    state: State<'_, AppState>,
    asset_id: String,
) -> Result<Option<String>, String> {
    state
        .asset_store
        .data_url(&state.database, &asset_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn catalog_list(
    state: State<'_, AppState>,
    query: CatalogListQuery,
) -> Result<CatalogPage, String> {
    CatalogPort::list(&CatalogGateway::new(&state.database), &query)
}

#[tauri::command]
pub fn catalog_templates(
    state: State<'_, AppState>,
    query: TemplateListQuery,
) -> Result<Vec<TemplateChoice>, String> {
    CatalogPort::templates(&CatalogGateway::new(&state.database), &query)
}

#[tauri::command]
pub fn catalog_initialize_synthetic_samples(state: State<'_, AppState>) -> Result<(), String> {
    CatalogPort::initialize_synthetic_samples(&CatalogGateway::new(&state.database))
}

#[tauri::command]
pub fn catalog_detail(
    state: State<'_, AppState>,
    visual_id: String,
) -> Result<VisualDetail, String> {
    CatalogPort::detail(&CatalogGateway::new(&state.database), &visual_id)
}

#[tauri::command]
pub fn catalog_create(
    state: State<'_, AppState>,
    request: CreateVisualRequest,
) -> Result<VisualDetail, String> {
    CatalogPort::create(&CatalogGateway::new(&state.database), request)
}

#[tauri::command]
pub fn catalog_duplicate(
    state: State<'_, AppState>,
    visual_id: String,
    actor: Option<String>,
) -> Result<VisualDetail, String> {
    CatalogPort::duplicate(&CatalogGateway::new(&state.database), &visual_id, actor)
}

#[tauri::command]
pub fn catalog_save_draft(
    state: State<'_, AppState>,
    request: SaveDraftRequest,
) -> Result<VisualDetail, String> {
    CatalogPort::save_draft(&CatalogGateway::new(&state.database), request)
}

#[tauri::command]
pub fn catalog_transition(
    state: State<'_, AppState>,
    request: TransitionRequest,
) -> Result<VisualDetail, String> {
    CatalogPort::transition(&CatalogGateway::new(&state.database), request)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::sqlite::{TemplateRecord, TemplateRepository, VisualRecord};
    use serde_json::json;
    use tempfile::TempDir;

    fn template() -> TemplateRecord {
        TemplateRecord {
            id: "template-test".to_owned(),
            family: "gang-standard-2up".to_owned(),
            name: "Synthetic Gang".to_owned(),
            visual_type: "gang".to_owned(),
            lifecycle_state: "Draft".to_owned(),
            active_published_version_id: None,
            created_at: "2026-10-13T00:00:00.000Z".to_owned(),
            updated_at: "2026-10-13T00:00:00.000Z".to_owned(),
            provenance: None,
        }
    }

    #[test]
    fn first_run_creates_the_database_under_local_data_and_reopen_preserves_records() {
        let directory = TempDir::new().expect("temporary local-data directory");
        let app_data = directory.path().join("WarehouseVisualManager");
        let first = AppState::open_at(&app_data).expect("first run initializes local catalog");
        assert_eq!(first.database_path(), app_data.join("wvm.sqlite"));
        let connection = first.database().connect().expect("database connection");
        TemplateRepository
            .create(&connection, &template())
            .expect("template inserts");
        let visual = VisualRecord {
            id: "visual-test".to_owned(),
            name: "Synthetic Aisle Marker".to_owned(),
            visual_type: "gang".to_owned(),
            template_id: "template-test".to_owned(),
            stock_class: None,
            location: Some("A-01".to_owned()),
            flow: None,
            description: None,
            accent_color: None,
            lifecycle_state: "Draft".to_owned(),
            current_draft_version_id: None,
            current_published_version_id: None,
            created_at: "2026-10-13T00:00:00.000Z".to_owned(),
            updated_at: "2026-10-13T00:00:00.000Z".to_owned(),
        };
        crate::adapters::sqlite::VisualRepository
            .create(&connection, &visual)
            .expect("visual inserts");
        drop(connection);
        drop(first);

        let reopened = AppState::open_at(&app_data).expect("second run reopens local catalog");
        let reopened_connection = reopened
            .database()
            .connect()
            .expect("reopened database connection");
        assert_eq!(
            reopened
                .database()
                .schema_version()
                .expect("schema persists"),
            3
        );
        assert_eq!(
            crate::adapters::sqlite::VisualRepository
                .get(&reopened_connection, "visual-test")
                .expect("visual reads"),
            Some(visual)
        );
    }

    #[test]
    fn malformed_catalog_ipc_payload_is_rejected_during_deserialization() {
        let payload = json!({ "page": 1, "page_size": "all", "sort_by": "name" });
        assert!(serde_json::from_value::<CatalogListQuery>(payload).is_err());
    }
}
