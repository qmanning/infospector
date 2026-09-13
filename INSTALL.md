# Installing Infospector — a checklist for AI assistants

You are setting up **Infospector**, a zero-dependency static tool (one folder of HTML/CSS/JS) that
lets a person review pages of this project in a device-sized stage, click elements, and leave
notes that you can read back (with a unique selector, component chain, and box metrics per note).
Follow the steps in order. Ask the questions in step 4 as a single batch; don't ask anything else
unless a step fails.

## 0. Ground rules

- **Same origin is mandatory.** The tool must be served by the same dev/prod server as the pages
  it reviews. Never host it elsewhere or proxy it.
- **Do not modify files inside the `infospector/` folder** except `config.js` and `pages.json`.
  Everything else is the tool; updates replace it wholesale.
- **Do not add build steps, bundler config, or dependencies.** If the framework needs anything to
  serve a static folder, it's already doing it for images.

## 1. Detect the framework and its static directory

Look at the project root and pick the first match:

| evidence | framework | static dir | URL prefix |
| --- | --- | --- | --- |
| `next.config.*` | Next.js | `public/` | `/` |
| `vite.config.*` | Vite (React/Vue/Svelte SPA) | `public/` | `/` |
| `astro.config.*` | Astro | `public/` | `/` |
| `svelte.config.*` + `src/routes` | SvelteKit | `static/` | `/` |
| `nuxt.config.*` | Nuxt | `public/` | `/` |
| `remix.config.*` / `app/root.tsx` | Remix | `public/` | `/` |
| `config/routes.rb` | Rails | `public/` | `/` |
| `artisan` | Laravel | `public/` | `/` |
| `manage.py` | Django | a dir in `STATICFILES_DIRS` | `/static/` |
| `hugo.toml` / `config.toml` + `content/` | Hugo | `static/` | `/` |
| `_config.yml` | Jekyll | root or `assets/` | `/` |
| `wp-config.php` | WordPress | `wp-content/` | `/wp-content/` |
| `index.html` at root, no framework | static site | project root | `/` |

If nothing matches, ask the user where static files are served from (one question).

## 2. Copy the folder

Copy the whole `infospector/` folder to `<static dir>/labs/infospector/` (create `labs/`). Keep
the folder name `infospector`. Result must contain at least: `index.html`, `host.css`, `host.js`,
`inspector.js`, `adapters.js`, `config.js`, `README.md`, `LICENSE`, `vendor/html-to-image.js`.

If the project has a `.gitignore` rule that would exclude it (e.g. ignoring `public/labs`), tell
the user rather than editing the ignore file.

## 3. Verify it serves

Start the dev server (whatever the project already uses), then confirm, with a browser tool if
you have one, otherwise `curl -I`:

- `GET <origin>/labs/infospector/index.html` → 200, `text/html`
- `GET <origin>/labs/infospector/host.js` → 200, `application/javascript` (or `text/javascript`)
- `GET <origin>/` (a real page) → response headers do **not** contain `X-Frame-Options: DENY` or
  `Content-Security-Policy: … frame-ancestors 'none'`. If they do, propose the one-line change to
  `SAMEORIGIN` / `frame-ancestors 'self'` in the project's header config and ask before applying.

If you have a browser tool: open `<origin>/labs/infospector/?doctor`, wait ~2s, and read the
"Setup check" list. Every row should be ✓ except optional ones (Sitemap, pages.json, Links
learned) which may be –. Alternatively run `await window.__infospector.doctor()` and inspect the
returned array of `{ name, status, detail }`; `status` must not be `fail`.

## 4. Ask the user (one batch)

1. **Default page** — which path should open first? (default `/`)
2. **Pages list** — should I write a `pages.json` naming the key pages? (I can generate it from the
   routes I can see: list them.) Optional; the tool also reads `/sitemap.xml` and learns links.
3. **Notes storage** — keep notes in the browser (default), or run the file bridge so notes land
   in `infospector-notes.json` where I can read and update them? (Recommended if they want me to
   act on notes.)
4. **Look** — dark or light by default, and an accent color? (default: dark, blue)
5. **Link it** — add a link to the tool anywhere (a dev-only nav item, a README line)? (default no)

## 5. Write config

Edit `<static dir>/labs/infospector/config.js` only (it's already there with commented examples):

```js
window.INFOSPECTOR_HOME = "/";                       // from Q1
window.INFOSPECTOR_BRIDGE = "http://localhost:7331"; // only if Q3 = bridge
window.INFOSPECTOR_PAGES = [                         // only if Q2 = yes (or write pages.json)
  { title: "Home", path: "/", type: "page" },
];
window.INFOSPECTOR_DEFAULTS = {                      // only if Q4 differs from defaults
  bg: { accent: "#4f8cff" },
};
```

`type` is a free label shown as a badge (`page`, `project`, `post`…). For the theme default the
user can pick it in the first-run card; there is no config key for theme (it's per browser).

If Q3 = bridge, add a script to the project's package.json (or tell the user the command):
`node <static dir>/labs/infospector/server.mjs --file .infospector-notes.json`, and add
`.infospector-notes.json` to `.gitignore` unless the user wants notes committed.

## 6. Report

Tell the user, in this order: the URL to open, what you configured (from step 5), the doctor
result (paste the rows), and the one-line reminder that notes they leave can be read with
`window.__infospector.listNotes()` in the tool's tab or from the notes file when the bridge runs.
Then stop.

## Reading notes later (for the agent)

- **Browser:** in the Infospector tab, `window.__infospector.listNotes()` returns
  `[{ id, targetId, text, state, element: { selectors, components, rect, … } }]`;
  `setNoteState(id, "noted" | "done")` updates the marker the user sees.
- **File bridge:** read `infospector-notes.json`; flip a note's `state` in the file and the browser
  picks it up on its next poll. `README.md` documents the full schema.
