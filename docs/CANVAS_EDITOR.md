# Canvas editor specification

## Canonical coordinate system

Persist all page and element geometry in millimetres. The page origin is top-left; x increases right and y increases down. Geometry values are finite decimals. Pixel values are transient viewport coordinates only.

The SVG user coordinate system uses 1 user unit = 1 mm. The viewport transform is `screen_px = (document_mm × css_px_per_mm × zoom) + pan_px`; pointer deltas are inverted through zoom and CSS scale before becoming millimetres. CSS px per mm is derived from the fixed CSS reference conversion 96 px/in ÷ 25.4 mm/in. Device pixel ratio affects raster display only, not persisted geometry. Numeric inspector values are the authoritative physical values.

Text font size is stored in points. SVG font units are resolved using the standard 1 pt = 25.4/72 mm conversion. Font family and fallback behavior are specified in `RENDERING_PIPELINE.md`.

## Viewport and selection

- Show a page/artboard at its physical aspect ratio with optional rulers, a configurable millimetre grid, zoom controls (fit, 25%, 100%, 400%), and pan.
- Selection is single-element in V1. Multi-select and group transforms are a low-risk extension only after single-element operations are complete and undoable.
- Selected elements expose bounding box, eight resize handles, and rotation only if enabled for the element type. Locked elements cannot be dragged/resized. Hidden elements are absent from rendered preview and selectable through Layers.
- The inspector remains available for exact x/y/width/height, page dimensions/orientation, style, bindings, and layer controls.

## Interaction rules

- Drag: record initial pointer and element positions; transform screen delta by the inverse viewport scale; apply optional snap; commit one immutable move command on pointer-up. Cancel on Escape or pointer cancellation.
- Resize: use the opposite anchor to preserve position; inverse-transform pointer delta; enforce positive minimum size and element-specific aspect rules; snap final edges/centres if enabled. No zero/negative geometry is persisted.
- Keyboard nudging moves 1 mm per arrow key and 10 mm with Shift. Alt+arrow uses the configured snap step. Undo/redo use Ctrl+Z/Ctrl+Y and accessible buttons. Focused text inputs retain native editing shortcuts.
- Grid snap defaults to 1 mm and is configurable. Alignment guides snap to page edges/centres and visible unlocked element edges/centres within a 3 CSS px tolerance converted through viewport scale. A status hint identifies the active target.
- Out-of-page elements remain visible with a warning boundary to allow correction. Publication validation blocks unexpected overflow; the TemplateDocument may declare intentional bleed/margins.
- Every accepted pointer gesture or inspector apply is one domain command. Invalid numeric input remains in the editor field with an error and does not mutate the document.

## Typography, assets, layers

Text controls cover family, point size, weight/style, horizontal and vertical alignment, line height, wrapping/overflow, fit behavior, and color. Shapes support fill, stroke, and width. Images/logos support asset selection, x/y/width/height, preserved aspect ratio by default, and explicit crop/contain policy. Layers list paint order and provide raise/lower/front/back, visibility, and lock toggles.

Binding controls choose either literal values or the allow-listed visual/brand paths in `DATA_MODEL.md`. Unresolved paths show the binding name and diagnostic rather than blanking silently.

## Undo, save, and accessibility

Undo/redo is a deterministic command history over domain document updates: each command stores its typed before/after values or reversible operation, has a stable command ID, and applies to the canonical document. Consecutive nudges may coalesce only within a documented time window; committed drag/resize is one command. History is not a DOM snapshot. Save persists the draft document/version; history state is editor-local until save.

Show unsaved changes. Close/navigation prompts offer save, discard, or cancel. Keyboard access must cover select by layer list, exact inspector edits, z-order, lock/visibility, undo/redo, and zoom/pan. Controls have labels, focus indicators, and non-color-only state cues. SVG canvas selection has an accessible companion layer list and inspector.

## Invariants

- Same intended physical pointer movement yields the same mm geometry at 25%, 100%, and 400% zoom.
- Browser zoom, display scaling, and device pixel ratio cannot alter stored mm values.
- Dimensions are finite and positive; duplicate element IDs and unsupported types are rejected.
- Preview scene and export use the same canonical document, binding, brand, and asset resolution.
