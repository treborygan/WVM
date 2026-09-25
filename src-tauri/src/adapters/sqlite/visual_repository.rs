use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::{
    append_audit_event, invalid_data, validate_id, validate_lifecycle_state, StorageResult,
};

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct VisualRecord {
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
pub struct VisualVersionRecord {
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
pub struct AuditEventRecord {
    pub id: String,
    pub entity_kind: String,
    pub entity_id: String,
    pub version_id: Option<String>,
    pub action: String,
    pub occurred_at: String,
    pub actor: Option<String>,
    pub details: Value,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct VisualRepository;

impl VisualRepository {
    pub fn create(&self, connection: &Connection, visual: &VisualRecord) -> StorageResult<()> {
        validate_id(&visual.id)?;
        validate_id(&visual.template_id)?;
        validate_lifecycle_state(&visual.lifecycle_state)?;
        if visual.name.trim().is_empty()
            || visual.visual_type.trim().is_empty()
            || visual
                .accent_color
                .as_deref()
                .is_some_and(|color| !valid_color_token(color))
        {
            return Err(invalid_data("Visual name and type are required."));
        }
        connection.execute(
            "INSERT INTO visuals(id, name, visual_type, template_id, stock_class, location, flow,
             description, accent_color, lifecycle_state, current_draft_version_id,
             current_published_version_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                visual.id,
                visual.name,
                visual.visual_type,
                visual.template_id,
                visual.stock_class,
                visual.location,
                visual.flow,
                visual.description,
                visual.accent_color,
                visual.lifecycle_state,
                visual.current_draft_version_id,
                visual.current_published_version_id,
                visual.created_at,
                visual.updated_at
            ],
        )?;
        Ok(())
    }

    pub fn get(&self, connection: &Connection, id: &str) -> StorageResult<Option<VisualRecord>> {
        Ok(connection
            .query_row(
                "SELECT id, name, visual_type, template_id, stock_class, location, flow, description,
                 accent_color, lifecycle_state, current_draft_version_id, current_published_version_id,
                 created_at, updated_at FROM visuals WHERE id = ?1",
                [id],
                visual_from_row,
            )
            .optional()?)
    }

    pub fn list(
        &self,
        connection: &Connection,
        search: Option<&str>,
    ) -> StorageResult<Vec<VisualRecord>> {
        let pattern = search.map(str::to_lowercase);
        let mut statement = connection.prepare(
            "SELECT v.id, v.name, v.visual_type, v.template_id, v.stock_class, v.location, v.flow,
             v.description, v.accent_color, v.lifecycle_state, v.current_draft_version_id,
             v.current_published_version_id, v.created_at, v.updated_at
             FROM visuals v JOIN templates t ON t.id = v.template_id
             WHERE ?1 IS NULL OR instr(lower(v.name), ?1) > 0 OR instr(lower(v.visual_type), ?1) > 0
                OR instr(lower(t.family), ?1) > 0 OR instr(lower(coalesce(v.stock_class, '')), ?1) > 0
                OR instr(lower(coalesce(v.location, '')), ?1) > 0 OR instr(lower(coalesce(v.flow, '')), ?1) > 0
                OR instr(lower(coalesce(v.description, '')), ?1) > 0
             ORDER BY v.name COLLATE NOCASE, v.id",
        )?;
        let values = statement
            .query_map([pattern], visual_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(values)
    }

    pub fn list_versions(
        &self,
        connection: &Connection,
        visual_id: &str,
    ) -> StorageResult<Vec<VisualVersionRecord>> {
        let mut statement = connection.prepare(
            "SELECT id, visual_id, version_number, template_version_id, values_json, notes,
             special_validation_json, created_by, created_at, published_at
             FROM visual_versions WHERE visual_id = ?1 ORDER BY version_number",
        )?;
        let values = statement
            .query_map([visual_id], visual_version_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(values)
    }

    pub fn add_version(
        &self,
        transaction: &Transaction<'_>,
        version: &VisualVersionRecord,
        audit: &AuditEventRecord,
    ) -> StorageResult<()> {
        validate_id(&version.id)?;
        validate_id(&version.visual_id)?;
        validate_id(&version.template_version_id)?;
        if version.version_number <= 0
            || !version.values.is_object()
            || version
                .special_validation
                .as_ref()
                .is_some_and(|value| !value.is_object())
        {
            return Err(invalid_data(
                "Visual version number and structured values are invalid.",
            ));
        }
        if audit.entity_kind != "visual_version"
            || audit.entity_id != version.id
            || audit.version_id.as_deref() != Some(version.id.as_str())
        {
            return Err(invalid_data(
                "Visual version audit event must identify the version being added.",
            ));
        }
        let parent_matches: bool = transaction.query_row(
            "SELECT EXISTS(SELECT 1 FROM visuals v JOIN template_versions tv
             ON tv.template_id = v.template_id WHERE v.id = ?1 AND tv.id = ?2
             AND (?3 = 0 OR tv.published_at IS NOT NULL))",
            params![
                version.visual_id,
                version.template_version_id,
                version.published_at.is_some()
            ],
            |row| row.get(0),
        )?;
        if !parent_matches {
            return Err(invalid_data("Visual version must select a version of its visual's template, and publication requires a published template."));
        }
        transaction.execute(
            "INSERT INTO visual_versions(id, visual_id, version_number, template_version_id, values_json,
             notes, special_validation_json, created_by, created_at, published_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![version.id, version.visual_id, version.version_number, version.template_version_id,
                serde_json::to_string(&version.values)?, version.notes,
                version.special_validation.as_ref().map(serde_json::to_string).transpose()?,
                version.created_by, version.created_at, version.published_at],
        )?;
        let pointer_column = if version.published_at.is_some() {
            "current_published_version_id"
        } else {
            "current_draft_version_id"
        };
        let sql =
            format!("UPDATE visuals SET {pointer_column} = ?1, updated_at = ?2 WHERE id = ?3");
        let updated = transaction.execute(
            &sql,
            params![version.id, version.created_at, version.visual_id],
        )?;
        if updated != 1 {
            return Err(invalid_data("Visual for the new version was not found."));
        }
        if version.published_at.is_some() {
            transaction.execute(
                "UPDATE visuals SET lifecycle_state = 'Published' WHERE id = ?1",
                [&version.visual_id],
            )?;
        }
        append_audit_event(transaction, audit)?;
        Ok(())
    }

    pub fn set_current_draft_version(
        &self,
        transaction: &Transaction<'_>,
        visual_id: &str,
        version_id: &str,
    ) -> StorageResult<()> {
        self.set_pointer(transaction, visual_id, version_id, false)
    }

    pub fn set_current_published_version(
        &self,
        transaction: &Transaction<'_>,
        visual_id: &str,
        version_id: &str,
    ) -> StorageResult<()> {
        self.set_pointer(transaction, visual_id, version_id, true)
    }

    fn set_pointer(
        &self,
        transaction: &Transaction<'_>,
        visual_id: &str,
        version_id: &str,
        published: bool,
    ) -> StorageResult<()> {
        validate_id(visual_id)?;
        validate_id(version_id)?;
        let (column, eligibility) = if published {
            ("current_published_version_id", "published_at IS NOT NULL")
        } else {
            ("current_draft_version_id", "published_at IS NULL")
        };
        let lifecycle_update = if published {
            ", lifecycle_state = 'Published'"
        } else {
            ""
        };
        let sql = format!(
            "UPDATE visuals SET {column} = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'){lifecycle_update} WHERE id = ?2 AND EXISTS
             (SELECT 1 FROM visual_versions WHERE id = ?1 AND visual_id = ?2 AND {eligibility})"
        );
        if transaction.execute(&sql, params![version_id, visual_id])? != 1 {
            return Err(invalid_data(
                "Version was not found for this visual or has the wrong publication state.",
            ));
        }
        Ok(())
    }
}

fn valid_color_token(color: &str) -> bool {
    let Some(digits) = color.strip_prefix('#') else {
        return false;
    };
    matches!(digits.len(), 3 | 4 | 6 | 8)
        && digits
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

fn visual_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<VisualRecord> {
    Ok(VisualRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        visual_type: row.get(2)?,
        template_id: row.get(3)?,
        stock_class: row.get(4)?,
        location: row.get(5)?,
        flow: row.get(6)?,
        description: row.get(7)?,
        accent_color: row.get(8)?,
        lifecycle_state: row.get(9)?,
        current_draft_version_id: row.get(10)?,
        current_published_version_id: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

fn visual_version_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<VisualVersionRecord> {
    let values_json: String = row.get(4)?;
    let values: Value = serde_json::from_str(&values_json).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, Box::new(error))
    })?;
    if !values.is_object() {
        return Err(rusqlite::Error::InvalidColumnType(
            4,
            "values_json".to_owned(),
            rusqlite::types::Type::Text,
        ));
    }
    let special_json: Option<String> = row.get(6)?;
    let special_validation = special_json
        .map(|raw| {
            serde_json::from_str::<Value>(&raw).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    6,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            })
        })
        .transpose()?;
    if special_validation
        .as_ref()
        .is_some_and(|value| !value.is_object())
    {
        return Err(rusqlite::Error::InvalidColumnType(
            6,
            "special_validation_json".to_owned(),
            rusqlite::types::Type::Text,
        ));
    }
    Ok(VisualVersionRecord {
        id: row.get(0)?,
        visual_id: row.get(1)?,
        version_number: row.get(2)?,
        template_version_id: row.get(3)?,
        values,
        notes: row.get(5)?,
        special_validation,
        created_by: row.get(7)?,
        created_at: row.get(8)?,
        published_at: row.get(9)?,
    })
}
