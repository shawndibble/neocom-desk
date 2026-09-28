# Scope decisions — Feature SDE files load on demand, not precached

_Recorded 2026-09-28._

- **The six large single-feature SDE files are no longer in the install precache; they are fetched on first use and cached cache-first by the service worker.** Before this, `vite.config.ts` precached every `public/data/*.json` — ~10.5 MB raw (~1 MB gzip) downloaded on every install and re-validated on every deploy, for files most sessions never open. Moved out (`globIgnores`), with the feature that now needs a network connection the _first_ time it is used on a device:
  - `masteries.json` (2.9 MB) — Ship Tree mastery badges, the fitting Mastery chip.
  - `blueprints.json` (1.6 MB) — Industry blueprint catalogue, BPC sourcing, the build-plan context menu.
  - `reprocessing.json` (1.5 MB) — Market appraisal's refine value, order-detail refine column, mining yield valuation.
  - `marketWideTrees.json` (1.5 MB) — Industry's market-wide Build Opportunities scan.
  - `pi-planet-radius.json` (1.1 MB) — the Planetary Industry Advisor.
  - `shipTree.json` (0.6 MB) — the Ship Tree.

  Still precached: what the shell and most routes need to name things offline — `types.json`, `skills.json`, `pi.json`, `fittingSlots.json`, `skillAttributeModifiers.json` and the small ore/gas id lists. Rules out "every feature works offline on a fresh install"; once a feature has been opened online, it keeps working offline.

- **Every `public/data/**` file (including `data/market/**`) is fetched as `data/<file>?v=<content hash>`, and that versioned URL is the service-worker cache key.** GitHub Pages serves them `max-age=600` with a new ETag on every deploy (~89/day), so an unversioned cache-first route would have served stale SDE forever, and no cache at all refetched unchanged files after nearly every deploy. The hash is computed from the file's bytes at build time (`vite.config.ts` `__SDE_DATA_VERSIONS__`, `src/sde/sdeDataUrl.ts`); an SDE rebake changes the hash and hence the URL, an unrelated deploy changes nothing. Superseded versions are evicted by the route's `maxEntries`.

- **The 512 px install icons and `brand/` are out of the precache too.** Only the OS installer (manifest icons) and the docs use them; the running app never does. `badge-96.png` and `icon-192.png` stay — notifications use them.
