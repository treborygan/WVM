# ADR-002: SVG-native editor and shared render model

- **Status:** Accepted for V1
- **Context:** The POC demonstrates live preview and vector output, but browser DOM state or screenshot printing can diverge from physical geometry. V1 must support precise mm layout and deterministic output.
- **Decision:** Persist all geometry in millimetres. Use an SVG-native editing/preview surface. Build RenderScene from the canonical document and immutable domain inputs; the renderer must not use browser DOM layout as truth. Editor and export share scene-building/render logic. A canvas library requires a future ADR showing better preservation of mm geometry, vector output, text behavior, layering, and maintainability.
- **Alternatives considered:** HTML/CSS print layout; raster canvas; Fabric.js/Konva; SVG-native editor and pure render-scene pipeline.
- **Consequences:** Pointer coordinates must be transformed through viewport scale; text metrics and PDF conversion require explicit policies. Scene tests and golden outputs become primary verification, with screenshots as supplementary evidence.
- **Migration/replacement path:** Replace only the view adapter if needed; retain TemplateDocument, mm geometry, RenderScene, SVG semantics, and conformance tests.
