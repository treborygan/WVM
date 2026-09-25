use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::visual_repository::AuditEventRecord;
use super::{
    append_audit_event, invalid_data, validate_id, validate_lifecycle_state, StorageResult,
};

const TEMPLATE_FAMILIES: [&str; 5] = [
    "gang-standard-2up",
    "gang-special-2up",
    "flow-sticker-12up",
    "stand-standard-3up",
    "stand-level-instruction-3up",
];

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TemplateRecord {
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

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct TemplateVersionRecord {
    pub id: String,
    pub template_id: String,
    pub version_number: i64,
    pub document: Value,
    pub created_by: Option<String>,
    pub created_at: String,
    pub published_at: Option<String>,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct TemplateRepository;

impl TemplateRepository {
    pub fn create(&self, connection: &Connection, template: &TemplateRecord) -> StorageResult<()> {
        validate_id(&template.id)?;
        validate_lifecycle_state(&template.lifecycle_state)?;
        if !TEMPLATE_FAMILIES.contains(&template.family.as_str())
            || template.name.trim().is_empty()
            || template.visual_type.trim().is_empty()
        {
            return Err(invalid_data(
                "Template family, name, or visual type is invalid.",
            ));
        }
        connection.execute(
            "INSERT INTO templates(id, family, name, visual_type, lifecycle_state, active_published_version_id, created_at, updated_at, provenance)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![template.id, template.family, template.name, template.visual_type, template.lifecycle_state,
                template.active_published_version_id, template.created_at, template.updated_at, template.provenance],
        )?;
        Ok(())
    }

    pub fn get(&self, connection: &Connection, id: &str) -> StorageResult<Option<TemplateRecord>> {
        Ok(connection
            .query_row(
                "SELECT id, family, name, visual_type, lifecycle_state, active_published_version_id, created_at, updated_at, provenance
                 FROM templates WHERE id = ?1",
                [id],
                template_from_row,
            )
            .optional()?)
    }

    pub fn list(
        &self,
        connection: &Connection,
        search: Option<&str>,
    ) -> StorageResult<Vec<TemplateRecord>> {
        let pattern = search.map(contains_pattern);
        let mut statement = connection.prepare(
            "SELECT id, family, name, visual_type, lifecycle_state, active_published_version_id, created_at, updated_at, provenance
             FROM templates
             WHERE ?1 IS NULL OR name LIKE ?1 ESCAPE '\\' COLLATE NOCASE OR visual_type LIKE ?1 ESCAPE '\\' COLLATE NOCASE
             ORDER BY name COLLATE NOCASE, id",
        )?;
        let records = statement
            .query_map([pattern], template_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(records)
    }

    pub fn list_versions(
        &self,
        connection: &Connection,
        template_id: &str,
    ) -> StorageResult<Vec<TemplateVersionRecord>> {
        let mut statement = connection.prepare(
            "SELECT id, template_id, version_number, document_json, created_by, created_at, published_at
             FROM template_versions WHERE template_id = ?1 ORDER BY version_number",
        )?;
        let versions = statement
            .query_map([template_id], template_version_from_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(versions)
    }

    pub fn add_version(
        &self,
        transaction: &Transaction<'_>,
        version: &TemplateVersionRecord,
        audit: &AuditEventRecord,
    ) -> StorageResult<()> {
        validate_id(&version.id)?;
        validate_id(&version.template_id)?;
        if version.version_number <= 0 {
            return Err(invalid_data("Template version numbers must be positive."));
        }
        if audit.entity_kind != "template_version"
            || audit.entity_id != version.id
            || audit.version_id.as_deref() != Some(version.id.as_str())
        {
            return Err(invalid_data(
                "Template version audit event must identify the version being added.",
            ));
        }
        let document_json = validate_template_document(&version.document)?;
        transaction.execute(
            "INSERT INTO template_versions(id, template_id, version_number, document_json, created_by, created_at, published_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![version.id, version.template_id, version.version_number, document_json, version.created_by,
                version.created_at, version.published_at],
        )?;
        if let Some(published_at) = &version.published_at {
            transaction.execute(
                "UPDATE templates SET active_published_version_id = ?1, lifecycle_state = 'Published', updated_at = ?2 WHERE id = ?3",
                params![version.id, published_at, version.template_id],
            )?;
        } else {
            transaction.execute(
                "UPDATE templates SET updated_at = ?1 WHERE id = ?2",
                params![version.created_at, version.template_id],
            )?;
        }
        append_audit_event(transaction, audit)?;
        Ok(())
    }

    pub fn set_active_published_version(
        &self,
        transaction: &Transaction<'_>,
        template_id: &str,
        version_id: &str,
    ) -> StorageResult<()> {
        validate_id(template_id)?;
        validate_id(version_id)?;
        let updated = transaction.execute(
            "UPDATE templates SET active_published_version_id = ?1, lifecycle_state = 'Published',
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?2
             AND EXISTS (SELECT 1 FROM template_versions WHERE id = ?1 AND template_id = ?2 AND published_at IS NOT NULL)",
            params![version_id, template_id],
        )?;
        if updated != 1 {
            return Err(invalid_data(
                "Published template version was not found for the requested template.",
            ));
        }
        Ok(())
    }
}

fn template_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TemplateRecord> {
    Ok(TemplateRecord {
        id: row.get(0)?,
        family: row.get(1)?,
        name: row.get(2)?,
        visual_type: row.get(3)?,
        lifecycle_state: row.get(4)?,
        active_published_version_id: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        provenance: row.get(8)?,
    })
}

fn template_version_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TemplateVersionRecord> {
    let raw: String = row.get(3)?;
    let document: Value = serde_json::from_str(&raw).map_err(to_sql_conversion_error)?;
    if validate_template_document(&document).is_err() {
        return Err(rusqlite::Error::InvalidColumnType(
            3,
            "document_json".to_owned(),
            rusqlite::types::Type::Text,
        ));
    }
    Ok(TemplateVersionRecord {
        id: row.get(0)?,
        template_id: row.get(1)?,
        version_number: row.get(2)?,
        document,
        created_by: row.get(4)?,
        created_at: row.get(5)?,
        published_at: row.get(6)?,
    })
}

fn to_sql_conversion_error(error: serde_json::Error) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(error))
}

fn contains_pattern(query: &str) -> String {
    format!(
        "%{}%",
        query
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    )
}

fn validate_template_document(document: &Value) -> StorageResult<String> {
    let root = document
        .as_object()
        .ok_or_else(|| invalid_data("TemplateDocument must be a JSON object."))?;
    if root.get("schema_version").and_then(Value::as_i64) != Some(1) {
        return Err(invalid_data(
            "Only TemplateDocument schema version 1 is supported.",
        ));
    }

    let page = root
        .get("page")
        .and_then(Value::as_object)
        .ok_or_else(|| invalid_data("TemplateDocument page is required."))?;
    for dimension in ["width_mm", "height_mm"] {
        let value = page
            .get(dimension)
            .and_then(Value::as_f64)
            .ok_or_else(|| invalid_data("Page dimensions must be finite numbers."))?;
        if !value.is_finite() || value <= 0.0 {
            return Err(invalid_data("Page dimensions must be positive and finite."));
        }
    }
    if !matches!(
        page.get("orientation").and_then(Value::as_str),
        Some("portrait" | "landscape")
    ) {
        return Err(invalid_data("Page orientation is invalid."));
    }

    let print = root
        .get("print_rules")
        .and_then(Value::as_object)
        .ok_or_else(|| invalid_data("TemplateDocument print rules are required."))?;
    let slots = print
        .get("slots")
        .and_then(Value::as_object)
        .ok_or_else(|| invalid_data("TemplateDocument print slots are required."))?;
    let rows = positive_integer(slots.get("rows"))?;
    let columns = positive_integer(slots.get("columns"))?;
    let copies = positive_integer(print.get("copies_per_page"))?;
    if rows.checked_mul(columns) != Some(copies) {
        return Err(invalid_data(
            "Print copy count must equal rows multiplied by columns.",
        ));
    }
    let gap = non_negative_number(print.get("gap_mm"))?;
    let margins = print
        .get("margins_mm")
        .and_then(Value::as_object)
        .ok_or_else(|| invalid_data("Print margins are required."))?;
    let margin = |side: &str| non_negative_number(margins.get(side));
    let width = page
        .get("width_mm")
        .and_then(Value::as_f64)
        .unwrap_or_default();
    let height = page
        .get("height_mm")
        .and_then(Value::as_f64)
        .unwrap_or_default();
    let horizontal = margin("left")? + margin("right")? + gap * (columns - 1) as f64;
    let vertical = margin("top")? + margin("bottom")? + gap * (rows - 1) as f64;
    if !horizontal.is_finite() || !vertical.is_finite() || horizontal >= width || vertical >= height
    {
        return Err(invalid_data(
            "Print margins and gaps leave no positive area for every slot.",
        ));
    }

    let repetition = root
        .get("repetition")
        .and_then(Value::as_object)
        .ok_or_else(|| invalid_data("TemplateDocument repetition rule is required."))?;
    match repetition.get("kind").and_then(Value::as_str) {
        Some("none") => {}
        Some("grid") => {
            positive_integer(repetition.get("rows"))?;
            positive_integer(repetition.get("columns"))?;
            non_negative_number(repetition.get("gap_x_mm"))?;
            non_negative_number(repetition.get("gap_y_mm"))?;
        }
        _ => return Err(invalid_data("TemplateDocument repetition rule is invalid.")),
    }
    let defaults = root
        .get("defaults")
        .and_then(Value::as_object)
        .ok_or_else(|| invalid_data("TemplateDocument defaults must be an object."))?;
    if defaults
        .get("font_family")
        .is_some_and(|value| !nonempty_string(value))
        || defaults
            .get("text_color")
            .is_some_and(|value| !valid_color_literal(value))
        || defaults
            .get("fill_color")
            .is_some_and(|value| !valid_color_literal(value))
    {
        return Err(invalid_data(
            "TemplateDocument defaults contain an invalid font or color.",
        ));
    }

    let elements = root
        .get("elements")
        .and_then(Value::as_array)
        .ok_or_else(|| invalid_data("TemplateDocument elements must be an array."))?;
    let supported = [
        "text",
        "rectangle",
        "band",
        "background",
        "line",
        "border",
        "image",
    ];
    let mut identifiers = HashSet::new();
    for element in elements {
        let item = element
            .as_object()
            .ok_or_else(|| invalid_data("TemplateDocument elements must be objects."))?;
        let id = item
            .get("id")
            .and_then(Value::as_str)
            .ok_or_else(|| invalid_data("Every element must have an ID."))?;
        validate_id(id)?;
        if !identifiers.insert(id) {
            return Err(invalid_data("TemplateDocument element IDs must be unique."));
        }
        if !item
            .get("type")
            .and_then(Value::as_str)
            .is_some_and(|kind| supported.contains(&kind))
        {
            return Err(invalid_data(
                "TemplateDocument element type is unsupported.",
            ));
        }
        for dimension in ["width_mm", "height_mm"] {
            let value = item
                .get(dimension)
                .and_then(Value::as_f64)
                .ok_or_else(|| invalid_data("Element dimensions must be numbers."))?;
            if !value.is_finite() || value <= 0.0 {
                return Err(invalid_data(
                    "Element dimensions must be positive and finite.",
                ));
            }
        }
        for position in ["x_mm", "y_mm", "rotation_degrees"] {
            let value = item
                .get(position)
                .and_then(Value::as_f64)
                .ok_or_else(|| invalid_data("Element geometry must be finite numbers."))?;
            if !value.is_finite() {
                return Err(invalid_data("Element geometry must be finite."));
            }
        }
        if item
            .get("z_index")
            .and_then(Value::as_f64)
            .is_none_or(|value| {
                !value.is_finite() || value.fract() != 0.0 || value.abs() > 9_007_199_254_740_991.0
            })
            || item.get("visible").and_then(Value::as_bool).is_none()
            || item.get("locked").and_then(Value::as_bool).is_none()
        {
            return Err(invalid_data(
                "Element paint order and visibility flags are required.",
            ));
        }
        if !valid_element_content(item) {
            return Err(invalid_data(
                "Element content, binding, style, or image fit is invalid.",
            ));
        }
        if item.get("type").and_then(Value::as_str) == Some("image") {
            if let Some(asset_id) = item
                .get("source")
                .and_then(Value::as_object)
                .filter(|source| source.get("kind").and_then(Value::as_str) == Some("asset"))
                .and_then(|source| source.get("asset_id"))
                .and_then(Value::as_str)
            {
                validate_id(asset_id)?;
            }
        }
    }

    Ok(serde_json::to_string(document)?)
}

fn valid_element_content(item: &serde_json::Map<String, Value>) -> bool {
    match item.get("type").and_then(Value::as_str) {
        Some("text") => {
            let Some(style) = item.get("style").and_then(Value::as_object) else {
                return false;
            };
            let weight = style.get("font_weight").is_some_and(|value| {
                matches!(value.as_str(), Some("normal" | "bold"))
                    || value
                        .as_f64()
                        .is_some_and(|number| number.is_finite() && number > 0.0)
            });
            valid_text_binding(item.get("content"))
                && style.get("font_family").is_some_and(nonempty_string)
                && style
                    .get("font_size_pt")
                    .and_then(Value::as_f64)
                    .is_some_and(|value| value.is_finite() && value > 0.0)
                && weight
                && matches!(
                    style.get("font_style").and_then(Value::as_str),
                    Some("normal" | "italic")
                )
                && matches!(
                    style.get("horizontal_align").and_then(Value::as_str),
                    Some("left" | "center" | "right")
                )
                && matches!(
                    style.get("vertical_align").and_then(Value::as_str),
                    Some("top" | "middle" | "bottom")
                )
                && style
                    .get("line_height")
                    .and_then(Value::as_f64)
                    .is_some_and(|value| value.is_finite() && value > 0.0)
                && matches!(
                    style.get("wrapping").and_then(Value::as_str),
                    Some("wrap" | "nowrap")
                )
                && matches!(
                    style.get("overflow").and_then(Value::as_str),
                    Some("clip" | "visible" | "ellipsis")
                )
                && matches!(
                    style.get("fit_policy").and_then(Value::as_str),
                    Some("none" | "shrink_to_fit")
                )
                && style.get("color").is_some_and(valid_color_binding)
        }
        Some("rectangle" | "band" | "background") => {
            let Some(style) = item.get("style").and_then(Value::as_object) else {
                return false;
            };
            style.get("fill").is_some_and(valid_color_binding)
                && style
                    .get("stroke")
                    .is_some_and(|value| value.is_null() || valid_color_binding(value))
                && style
                    .get("stroke_width_mm")
                    .and_then(Value::as_f64)
                    .is_some_and(|value| value.is_finite() && value >= 0.0)
        }
        Some("line" | "border") => {
            let Some(style) = item.get("style").and_then(Value::as_object) else {
                return false;
            };
            style.get("stroke").is_some_and(valid_color_binding)
                && style
                    .get("stroke_width_mm")
                    .and_then(Value::as_f64)
                    .is_some_and(|value| value.is_finite() && value > 0.0)
        }
        Some("image") => {
            let Some(source) = item.get("source").and_then(Value::as_object) else {
                return false;
            };
            let source_valid = match source.get("kind").and_then(Value::as_str) {
                Some("asset") => source
                    .get("asset_id")
                    .is_some_and(|value| value.as_str().is_some_and(|id| !id.trim().is_empty())),
                Some("binding") => source.get("path").and_then(Value::as_str) == Some("brand.logo"),
                _ => false,
            };
            source_valid
                && matches!(
                    item.get("fit").and_then(Value::as_str),
                    Some("contain" | "cover" | "stretch")
                )
        }
        _ => false,
    }
}

fn valid_text_binding(value: Option<&Value>) -> bool {
    let Some(binding) = value.and_then(Value::as_object) else {
        return false;
    };
    match binding.get("kind").and_then(Value::as_str) {
        Some("literal") => binding.get("value").and_then(Value::as_str).is_some(),
        Some("binding") => matches!(
            binding.get("path").and_then(Value::as_str),
            Some(
                "visual.name"
                    | "visual.location"
                    | "visual.flow"
                    | "visual.description"
                    | "visual.stock_class"
            )
        ),
        _ => false,
    }
}

fn valid_color_binding(value: &Value) -> bool {
    let Some(binding) = value.as_object() else {
        return false;
    };
    match binding.get("kind").and_then(Value::as_str) {
        Some("literal") => binding.get("value").is_some_and(valid_color_literal),
        Some("binding") => matches!(
            binding.get("path").and_then(Value::as_str),
            Some("visual.accent_color" | "brand.primary_color")
        ),
        _ => false,
    }
}

fn valid_color_literal(value: &Value) -> bool {
    let Some(color) = value.as_str() else {
        return false;
    };
    let digits = color.strip_prefix('#').unwrap_or("");
    matches!(digits.len(), 3 | 4 | 6 | 8)
        && digits
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

fn nonempty_string(value: &Value) -> bool {
    value
        .as_str()
        .is_some_and(|string| !string.trim().is_empty())
}

fn positive_integer(value: Option<&Value>) -> StorageResult<u64> {
    value
        .and_then(Value::as_u64)
        .filter(|number| *number > 0 && *number <= 9_007_199_254_740_991)
        .ok_or_else(|| invalid_data("Expected a positive integer in TemplateDocument print rules."))
}

fn non_negative_number(value: Option<&Value>) -> StorageResult<f64> {
    value
        .and_then(Value::as_f64)
        .filter(|number| number.is_finite() && *number >= 0.0)
        .ok_or_else(|| {
            invalid_data(
                "Expected a non-negative finite measurement in TemplateDocument print rules.",
            )
        })
}

#[cfg(test)]
mod validation_tests {
    use super::validate_template_document;
    use serde_json::json;

    #[test]
    fn accepts_a_valid_task_2_document_and_rejects_unsupported_versions() {
        let valid = json!({
            "schema_version": 1,
            "page": { "width_mm": 210, "height_mm": 297, "orientation": "portrait" },
            "print_rules": {
                "copies_per_page": 1,
                "margins_mm": { "top": 5, "right": 5, "bottom": 5, "left": 5 },
                "gap_mm": 0,
                "slots": { "rows": 1, "columns": 1 }
            },
            "repetition": { "kind": "none" },
            "defaults": {},
            "elements": []
        });
        assert!(validate_template_document(&valid).is_ok());
        assert!(validate_template_document(&json!({ "schema_version": 2 })).is_err());
    }

    #[test]
    fn rejects_incomplete_elements_and_missing_repetition_contract() {
        let mut invalid_element = json!({
            "schema_version": 1,
            "page": { "width_mm": 210, "height_mm": 297, "orientation": "portrait" },
            "print_rules": {
                "copies_per_page": 1,
                "margins_mm": { "top": 5, "right": 5, "bottom": 5, "left": 5 },
                "gap_mm": 0,
                "slots": { "rows": 1, "columns": 1 }
            },
            "repetition": { "kind": "none" }, "defaults": {},
            "elements": [{ "id": "text-1", "type": "text", "x_mm": 0, "y_mm": 0,
                "width_mm": 10, "height_mm": 5, "rotation_degrees": 0 }]
        });
        assert!(validate_template_document(&invalid_element).is_err());
        invalid_element["elements"] = serde_json::json!([]);
        invalid_element
            .as_object_mut()
            .expect("object")
            .remove("repetition");
        assert!(validate_template_document(&invalid_element).is_err());
    }
}
