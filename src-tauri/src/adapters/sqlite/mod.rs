mod asset_repository;
mod template_repository;
mod visual_repository;

use std::error::Error;
use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::{Connection, Transaction, TransactionBehavior};

pub use asset_repository::{AssetRecord, AssetRepository};
pub use template_repository::{TemplateRecord, TemplateRepository, TemplateVersionRecord};
pub use visual_repository::{VisualRecord, VisualRepository, VisualVersionRecord};

use visual_repository::AuditEventRecord;

pub type StorageResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

const INITIAL_SCHEMA: &str = include_str!("migrations/0001_initial.sql");
const MIGRATIONS: [Migration; 1] = [Migration {
    version: 1,
    name: "0001_initial.sql",
    sql: INITIAL_SCHEMA,
}];

struct Migration {
    version: i64,
    name: &'static str,
    sql: &'static str,
}

/// Creates configured SQLite connections and applies ordered schema migrations.
/// The caller is responsible for passing a platform-local application-data path.
pub struct SqliteDatabase {
    path: PathBuf,
}

impl SqliteDatabase {
    pub fn open(path: impl AsRef<Path>) -> StorageResult<Self> {
        let path = path.as_ref().to_path_buf();
        let mut connection = Connection::open(&path)?;
        configure_connection(&connection)?;
        apply_migrations(&mut connection, &MIGRATIONS)?;
        Ok(Self { path })
    }

    pub fn connect(&self) -> StorageResult<Connection> {
        let connection = Connection::open(&self.path)?;
        configure_connection(&connection)?;
        Ok(connection)
    }

    pub fn transaction<T>(
        &self,
        operation: impl FnOnce(&Transaction<'_>) -> StorageResult<T>,
    ) -> StorageResult<T> {
        let mut connection = self.connect()?;
        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let value = operation(&transaction)?;
        transaction.commit()?;
        Ok(value)
    }

    pub fn schema_version(&self) -> StorageResult<i64> {
        let connection = self.connect()?;
        current_schema_version(&connection)
    }
}

fn configure_connection(connection: &Connection) -> StorageResult<()> {
    connection.busy_timeout(Duration::from_secs(5))?;
    connection.pragma_update(None, "foreign_keys", true)?;
    let enabled: i64 = connection.pragma_query_value(None, "foreign_keys", |row| row.get(0))?;
    if enabled != 1 {
        return Err(invalid_data(
            "SQLite foreign-key enforcement could not be enabled.",
        ));
    }
    Ok(())
}

fn current_schema_version(connection: &Connection) -> StorageResult<i64> {
    let version = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    Ok(version)
}

fn apply_migrations(connection: &mut Connection, migrations: &[Migration]) -> StorageResult<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY CHECK (version > 0),
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );",
    )?;

    let mut statement =
        connection.prepare("SELECT version, name FROM schema_migrations ORDER BY version")?;
    let applied = statement
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(statement);

    let mut current = 0;
    for migration in migrations {
        if migration.version <= 0 {
            return Err(invalid_data("Migration versions must be positive."));
        }
        if let Some((_, name)) = applied
            .iter()
            .find(|(version, _)| *version == migration.version)
        {
            if name != migration.name {
                return Err(invalid_data(&format!(
                    "Migration version {} is already recorded as '{}', not '{}'.",
                    migration.version, name, migration.name
                )));
            }
            current = migration.version;
            continue;
        }
        if migration.version != current + 1 {
            return Err(invalid_data(&format!(
                "Expected migration version {}, received {}.",
                current + 1,
                migration.version
            )));
        }

        let transaction = connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
        transaction.execute_batch(migration.sql)?;
        transaction.execute(
            "INSERT INTO schema_migrations(version, name) VALUES (?1, ?2)",
            (migration.version, migration.name),
        )?;
        transaction.commit()?;
        current = migration.version;
    }

    if current_schema_version(connection)?
        > migrations.last().map_or(0, |migration| migration.version)
    {
        return Err(invalid_data(
            "The database was created by a newer WVM schema version.",
        ));
    }
    Ok(())
}

fn validate_id(value: &str) -> StorageResult<()> {
    if value.is_empty()
        || value.encode_utf16().count() > 128
        || value.trim() != value
        || value
            .chars()
            .any(|character| matches!(character as u32, 0x00..=0x1f | 0x7f..=0x9f))
    {
        return Err(invalid_data(
            "Entity IDs must contain 1–128 characters without controls or surrounding whitespace.",
        ));
    }
    Ok(())
}

fn validate_lifecycle_state(value: &str) -> StorageResult<()> {
    if !matches!(value, "Draft" | "Review" | "Published" | "Retired") {
        return Err(invalid_data("Unknown lifecycle state."));
    }
    Ok(())
}

fn append_audit_event(connection: &Connection, event: &AuditEventRecord) -> StorageResult<()> {
    validate_id(&event.id)?;
    validate_id(&event.entity_id)?;
    if let Some(version_id) = &event.version_id {
        validate_id(version_id)?;
    }
    if !matches!(
        event.entity_kind.as_str(),
        "brand_profile"
            | "asset"
            | "template"
            | "template_version"
            | "visual"
            | "visual_version"
            | "legacy_source_reference"
    ) || event.action.trim().is_empty()
        || !event.details.is_object()
    {
        return Err(invalid_data(
            "Audit event kind, action, or details are invalid.",
        ));
    }
    let details = serde_json::to_string(&event.details)?;
    connection.execute(
        "INSERT INTO audit_events(id, entity_kind, entity_id, version_id, action, occurred_at, actor, details_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![event.id, event.entity_kind, event.entity_id, event.version_id, event.action,
            event.occurred_at, event.actor, details],
    )?;
    Ok(())
}

fn invalid_data(message: &str) -> Box<dyn Error + Send + Sync> {
    Box::new(io::Error::new(
        io::ErrorKind::InvalidData,
        message.to_owned(),
    ))
}

#[cfg(test)]
#[path = "tests/repository_tests.rs"]
mod tests;
