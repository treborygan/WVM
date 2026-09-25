#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod adapters;

fn main() {
    tauri::Builder::default()
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
