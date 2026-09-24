# Rendering pipeline

## Canonical path

`TemplateVersion + VisualVersion + BrandProfile + Assets -> resolved bindings -> RenderScene -> SVG -> vector PDF -> print handoff`

The pipeline is deterministic and consumes immutable domain inputs. The editor preview uses the same RenderScene builder and SVG renderer. It does not serialize browser DOM or capture screenshots.

## Inputs and resolution

The render request identifies exact template and visual version IDs, brand profile revision, asset hashes, output page/sheet rules, and renderer version. Binding resolution accepts only typed allow-listed paths. Literal text remains literal; derived display text is built from structured values. Missing binding, unsupported schema, missing asset, corrupt asset hash, or unavailable font returns a structured diagnostic with entity/element ID and remedy.

Brand colors and typography resolve from explicit element settings first, then template defaults, then brand tokens. Logo bytes are referenced through Asset metadata and embedded in SVG as deterministic data URIs for portable output. Hash identity and media type are retained in render metadata.

## Units, text, and layout

Persisted geometry is millimetres. SVG uses `width="<mm>mm"`, `height="<mm>mm"`, and a viewBox expressed in mm with 1 SVG unit per mm. Text sizes are points in the domain and emitted as equivalent physical units using `1 pt = 25.4/72 mm`; tests assert the conversion and page dimensions. Line-height and baseline rules are explicit in the renderer and covered by golden text fixtures.

Font resolution order is exact requested family, then a configured deterministic fallback bundled/approved for the application, otherwise a blocking diagnostic. Silent host-dependent substitution is prohibited for published export. Text wrapping uses the same measurement implementation for preview and export; overflow is reported, clipped, wrapped, or fitted according to the element's explicit policy.

## Sheet composition

Template print rules define page dimensions, orientation, margins, gaps, slot count, slot rectangles, and reading order. V1 supports 2-up, 3-up, and 12-up. Validate every slot lies within the physical page and that margins/gaps do not overlap. Each copy maps the same resolved source scene into the declared slot transform.

## Output and print

SVG is the canonical vector artifact. PDF generation converts vector SVG/scene geometry without rasterizing the page and preserves page dimensions. Print preview reports output page size and effective scale. The handoff to OS printing is a separate platform adapter; printer-specific settings never change template geometry. Browser print is optional convenience and cannot be the only acceptance output.

## Determinism and verification

For identical version IDs, content hashes, renderer version, and declared fonts, output bytes or normalized SVG structure are stable. Exclude wall-clock values, random IDs, machine paths, and environment-specific metadata from output. Golden tests compare normalized scene/SVG structure and assert physical width/height/viewBox values; PDF tests inspect page boxes and representative vector/text geometry. Missing font/asset tests assert actionable diagnostics or the exact declared fallback. Editor/export parity compares element geometry and resolved content at the scene level.
