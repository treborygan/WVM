use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::{invalid_data, validate_id, StorageResult};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct AssetRecord {
    pub id: String,
    pub kind: String,
    pub original_name: String,
    pub mime_type: String,
    pub content_hash: String,
    pub storage_locator: String,
    pub intrinsic_width_px: Option<i64>,
    pub intrinsic_height_px: Option<i64>,
    pub created_at: String,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct AssetRepository;

impl AssetRepository {
    pub fn create(&self, connection: &Connection, asset: &AssetRecord) -> StorageResult<()> {
        validate_id(&asset.id)?;
        if !matches!(asset.kind.as_str(), "image" | "logo") {
            return Err(invalid_data("Asset kind must be image or logo."));
        }
        if asset.original_name.trim().is_empty()
            || asset.mime_type.trim().is_empty()
            || asset.content_hash.trim().is_empty()
            || asset.storage_locator.trim().is_empty()
            || asset.intrinsic_width_px.is_some_and(|size| size <= 0)
            || asset.intrinsic_height_px.is_some_and(|size| size <= 0)
        {
            return Err(invalid_data(
                "Asset metadata is incomplete or has invalid dimensions.",
            ));
        }
        connection.execute(
            "INSERT INTO assets(id, kind, original_name, mime_type, content_hash, storage_locator, intrinsic_width_px, intrinsic_height_px, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![asset.id, asset.kind, asset.original_name, asset.mime_type, asset.content_hash, asset.storage_locator,
                asset.intrinsic_width_px, asset.intrinsic_height_px, asset.created_at],
        )?;
        Ok(())
    }

    pub fn get(&self, connection: &Connection, id: &str) -> StorageResult<Option<AssetRecord>> {
        let asset = connection
            .query_row(
                "SELECT id, kind, original_name, mime_type, content_hash, storage_locator, intrinsic_width_px, intrinsic_height_px, created_at
                 FROM assets WHERE id = ?1",
                [id],
                |row| {
                    Ok(AssetRecord {
                        id: row.get(0)?,
                        kind: row.get(1)?,
                        original_name: row.get(2)?,
                        mime_type: row.get(3)?,
                        content_hash: row.get(4)?,
                        storage_locator: row.get(5)?,
                        intrinsic_width_px: row.get(6)?,
                        intrinsic_height_px: row.get(7)?,
                        created_at: row.get(8)?,
                    })
                },
            )
            .optional()?;
        Ok(asset)
    }
}
