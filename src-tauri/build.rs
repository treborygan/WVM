mod build_support;

use std::{fs, path::Path};

const DEVELOPMENT_ICON: &[u8] = &[
    137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 32, 0, 0, 0, 32, 8, 6,
    0, 0, 0, 115, 122, 122, 244, 0, 0, 0, 48, 73, 68, 65, 84, 120, 156, 237, 206, 33, 1, 0, 0, 8,
    3, 48, 98, 208, 134, 32, 244, 207, 1, 49, 110, 38, 230, 87, 61, 123, 73, 37, 32, 32, 32, 32,
    32, 32, 32, 32, 32, 32, 32, 32, 32, 32, 144, 14, 60, 224, 39, 196, 91, 67, 58, 124, 69, 0, 0,
    0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
];

fn main() {
    let icon_path = Path::new("icons/icon.png");
    let ico_path = Path::new("icons/icon.ico");
    if !icon_path.exists() {
        fs::create_dir_all("icons").expect("failed to create the generated icon directory");
        fs::write(icon_path, DEVELOPMENT_ICON)
            .expect("failed to write the generated development icon");
    }
    let png = fs::read(icon_path).expect("failed to read the generated development icon");
    fs::write(ico_path, build_support::ico_from_png(&png))
        .expect("failed to write the Windows development icon");

    tauri_build::build()
}
