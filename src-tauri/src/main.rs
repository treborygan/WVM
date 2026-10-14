#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod adapters;
pub mod application;
pub mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            use tauri::Manager;

            let local_app_data_dir = app.path().app_local_data_dir()?;
            let state =
                commands::AppState::open_at(local_app_data_dir).map_err(std::io::Error::other)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::catalog_list,
            commands::catalog_templates,
            commands::catalog_initialize_synthetic_samples,
            commands::catalog_detail,
            commands::catalog_create,
            commands::catalog_duplicate,
            commands::catalog_save_draft,
            commands::catalog_transition,
            commands::asset_import_image,
            commands::asset_load_data_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Warehouse Visual Manager");
}

#[cfg(test)]
mod tests {
    #[test]
    fn desktop_shell_has_the_product_name() {
        assert_eq!(
            env!("CARGO_PKG_DESCRIPTION"),
            "Warehouse Visual Manager desktop shell"
        );
    }
}
