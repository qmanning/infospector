# Changelog

All notable changes to Infospector. Format: [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).
Pull requests add their entry under **Unreleased**; a release moves it under a version.

## [Unreleased]

## [0.3.0] — 2026-09-13

### Added
- **Shift+drag while peeking** (Inspect off) draws an area selection; Inspect turns on as it lands.
- Clicking anywhere on the canvas (background, rulers, or inside the page) hides open note containers; unsaved text is kept until you reopen the marker.
- Right-click → **Start-up**: choose the stage size Infospector opens with (Fit to Window by default, Last used, or any preset) and the page it opens; both go into the config snippet (`INFOSPECTOR_START_SIZE`).
- Pressing Enter on the page already on stage reloads it; loading is now visible.
- Inspect button uses Lucide's `vector-square` icon.
- Doctor flags preview deployments behind a login (Vercel/Netlify protection) — the stage can't frame those.

### Fixed
- Leaving a note (from an element, a guide, or a gap readout) now focuses the textarea so you can type immediately — the modal was being repainted right after opening, detaching the node that had been focused.

## [0.2.0] — 2026-09-13

### Added
- **⇧⌥⌘Space** captures the screen exactly as it is — open menus, tooltips, the guide menu, gap readouts, sheets and note modals are all in the picture.
- Screenshot progress: the stage dims with a scan-line sweep until the image is ready.
- **Guides snap** to element edges (and other guides) while dragging, and remember what they snapped to.
- **Guide menu**: click a guide for Leave Note / Delete / Delete All; notes can live on a guide.
- **⌘-hover** between two guides shows the distance; clicking it creates a guide carrying a note on that space.
- **Shift+click** while peeking locks that element in (Inspect on, element selected).
- **⌘K** focuses the search; a **shortcuts** panel (`?`, or the button under the stage).
- Bundled **welcome page** as the first page on a fresh install; **first-run setup** card; **`?doctor`** self-check and `window.__infospector.doctor()`.
- Page discovery: sitemap.xml, links learned from loaded pages, `pages.json` / `window.INFOSPECTOR_PAGES`.
- Appearance: **Backing** layer, **Accent** color, theme-aware colors, WCAG-driven UI ink; **Reset** returns to the shipped look.
- Item Info: click any field to copy it; box widens to the element.
- Unit tests (`node --test`) and Playwright e2e; `lib.js` for the pure helpers.

### Changed
- Item Info box waits a 2 s dwell before appearing on hover (a click is immediate).
- Guide labels read `X: 288` / `Y: 428` and sit on their line; measurements are red everywhere.
- Primary action is on the **right** in every button pair.
- Note modals sit above the persistent chrome; menus you open sit above notes.
- Dark theme has its own dark default glass tint.
- Refraction removed.

### Fixed
- First-run setup re-asked on every new origin or cleared storage; it now only appears on a truly untouched, unconfigured install.
- "Clear all notes" silently did nothing in embedded browsers (native `confirm()`); replaced with an in-app confirm.
- Ruler wrap: the wrap container sat off-screen; guides resurrected after deletion; Delete key lost to the page.
- Right-click menu could be cut off at the viewport edge.
- Guide labels hidden under the ruler canvases ("8" and "2").

## [0.1.0] — 2026-09-12

First working version: device stage, select-first inspection, notes with element identity, rulers and guides, screenshots, file bridge, robot API.

[Unreleased]: https://github.com/qmanning/infospector/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/qmanning/infospector/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/qmanning/infospector/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/qmanning/infospector/releases/tag/v0.1.0
