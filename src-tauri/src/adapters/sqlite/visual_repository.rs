use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::template_repository::TEMPLATE_FAMILIES;
use super::{
    append_audit_event, invalid_data, validate_id, validate_lifecycle_state, StorageResult,
};

#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct VisualListQuery {
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

impl Default for VisualListQuery {
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

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CatalogVisualRecord {
    pub visual: VisualRecord,
    pub template_family: String,
    pub legacy_search_text: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct CatalogVisualPage {
    pub items: Vec<CatalogVisualRecord>,
    pub page: usize,
    pub page_size: usize,
    pub total: usize,
    pub total_pages: usize,
}

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
pub struct LegacySourceReferenceRecord {
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
            return Err(invalid_data(
                "Visual name and type are required, and optional accent colors must be valid hex tokens.",
            ));
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
        query: &VisualListQuery,
    ) -> StorageResult<Vec<VisualRecord>> {
        Ok(self
            .list_page(connection, query)?
            .items
            .into_iter()
            .map(|record| record.visual)
            .collect())
    }

    pub fn list_page(
        &self,
        connection: &Connection,
        query: &VisualListQuery,
    ) -> StorageResult<CatalogVisualPage> {
        if query
            .lifecycle_state
            .as_deref()
            .is_some_and(|state| validate_lifecycle_state(state).is_err())
        {
            return Err(invalid_data("Unknown lifecycle state filter."));
        }
        if query
            .template_family
            .as_deref()
            .is_some_and(|family| !TEMPLATE_FAMILIES.contains(&family))
        {
            return Err(invalid_data("Unknown template family filter."));
        }
        if query.page == 0 || query.page_size == 0 || query.page_size > 200 {
            return Err(invalid_data(
                "Catalog page must be positive and page_size must be between 1 and 200.",
            ));
        }
        let offset = (query.page - 1)
            .checked_mul(query.page_size)
            .ok_or_else(|| invalid_data("Catalog page offset is outside the supported range."))?;
        let sql_limit = i64::try_from(query.page_size)
            .map_err(|_| invalid_data("Catalog page size is outside the supported range."))?;
        let sql_offset = i64::try_from(offset)
            .map_err(|_| invalid_data("Catalog page offset is outside the supported range."))?;
        let sort_field = match query.sort_by.as_deref().unwrap_or("name") {
            "name" => "v.name COLLATE NOCASE",
            "visual_type" => "v.visual_type COLLATE NOCASE",
            "template_family" => "t.family COLLATE NOCASE",
            "stock_class" => "v.stock_class COLLATE NOCASE",
            "location" => "v.location COLLATE NOCASE",
            "flow" => "v.flow COLLATE NOCASE",
            "description" => "v.description COLLATE NOCASE",
            "lifecycle_state" => "v.lifecycle_state COLLATE NOCASE",
            "legacy_source" => "coalesce((SELECT min(lower(sr.source_id || ' ' || sr.source_name)) FROM legacy_source_references sr WHERE sr.visual_id = v.id), '')",
            _ => return Err(invalid_data("Unknown catalog sort field.")),
        };
        let direction = match query.sort_order.as_deref().unwrap_or("asc") {
            "asc" => "ASC",
            "desc" => "DESC",
            _ => return Err(invalid_data("Unknown catalog sort order.")),
        };
        let normalize = |value: &Option<String>| {
            value
                .as_deref()
                .map(|text| text.trim().to_lowercase())
                .filter(|text| !text.is_empty())
        };
        let search = normalize(&query.search);
        let stock_class = normalize(&query.stock_class);
        let location = normalize(&query.location);
        let flow = normalize(&query.flow);
        let description = normalize(&query.description);
        let legacy_source = normalize(&query.legacy_source);
        let visual_type = query
            .visual_type
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let lifecycle_state = query.lifecycle_state.as_deref();
        let template_family = query.template_family.as_deref();
        let predicates = "(?1 IS NULL OR instr(lower(v.name), ?1) > 0 OR instr(lower(v.visual_type), ?1) > 0
            OR instr(lower(t.family), ?1) > 0 OR instr(lower(coalesce(v.stock_class, '')), ?1) > 0
            OR instr(lower(coalesce(v.location, '')), ?1) > 0 OR instr(lower(coalesce(v.flow, '')), ?1) > 0
            OR instr(lower(coalesce(v.description, '')), ?1) > 0 OR EXISTS (SELECT 1 FROM legacy_source_references sr
                WHERE sr.visual_id = v.id AND (instr(lower(sr.source_id), ?1) > 0 OR instr(lower(sr.source_name), ?1) > 0
                    OR instr(lower(coalesce(sr.sheet_or_slide, '')), ?1) > 0 OR instr(lower(coalesce(sr.side, '')), ?1) > 0
                    OR instr(lower(coalesce(sr.raw_source_text, '')), ?1) > 0)))
            AND (?2 IS NULL OR v.visual_type = ?2)
            AND (?3 IS NULL OR v.lifecycle_state = ?3)
            AND (?4 IS NULL OR t.family = ?4)
            AND (?5 IS NULL OR instr(lower(coalesce(v.stock_class, '')), ?5) > 0)
            AND (?6 IS NULL OR instr(lower(coalesce(v.location, '')), ?6) > 0)
            AND (?7 IS NULL OR instr(lower(coalesce(v.flow, '')), ?7) > 0)
            AND (?8 IS NULL OR instr(lower(coalesce(v.description, '')), ?8) > 0)
            AND (?9 IS NULL OR EXISTS (SELECT 1 FROM legacy_source_references sr WHERE sr.visual_id = v.id
                AND (instr(lower(sr.source_id), ?9) > 0 OR instr(lower(sr.source_name), ?9) > 0
                    OR instr(lower(coalesce(sr.sheet_or_slide, '')), ?9) > 0 OR instr(lower(coalesce(sr.side, '')), ?9) > 0
                    OR instr(lower(coalesce(sr.raw_source_text, '')), ?9) > 0)))";
        let count_sql = format!("SELECT COUNT(*) FROM visuals v JOIN templates t ON t.id = v.template_id WHERE {predicates}");
        let parameters = rusqlite::params![
            search,
            visual_type,
            lifecycle_state,
            template_family,
            stock_class,
            location,
            flow,
            description,
            legacy_source
        ];
        let total_i64: i64 = connection.query_row(&count_sql, parameters, |row| row.get(0))?;
        let total = usize::try_from(total_i64)
            .map_err(|_| invalid_data("Catalog result count is outside the supported range."))?;
        let list_sql = format!(
            "SELECT v.id, v.name, v.visual_type, v.template_id, v.stock_class, v.location, v.flow,
             v.description, v.accent_color, v.lifecycle_state, v.current_draft_version_id,
             v.current_published_version_id, v.created_at, v.updated_at, t.family,
             (SELECT group_concat(sr.source_id || ' ' || sr.source_name || ' ' || coalesce(sr.sheet_or_slide, '') || ' ' || coalesce(sr.side, ''), ' ')
                FROM legacy_source_references sr WHERE sr.visual_id = v.id)
             FROM visuals v JOIN templates t ON t.id = v.template_id WHERE {predicates}
             ORDER BY {sort_field} {direction}, v.id ASC LIMIT ?10 OFFSET ?11"
        );
        let mut statement = connection.prepare(&list_sql)?;
        let mut values = statement
            .query_map(
                rusqlite::params![
                    search,
                    visual_type,
                    lifecycle_state,
                    template_family,
                    stock_class,
                    location,
                    flow,
                    description,
                    legacy_source,
                    sql_limit,
                    sql_offset
                ],
                catalog_visual_from_row,
            )?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(CatalogVisualPage {
            items: std::mem::take(&mut values),
            page: query.page,
            page_size: query.page_size,
            total,
            total_pages: total.div_ceil(query.page_size),
        })
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

    pub fn list_source_references(
        &self,
        connection: &Connection,
        visual_id: &str,
    ) -> StorageResult<Vec<LegacySourceReferenceRecord>> {
        let mut statement = connection.prepare(
            "SELECT id, visual_id, source_id, source_name, sheet_or_slide, side, raw_source_text,
             migration_batch, validation_state FROM legacy_source_references
             WHERE visual_id = ?1 ORDER BY source_name COLLATE NOCASE, source_id, id",
        )?;
        let values = statement
            .query_map([visual_id], |row| {
                Ok(LegacySourceReferenceRecord {
                    id: row.get(0)?,
                    visual_id: row.get(1)?,
                    source_id: row.get(2)?,
                    source_name: row.get(3)?,
                    sheet_or_slide: row.get(4)?,
                    side: row.get(5)?,
                    raw_source_text: row.get(6)?,
                    migration_batch: row.get(7)?,
                    validation_state: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(values)
    }

    pub fn add_source_reference(
        &self,
        transaction: &Transaction<'_>,
        reference: &LegacySourceReferenceRecord,
    ) -> StorageResult<()> {
        validate_id(&reference.id)?;
        validate_id(&reference.visual_id)?;
        if reference.source_id.trim().is_empty()
            || reference.source_name.trim().is_empty()
            || reference.migration_batch.trim().is_empty()
            || !matches!(
                reference.validation_state.as_str(),
                "unreviewed" | "pending" | "validated" | "rejected"
            )
        {
            return Err(invalid_data(
                "Source reference identity and validation state are required.",
            ));
        }
        transaction.execute(
            "INSERT INTO legacy_source_references(id, visual_id, source_id, source_name, sheet_or_slide,
             side, raw_source_text, migration_batch, validation_state)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![reference.id, reference.visual_id, reference.source_id, reference.source_name,
                reference.sheet_or_slide, reference.side, reference.raw_source_text,
                reference.migration_batch, reference.validation_state],
        )?;
        Ok(())
    }

    pub fn update_draft_projection(
        &self,
        transaction: &Transaction<'_>,
        expected_revision_id: Option<&str>,
        visual: &VisualRecord,
    ) -> StorageResult<()> {
        validate_id(&visual.id)?;
        if visual.name.trim().is_empty()
            || visual.visual_type.trim().is_empty()
            || visual
                .accent_color
                .as_deref()
                .is_some_and(|color| !valid_color_token(color))
        {
            return Err(invalid_data(
                "Visual name, type, or accent color is invalid.",
            ));
        }
        let updated = transaction.execute(
            "UPDATE visuals SET name = ?1, visual_type = ?2, stock_class = ?3, location = ?4,
             flow = ?5, description = ?6, accent_color = ?7, updated_at = ?8
             WHERE id = ?9 AND COALESCE(current_draft_version_id, current_published_version_id) IS ?10",
            params![visual.name, visual.visual_type, visual.stock_class, visual.location, visual.flow,
                visual.description, visual.accent_color, visual.updated_at, visual.id, expected_revision_id],
        )?;
        if updated != 1 {
            return Err(invalid_data(
                "Draft save is stale; reload the visual before saving.",
            ));
        }
        Ok(())
    }

    pub fn transition_state(
        &self,
        transaction: &Transaction<'_>,
        visual_id: &str,
        expected: &str,
        next: &str,
        audit: &AuditEventRecord,
    ) -> StorageResult<()> {
        validate_id(visual_id)?;
        let allowed = matches!(
            (expected, next),
            ("Draft", "Review") | ("Review", "Draft") | ("Published", "Retired")
        );
        if !allowed || audit.entity_kind != "visual" || audit.entity_id != visual_id {
            return Err(invalid_data(
                "Lifecycle transition or audit event is invalid.",
            ));
        }
        let updated = transaction.execute(
            "UPDATE visuals SET lifecycle_state = ?1, updated_at = ?2 WHERE id = ?3 AND lifecycle_state = ?4",
            params![next, audit.occurred_at, visual_id, expected],
        )?;
        if updated != 1 {
            return Err(invalid_data(
                "Lifecycle transition is stale or the visual was not found.",
            ));
        }
        append_audit_event(transaction, audit)?;
        Ok(())
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
            || !version.values.as_object().is_some_and(|values| {
                values.values().all(|value| {
                    value.is_null() || value.is_string() || value.is_boolean() || value.is_number()
                })
            })
            || version
                .special_validation
                .as_ref()
                .is_some_and(|value| !value.is_object())
        {
            return Err(invalid_data(
                "Visual version number and structured values are invalid.",
            ));
        }
        let latest_version: i64 = transaction.query_row(
            "SELECT COALESCE(MAX(version_number), 0) FROM visual_versions WHERE visual_id = ?1",
            [&version.visual_id],
            |row| row.get(0),
        )?;
        if version.version_number <= latest_version {
            return Err(invalid_data(
                "Visual version numbers must increase monotonically.",
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
        let template_family: Option<String> = transaction
            .query_row(
                "SELECT t.family FROM visuals v JOIN templates t ON t.id = v.template_id
             JOIN template_versions tv ON tv.template_id = t.id
             WHERE v.id = ?1 AND tv.id = ?2 AND (?3 = 0 OR tv.published_at IS NOT NULL)",
                params![
                    version.visual_id,
                    version.template_version_id,
                    version.published_at.is_some()
                ],
                |row| row.get(0),
            )
            .optional()?;
        let Some(template_family) = template_family else {
            return Err(invalid_data("Visual version must select a version of its visual's template, and publication requires a published template."));
        };
        if version.published_at.is_some() && template_family == "gang-special-2up" {
            validate_special_publication(version.special_validation.as_ref())?;
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
        let updated = transaction.execute(
            "UPDATE visuals SET updated_at = ?1 WHERE id = ?2",
            params![version.created_at, version.visual_id],
        )?;
        if updated != 1 {
            return Err(invalid_data("Visual for the new version was not found."));
        }
        append_audit_event(transaction, audit)?;
        Ok(())
    }

    pub fn set_current_draft_version(
        &self,
        transaction: &Transaction<'_>,
        visual_id: &str,
        version_id: &str,
        audit: &AuditEventRecord,
    ) -> StorageResult<()> {
        self.set_pointer(transaction, visual_id, version_id, false, audit)
    }

    pub fn set_current_published_version(
        &self,
        transaction: &Transaction<'_>,
        visual_id: &str,
        version_id: &str,
        audit: &AuditEventRecord,
    ) -> StorageResult<()> {
        self.set_pointer(transaction, visual_id, version_id, true, audit)
    }

    fn set_pointer(
        &self,
        transaction: &Transaction<'_>,
        visual_id: &str,
        version_id: &str,
        published: bool,
        audit: &AuditEventRecord,
    ) -> StorageResult<()> {
        validate_id(visual_id)?;
        validate_id(version_id)?;
        if audit.entity_kind != "visual"
            || audit.entity_id != visual_id
            || audit.version_id.as_deref() != Some(version_id)
        {
            return Err(invalid_data(
                "Visual pointer audit event must identify the visual and selected version.",
            ));
        }
        let (column, eligibility) = if published {
            ("current_published_version_id", "published_at IS NOT NULL")
        } else {
            ("current_draft_version_id", "published_at IS NULL")
        };
        let lifecycle_update = if published {
            ", lifecycle_state = 'Published'"
        } else {
            ", lifecycle_state = 'Draft'"
        };
        let clear_draft_pointer = if published {
            ", current_draft_version_id = NULL"
        } else {
            ""
        };
        let sql = format!(
            "UPDATE visuals SET {column} = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'){lifecycle_update}{clear_draft_pointer} WHERE id = ?2 AND EXISTS
             (SELECT 1 FROM visual_versions WHERE id = ?1 AND visual_id = ?2 AND {eligibility})"
        );
        if transaction.execute(&sql, params![version_id, visual_id])? != 1 {
            return Err(invalid_data(
                "Version was not found for this visual or has the wrong publication state.",
            ));
        }
        append_audit_event(transaction, audit)?;
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

fn validate_special_publication(validation: Option<&Value>) -> StorageResult<()> {
    let validation = validation
        .and_then(Value::as_object)
        .ok_or_else(|| invalid_data("Special Gang publication requires validation evidence."))?;
    let reviewed_at = validation.get("reviewed_at").and_then(Value::as_str);
    if validation.get("state").and_then(Value::as_str) != Some("validated")
        || validation
            .get("reviewer_id")
            .and_then(Value::as_str)
            .is_none_or(|value| value.trim().is_empty())
        || reviewed_at.is_none_or(|value| !is_canonical_utc_timestamp(value))
        || validation
            .get("evidence_ref")
            .and_then(Value::as_str)
            .is_none_or(|value| value.trim().is_empty())
    {
        return Err(invalid_data("Special Gang publication requires validated state, reviewer, canonical UTC review time, and evidence reference."));
    }
    Ok(())
}

fn is_canonical_utc_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 24
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'.'
        || bytes[23] != b'Z'
        || ![0..4, 5..7, 8..10, 11..13, 14..16, 17..19, 20..23]
            .iter()
            .all(|range| bytes[range.clone()].iter().all(u8::is_ascii_digit))
    {
        return false;
    }
    let parse = |range: std::ops::Range<usize>| value[range].parse::<u32>().ok();
    let (Some(year), Some(month), Some(day), Some(hour), Some(minute), Some(second)) = (
        parse(0..4),
        parse(5..7),
        parse(8..10),
        parse(11..13),
        parse(14..16),
        parse(17..19),
    ) else {
        return false;
    };
    let max_day = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 && (year % 100 != 0 || year % 400 == 0) => 29,
        2 => 28,
        _ => return false,
    };
    (1..=max_day).contains(&day) && hour <= 23 && minute <= 59 && second <= 59
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

fn catalog_visual_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CatalogVisualRecord> {
    Ok(CatalogVisualRecord {
        visual: visual_from_row(row)?,
        template_family: row.get(14)?,
        legacy_search_text: row.get(15)?,
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
