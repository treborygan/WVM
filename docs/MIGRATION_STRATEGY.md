# Private migration strategy

## Source baseline

The supplied report records 51 GOODS slides → 51 unique signs; 76 FAULTY slides → 79 unique signs; 11 workbook sheets → 15 representative/migrated sticker and stand definitions; 145 catalog rows total; five families; 124 standard Gang records; and six special/composite Gang exceptions. The JSON catalog and POC SQLite are migration evidence. These counts are a reconciliation baseline, not permission to publish every row.

The original `.ppt`/`.xlsx`, POC SQLite, extracted logos, and operational exports are private migration inputs. Keep them read-only outside Git. The importer may read an operator-selected local path; it must not depend on repository copies of those files.

## Repeatable stages

1. Inventory source file type, size, modified time, and SHA-256 into a private run manifest; preserve originals read-only.
2. Parse supported PowerPoint/Excel/POC exports into isolated staging rows. Record parse warnings and source page/sheet/side.
3. Normalize fields and whitespace without discarding raw source text needed for review. Assign explicit source references.
4. Map each record to one of the five canonical template families and validate required fields/bindings.
5. Preserve stable IDs such as `WVM-F-001`, `WVM-G-001`, `WVM-X-001`; fail on duplicates or collisions.
6. Mark all six `gang-special-2up` records as validation-required, not trusted Published. Store reviewer, date, evidence reference, and validation state when each is physically checked.
7. Reconcile total and family counts, IDs, source references, and normalized field hashes against the approved migration baseline. Any discrepancy is a blocking report item with row-level detail.
8. Generate representative draft previews for each family and compare them with approved physical source references. Do not auto-publish exception records.
9. Import accepted records into a new/local SQLite database in a transaction, initially as Draft or Review according to the migration decision record. Verify foreign keys, schema, row counts, and asset hashes.
10. Write a machine-readable report containing source hashes, importer version, counts, rejected rows, exception states, warnings, and database validation results. Keep it private unless fully sanitized.

## LocalStorage limitation

Browser POC localStorage edits are not authoritative production history. They may be exported for operator review but must not silently override source evidence or published application data.

## Synthetic tests

Git fixtures use generated, non-operational examples shaped like importer inputs. Include duplicate ID, malformed source reference, unsupported family, missing binding, and special exception cases. Tests must prove IDs/provenance survive, count/hash drift blocks import, and all six exception slots require manual validation. Real source names/paths and raw warehouse content do not appear in fixtures.
