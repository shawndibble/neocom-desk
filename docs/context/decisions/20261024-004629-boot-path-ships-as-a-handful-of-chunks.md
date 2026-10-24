# Scope decisions — boot path ships as a handful of chunks

_Recorded 2026-10-24._

- **Boot → Overview loads 12 js files, not 284.** Rolldown gives every set of routes that shares a module a chunk of its own. The entry's static graph was 64 files, entry + `Layout` + `Overview` was 284, and 509 of the build's 838 js files were under 2 KiB. Lighthouse mobile (150 ms RTT, 1.6 Mbps, 4x CPU) on `/overview` measured FCP 7.3 s and LCP 15.2 s, with 317 js requests before first paint; CPU was no longer the bottleneck. Four `output.codeSplitting` groups in `vite.config.ts` fix it:
  - `boot` (`tags: ['$initial']`): every module the entry statically reaches. Rolldown folds it back into the entry chunk, in source order, so `instrument.ts` still runs first.
  - The shell's static closure (`Layout` + `Overview`), less what the entry reaches, split three ways by `shellChunkGroups` (`src/app/lazyChunks.ts`). `Layout` and `Overview` keep chunks of their own, so `missingShellChunks` and the precache split are unchanged:
    - `shell-public`: what a public route (`PUBLIC_ROUTE_SUFFIXES`, checked against `App.tsx`) can load, `import()`s included (a Share Link's lazy appraisal, D-Scan, fitting and survey views).
    - `shell-lazy`: what the entry loads only by `import()` (the info modals `App` mounts on every route, the prefetchers, the sync helpers), stopping at the signed-in routes `routeChunks.ts` loads.
    - `shell`: the rest, which only the signed-in app loads.
  - Each set imports only itself, the sets before it and the entry, so no signed-out page loads `shell`. That held on the scratch build for every Share Link view, an info modal over a Share Link, and an info modal on /login.

- **`shell-public` is one chunk for every public route.** A Share Link visitor also downloads what only `CommunityJoin` or the Corp Tax Book links share with the shell, and the reverse. Splitting it per route would bring back the per-sharer chunks this removes.

- **The closure is walked through the `@/components/ui` barrel by name (`throughBarrel`).** The barrel re-exports every primitive, and the import graph names only the barrel, so a plain walk put DataTable, Select and the virtualizer in the shell chunk. With the name walk, the boot path holds no module it did not hold before (compared module by module on scratch builds). When an import of the barrel cannot be traced (a namespace import, another specifier) and the importer is in the shell, the build prints a warning: every primitive then counts as the shell's.

- **Measured on scratch builds of the same tree (gzip):**

  | Path                             | Before              | After                        |
  | -------------------------------- | ------------------- | ---------------------------- |
  | entry static graph               | 64 files, 366 KiB   | 7 files, 345 KiB             |
  | entry + Layout + Overview        | 284 files, 681 KiB  | 12 files, 578 KiB            |
  | signed-in route (median of 43)   | 324 files           | 52 files, ~103 KiB less each |
  | `/s/:shareId` (SharedLink alone) | 77 files, 436 KiB   | 20 files, 492 KiB            |
  | `/s/` appraisal view             | 106 files, 477 KiB  | 35 files, 515 KiB            |
  | `/s/` D-Scan view                | 105 files, 461 KiB  | 31 files, 509 KiB            |
  | `/s/` fitting view               | 176 files, 630 KiB  | 69 files, 614 KiB            |
  | `/s/` survey view                | 150 files, 527 KiB  | 52 files, 540 KiB            |
  | `/s/` + public info modal        | 95 files, 461 KiB   | 26 files, 602 KiB            |
  | `/s/` + item detail modal        | 158 files, 562 KiB  | 57 files, 655 KiB            |
  | /login + public info modal       | 84 files, 392 KiB   | 16 files, 536 KiB            |
  | whole build                      | 838 js, 8.50 MB raw | 566 js, 8.18 MB raw          |

  The boot path loses bytes as well as files, because each split chunk carried its own import and export boilerplate.

- **Trade-off: a deploy re-downloads more of the boot path.** The entry carries the release, so it changes on every deploy, and it now holds all the app's boot code: 134 → 225 KiB gzip per deploy for every installed worker. A change to a shell module renames its whole group chunk (`shell` 45, `shell-lazy` 104, `shell-public` 80 KiB gzip), where before only its own small chunk was renamed. This amends the per-deploy counts in `20261023-214248-chunks-import-each-other-through-an-import-map.md` for the boot path; route chunks are unchanged.

- **Trade-off: signed-out pages make fewer requests but download more.** A Share Link pays up to 56 KiB gzip more (its fitting view 16 KiB less), in about a third of the files. Opening an info modal while signed out costs ~140 KiB gzip more: it loads all of `shell-lazy`, most of which is signed-in prefetch and sync code.

- **Out of scope.** Route chunks beyond the shell still split per set of sharers (Market: 117 files with the shell). A new lazy route outside the signed-in shell has to join `PUBLIC_ROUTE_SUFFIXES`, and `lazyChunks.test.ts` fails until it does, or if it cannot read a literal-path `<Route>`.
