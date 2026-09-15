# Changelog

All notable changes to Infospector. Format: [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).
Pull requests add their entry under **Unreleased**; a release moves it under a version.

## [Unreleased]

### Added
- The glass controls live in a **Material & Light** flyout — the context panel stays short, and picking "Material & Light" opens the sliders in a side panel that lands on whichever side has room and never runs off-screen.
- Directional lighting for the glass under Appearance: **Shine** (a light on the lit side), **Shadow** (a darkness on the far side), and one **Angle** that points both (0° is straight above), plus a **Radius** dial for how round the glass panels are (the toolbar keeps its concentric shape). The old drop-shadow dial is now named **Distance**. All ship in the copied `config.js` and default to the current look.
- A built-in **glass color picker** replaces the browser's default color dialog on every swatch (Pattern, Background, Accent, Tint, and first-run Accent). Drag the saturation/brightness square, slide the hue and — where it applies — opacity, or type a value; recently used colors are remembered across sessions.
- The picker's value reads in **HEX, RGB, HSL, HSB, or CSS** (the CSS field takes any CSS color, named colors included). HEX is the default and the tool remembers the format you last chose. A **copy button** to the right of the boxes copies the value to the clipboard.
- An **eyedropper** in the picker samples a color from anywhere on screen — outside the browser window included — in browsers that support it (Chrome, Edge, and other Chromium browsers). Where the browser has no such capability (Firefox, Safari), the eyedropper is hidden, since no web page can read pixels outside itself there.
- A **Padding** dial (under Radius) for the space inside the toolbar and menus.
- A **✕** in the context panel's top-right corner closes it (and any open flyout).

### Changed
- The chrome's corners are now **concentric by formula**: one **Radius** and **Padding** drive every nested corner. In the menus and context panel an inner item rounds to `radius − padding − border`; in the toolbar, the buttons, size selector and URL bar round to the Radius (capped at a full 18px pill) and the bar wraps them at `item + padding + border` — so dialing Radius reshapes the whole chrome together, and it stays concentric at any padding.
- The size dropdown's chevron is a lucide chevron (rotates up when open); more room between the dimensions and the scale %, less between the % and the chevron.
- New defaults: **Radius 40px** and **Padding 8px** (the Radius dial now runs to 60). The toolbar stays a full pill either way — its items cap at 18px.

### Fixed
- The stage is now a plain **rounded rectangle at every size** — desktop sizes no longer square off their top corners. With rulers on, the three corners the ruler strips run past (top-left, **top-right**, and bottom-left) go flat and only the free bottom-right corner keeps its radius.
- The **stage message overlays** ("This page can't be framed") are readable again: they now carry their own near-opaque, theme-aware surface and ink, so turning the glass opacity down no longer makes them wash out, and each is topped with a ghosted Infospector glyph.

## [0.5.1] — 2026-09-14

### Fixed
- The **Item Info** panel now keeps its dark, high-contrast look over any page — a light page behind it used to bleed through the glass and wash the text out. It reads the same whether the page you're reviewing is light or dark.

## [0.5.0] — 2026-09-14

### Added
- Infospector now wears its own mark: the **official glyph** is the Inspect button's icon (and the demo tile's), replacing the stand-in.
- A fresh browser opens the stage at **1024 × 768**. Resize it once and Infospector remembers your size from then on. An install's `config.js` (`INFOSPECTOR_START_SIZE`) still overrides both.

### Security
- The notes bridge server binds to `127.0.0.1` only, never all interfaces.
- Bridge CORS allowlists `localhost` / `127.0.0.1` / `[::1]` origins instead of `*`.
- `?bridge=` is honored only when it points at a localhost host; `?url=` is ignored unless it resolves to the same origin.

### Fixed
- The bundled test server's path-containment check no longer matches sibling directories that share a name prefix.

## [0.4.0] — 2026-09-13

### Added
- **Rotate** button (left of Inspect, `arrow-left-right`): swaps the stage's width and height — landscape ↔ portrait. It changes the size only; the canvas never turns.

### Changed
- iPhone Duo Inner preset is landscape (2670 × 1878).

### Fixed
- **Esc pressed while the page has focus** now reaches the escape hatch too, so it leaves Inspect (and deselects/closes everything) no matter where the keyboard focus is.
- A click into the page also clears a lingering resize outline.

## [0.3.1] — 2026-09-13

### Changed
- **Esc is a global escape hatch**: one press leaves Inspect and peek, deselects, and closes every open popover, menu, sheet, note, and the size/search dropdowns.

### Fixed
- The resize outline no longer lingers after a corner drag — it clears on release, on a press anywhere else, and when the window loses focus (and survives a cancelled/interrupted drag).
- Clicking off a selected element (empty canvas, or anywhere outside it) now deselects it and hides the Item Info box; it used to stick until you pressed Esc.
- Clicking a guide or dragging one out of a ruler no longer deselects the element (the wrap guides belong to the selection and were vanishing under the click).

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

[Unreleased]: https://github.com/qmanning/infospector/compare/v0.5.1...HEAD
[0.5.1]: https://github.com/qmanning/infospector/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/qmanning/infospector/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/qmanning/infospector/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/qmanning/infospector/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/qmanning/infospector/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/qmanning/infospector/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/qmanning/infospector/releases/tag/v0.1.0
