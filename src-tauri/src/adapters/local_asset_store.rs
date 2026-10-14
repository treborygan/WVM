use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::sqlite::{AssetRecord, AssetRepository, SqliteDatabase, StorageResult};

const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 50_000;
const MAX_IMAGE_PIXELS: u64 = 100_000_000;

pub struct LocalAssetStore {
    root: PathBuf,
}

impl LocalAssetStore {
    pub fn new(app_data_dir: impl AsRef<Path>) -> Self {
        Self {
            root: app_data_dir.as_ref().join("assets"),
        }
    }

    pub fn import_bytes(
        &self,
        database: &SqliteDatabase,
        original_name: &str,
        bytes: &[u8],
    ) -> StorageResult<AssetRecord> {
        if bytes.len() > MAX_IMAGE_BYTES {
            return Err(invalid("Images must be 20 MiB or smaller."));
        }
        let (mime_type, extension, width, height) = validate_image_bytes(bytes)?;
        if original_name.trim().is_empty()
            || original_name.chars().count() > 255
            || original_name.chars().any(char::is_control)
        {
            return Err(invalid("The image filename is invalid."));
        }

        let content_hash = format!("{:x}", Sha256::digest(bytes));
        let connection = database.connect()?;
        if let Some(existing) = AssetRepository.get_by_hash(&connection, &content_hash)? {
            let filename = format!("{content_hash}.{extension}");
            write_asset_file(&self.root, &self.root.join(filename), bytes, &content_hash)?;
            return Ok(existing);
        }

        let filename = format!("{content_hash}.{extension}");
        let destination = self.root.join(&filename);
        let wrote_destination = write_asset_file(&self.root, &destination, bytes, &content_hash)?;

        let asset = AssetRecord {
            id: format!("asset-{}", Uuid::new_v4()),
            kind: "image".to_owned(),
            original_name: original_name.to_owned(),
            mime_type: mime_type.to_owned(),
            content_hash: content_hash.clone(),
            storage_locator: format!("assets/{filename}"),
            intrinsic_width_px: Some(i64::from(width)),
            intrinsic_height_px: Some(i64::from(height)),
            created_at: utc_timestamp(
                SystemTime::now().duration_since(UNIX_EPOCH)?.as_millis() as u64
            ),
        };
        let result = database.transaction(|transaction| {
            if let Some(existing) = AssetRepository.get_by_hash(transaction, &content_hash)? {
                return Ok(existing);
            }
            AssetRepository.create(transaction, &asset)?;
            Ok(asset.clone())
        });
        if result.is_err() && wrote_destination {
            let connection = database.connect()?;
            if AssetRepository
                .get_by_hash(&connection, &content_hash)?
                .is_none()
            {
                let _ = fs::remove_file(&destination);
            }
        }
        result
    }

    pub fn data_url(&self, database: &SqliteDatabase, id: &str) -> StorageResult<Option<String>> {
        let connection = database.connect()?;
        let Some(asset) = AssetRepository.get(&connection, id)? else {
            return Ok(None);
        };
        if !matches!(asset.mime_type.as_str(), "image/png" | "image/jpeg")
            || !asset
                .content_hash
                .chars()
                .all(|character| character.is_ascii_hexdigit())
        {
            return Err(invalid("The stored asset metadata is invalid."));
        }
        let extension = if asset.mime_type == "image/png" {
            "png"
        } else {
            "jpg"
        };
        let path = self
            .root
            .join(format!("{}.{}", asset.content_hash, extension));
        let bytes = fs::read(path)?;
        if format!("{:x}", Sha256::digest(&bytes)) != asset.content_hash {
            return Err(invalid("The stored asset failed its integrity check."));
        }
        Ok(Some(format!(
            "data:{};base64,{}",
            asset.mime_type,
            STANDARD.encode(bytes)
        )))
    }
}

fn write_new_file(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn write_asset_file(
    root: &Path,
    destination: &Path,
    bytes: &[u8],
    expected_hash: &str,
) -> StorageResult<bool> {
    fs::create_dir_all(root)?;
    if destination.exists() {
        verify_file_hash(destination, expected_hash)?;
        return Ok(false);
    }
    let temporary = root.join(format!(".{}.tmp", Uuid::new_v4()));
    let write_result =
        write_new_file(&temporary, bytes).and_then(|_| fs::rename(&temporary, destination));
    match write_result {
        Ok(()) => Ok(true),
        Err(_error) if destination.exists() => {
            let _ = fs::remove_file(&temporary);
            verify_file_hash(destination, expected_hash)?;
            Ok(false)
        }
        Err(error) => {
            let _ = fs::remove_file(&temporary);
            Err(Box::new(error))
        }
    }
}

fn verify_file_hash(path: &Path, expected_hash: &str) -> StorageResult<()> {
    let stored = fs::read(path)?;
    if format!("{:x}", Sha256::digest(&stored)) != expected_hash {
        return Err(invalid(
            "An existing content-addressed asset failed its integrity check.",
        ));
    }
    Ok(())
}

fn validate_image_bytes(bytes: &[u8]) -> io::Result<(&'static str, &'static str, u32, u32)> {
    let (mime, extension, width, height) = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        if bytes.len() < 24 || &bytes[12..16] != b"IHDR" {
            return Err(invalid_io("The PNG image header is incomplete."));
        }
        (
            "image/png",
            "png",
            u32::from_be_bytes(bytes[16..20].try_into().unwrap()),
            u32::from_be_bytes(bytes[20..24].try_into().unwrap()),
        )
    } else if bytes.starts_with(&[0xff, 0xd8]) {
        let (width, height) = jpeg_dimensions(bytes)?;
        ("image/jpeg", "jpg", width, height)
    } else {
        return Err(invalid_io(
            "Only PNG and JPEG images are supported. SVG and other formats are not imported.",
        ));
    };
    if width == 0
        || height == 0
        || width > MAX_IMAGE_DIMENSION
        || height > MAX_IMAGE_DIMENSION
        || u64::from(width) * u64::from(height) > MAX_IMAGE_PIXELS
    {
        return Err(invalid_io(
            "The image dimensions exceed the supported limit.",
        ));
    }
    Ok((mime, extension, width, height))
}

fn jpeg_dimensions(bytes: &[u8]) -> io::Result<(u32, u32)> {
    let mut index = 2;
    while index < bytes.len() {
        while index < bytes.len() && bytes[index] != 0xff {
            index += 1;
        }
        while index < bytes.len() && bytes[index] == 0xff {
            index += 1;
        }
        if index >= bytes.len() {
            break;
        }
        let marker = bytes[index];
        index += 1;
        if marker == 0xd9 || marker == 0xda {
            break;
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            continue;
        }
        if index + 2 > bytes.len() {
            break;
        }
        let segment_length = usize::from(u16::from_be_bytes([bytes[index], bytes[index + 1]]));
        if segment_length < 2 || index + segment_length > bytes.len() {
            break;
        }
        if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
            if segment_length < 7 {
                break;
            }
            let height = u32::from(u16::from_be_bytes([bytes[index + 3], bytes[index + 4]]));
            let width = u32::from(u16::from_be_bytes([bytes[index + 5], bytes[index + 6]]));
            return Ok((width, height));
        }
        index += segment_length;
    }
    Err(invalid_io("The JPEG image has no valid frame dimensions."))
}

fn utc_timestamp(milliseconds: u64) -> String {
    let seconds = (milliseconds / 1000) as i64;
    let days = seconds.div_euclid(86_400);
    let day_seconds = seconds.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    year += if month <= 2 { 1 } else { 0 };
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        day_seconds / 3600,
        day_seconds % 3600 / 60,
        day_seconds % 60,
        milliseconds % 1000
    )
}

fn invalid(message: &str) -> Box<dyn std::error::Error + Send + Sync> {
    Box::new(io::Error::new(
        io::ErrorKind::InvalidData,
        message.to_owned(),
    ))
}

fn invalid_io(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn png(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = vec![0; 24];
        bytes[..8].copy_from_slice(b"\x89PNG\r\n\x1a\n");
        bytes[12..16].copy_from_slice(b"IHDR");
        bytes[16..20].copy_from_slice(&width.to_be_bytes());
        bytes[20..24].copy_from_slice(&height.to_be_bytes());
        bytes
    }

    #[test]
    fn accepts_png_and_reads_dimensions_from_its_header() {
        assert_eq!(
            validate_image_bytes(&png(640, 480)).unwrap(),
            ("image/png", "png", 640, 480)
        );
    }

    #[test]
    fn rejects_unrecognized_and_unbounded_image_dimensions() {
        assert!(validate_image_bytes(b"<svg></svg>").is_err());
        assert!(validate_image_bytes(&png(100_000, 1)).is_err());
    }

    #[test]
    fn imports_content_addressed_asset_and_reopens_it_with_integrity_check() {
        let directory = TempDir::new().unwrap();
        let database_path = directory.path().join("wvm.sqlite");
        let db = SqliteDatabase::open(&database_path).unwrap();
        let store = LocalAssetStore::new(directory.path());
        let bytes = png(12, 9);
        let record = store.import_bytes(&db, "logo.png", &bytes).unwrap();
        assert_eq!(
            (
                record.mime_type.as_str(),
                record.intrinsic_width_px,
                record.intrinsic_height_px
            ),
            ("image/png", Some(12), Some(9))
        );
        assert_eq!(
            store.data_url(&db, &record.id).unwrap().unwrap(),
            format!("data:image/png;base64,{}", STANDARD.encode(&bytes))
        );
        assert_eq!(
            store.import_bytes(&db, "copy.png", &bytes).unwrap().id,
            record.id
        );
        drop(db);
        let reopened = SqliteDatabase::open(database_path).unwrap();
        assert_eq!(
            store.data_url(&reopened, &record.id).unwrap().unwrap(),
            format!("data:image/png;base64,{}", STANDARD.encode(&bytes))
        );
    }

    #[test]
    fn reimport_repairs_a_missing_managed_file_without_changing_asset_identity() {
        let directory = TempDir::new().unwrap();
        let database = SqliteDatabase::open(directory.path().join("wvm.sqlite")).unwrap();
        let store = LocalAssetStore::new(directory.path());
        let bytes = png(12, 9);
        let record = store.import_bytes(&database, "logo.png", &bytes).unwrap();
        fs::remove_file(
            directory
                .path()
                .join("assets")
                .join(format!("{}.png", record.content_hash)),
        )
        .unwrap();

        let repaired = store.import_bytes(&database, "logo.png", &bytes).unwrap();
        assert_eq!(repaired.id, record.id);
        assert!(store.data_url(&database, &record.id).unwrap().is_some());
    }

    #[test]
    fn refuses_oversized_payloads_before_persisting_anything() {
        let directory = TempDir::new().unwrap();
        let database = SqliteDatabase::open(directory.path().join("wvm.sqlite")).unwrap();
        let store = LocalAssetStore::new(directory.path());
        let oversized = vec![0_u8; MAX_IMAGE_BYTES + 1];

        assert!(store
            .import_bytes(&database, "large.png", &oversized)
            .is_err());
        assert!(!directory.path().join("assets").exists());
    }

    #[test]
    fn refuses_asset_bytes_changed_after_import() {
        let directory = TempDir::new().unwrap();
        let database = SqliteDatabase::open(directory.path().join("wvm.sqlite")).unwrap();
        let store = LocalAssetStore::new(directory.path());
        let record = store
            .import_bytes(&database, "logo.png", &png(12, 9))
            .unwrap();
        let file_path = directory
            .path()
            .join("assets")
            .join(format!("{}.png", record.content_hash));
        fs::write(file_path, b"corrupted").unwrap();

        assert!(store.data_url(&database, &record.id).is_err());
    }
}
