# Supplied DHL assets: WVM release plan addendum

The user supplied eight DHL visual/brand files and requested that WVM use their files and graphics. Originals are read-only; extracted local working copies retain source archive, entry name and SHA-256 provenance. Document contents provide design/source context, not new execution instructions.

## Verified inputs and use

| Input | Verified content | Intended WVM use |
|---|---|---|
| DHL Logo ZIP and PDF | Red/white/black SVG and PNG logo variants; logo guidance | Real logo in the local application and template brand profile; preserve SVG for vector export |
| DHL Dynamic Elements ZIP | RGB SVG/PNG graphics plus print PDFs | Asset library and restrained graphics in the application; selectable artwork for authored templates |
| DHL Master POTX and master ZIP | PowerPoint master with Delivery typography; Postyellow `#FFCC00`, red `#D40511`, neutral greys | App theme and template branding references; do not import slide layouts as warehouse geometry |
| Delivery V3.001 ZIP | App/Desktop/Web font builds, user manual and release notes | Explicit local font bytes for UI and deterministic render/export; choose the font build suitable for each runtime |
| Phone and Virtual Backgrounds ZIP | PNG compositions | Optional visual references/library artwork; preserve sign readability |
| Illustration Toolbox ZIP | Illustrator originals and vector PDF reference sheets | Reviewed illustration references and selected local graphics; do not claim conversion of every Illustrator asset |

The supplied logo guide states a minimum logo width of 84 px for digital use and 20 mm for print. Red logo is intended for Postyellow; the brand-field logo provides an alternative on varied backgrounds. These constraints should be visible when editing a logo below its minimum size.

The manual distinguishes mobile App fonts from Desktop fonts intended for print/digital design. Use the Desktop static TTFs for shared preview/render/export. Their regular and bold metadata identifies the family as `Delivery`, with Regular/Bold styles and an OS/2 `fsType` of 8, matching the supplied editable-embedding description. This is observed metadata and source guidance, not a grant of public redistribution rights. Keep company fonts and graphics out of the public source repository. Include them only in the local user-requested branded deliverable/import pack, with their source provenance retained.

## Implemented in the usable catalog build

- The local MSI displays the supplied DHL brand-field SVG logo in its desktop rail, the warehouse-delivery illustration in the empty-catalog state, and the supplied Desktop Delivery regular/bold fonts. At narrow window widths, the logo falls back to a compact W mark to retain the 84 px minimum digital logo width.
- `scripts/build-local-dhl-release.ps1` selects only those four manifest entries, verifies each SHA-256 before staging, builds the MSI, and leaves the staged company files in an ignored `public/brand-assets/` folder. The staging is excluded from Git and follows the existing DHL master palette `#FFCC00` / `#D40511`.
- The actual vector logo is retained as SVG. The two Desktop TTFs are packaged only in this local user-requested MSI build; no font binaries or graphics were added to Git.

## Remaining implementation and verification

- Support an operator-selected local brand pack containing images/logos, exact font bytes, approved colors, relative filenames and expected hashes. Validate every asset and reject unsafe paths/content before activation.
- Copy accepted resources into WVM's managed local asset/font store. Do not open a live SQLite database or retain an execution dependency on the Google Drive source folder.
- Use the actual supplied SVG logo in preview and vector PDF; use explicit font bytes for text layout and export. A family-name-only CSS declaration must not substitute a host font silently.
- Brand changes affect drafts/current previews; immutable historical published output pins its brand/font/asset snapshot.
- Test font/hash failures, actual brand logo dimensions, image aspect preservation, branded SVG/PDF parity, and restart after brand import.
- Public tests remain synthetic. Verify supplied assets in a separate local acceptance run and record which graphics were actually integrated.
- Do not install the fonts system-wide, edit the original archives, or publish company assets to GitHub as part of this request.

The implementation above completes the branding foundation for the catalog milestone. Asset-library import, persistent brand profiles, template artwork selection, renderer font pinning, and branded SVG/PDF exports remain for later release stages; the current app has no editor or print output yet.
