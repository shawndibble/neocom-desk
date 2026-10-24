# Scope decisions — boot path ships as a handful of chunks

_Recorded 2026-10-24._

- **Boot → Overview loads 11 js files, not 284.** Rolldown gives every set of routes that shares a module a chunk of its own, so the entry's static graph was 64 files and entry + `Layout` + `Overview` 284, with 509 of the build's 838 js files under 2 KiB. Lighthouse mobile (150 ms RTT, 1.6 Mbps, 4x CPU) on `/overview` measured FCP 7.3 s and LCP 15.2 s with 317 js requests before first paint; CPU was no longer the bottleneck. Three `output.codeSplitting` groups in `vite.config.ts` fix it:
  - `boot` (`tags: ['$initial']`): every module the entry statically reaches. Rolldown folds it back into the entry chunk, in source order, so `instrument.ts` still runs first.
  - `shell`: the static closure of `Layout` and `Overview`, less what the entry reaches (`shellChunkGroups`, `src/app/lazyChunks.ts`). `Layout` and `Overview` keep chunks of their own, so `missingShellChunks` and the precache split are unchanged.
  - `shell-public`: the part of the shell a public route (`PUBLIC_ROUTE_SUFFIXES`, checked against `App.tsx`) also reaches, so a Share Link visitor never loads the `shell` chunk.

- **The closure is walked through the `@/components/ui` barrel by name (`throughBarrel`).** The barrel re-exports every primitive and the import graph names only the barrel, so a plain walk put DataTable, Select and the virtualizer in the shell chunk. With it, the boot path holds no module it did not hold before (compared module by module on scratch builds).

- **Measured on scratch builds of the same tree (gzip):**

  | Path                           | Before              | After                        |
  | ------------------------------ | ------------------- | ---------------------------- |
  | entry static graph             | 64 files, 366 KiB   | 7 files, 345 KiB             |
  | entry + Layout + Overview      | 284 files, 681 KiB  | 11 files, 576 KiB            |
  | signed-in route (median of 43) | 324 files           | 51 files, ~105 KiB less each |
  | `/s/:shareId` (SharedLink)     | 77 files, 436 KiB   | 20 files, 474 KiB            |
  | whole build                    | 838 js, 8.50 MB raw | 565 js, 8.18 MB raw          |

  Fewer bytes as well as fewer files: each split chunk carried its own import and export boilerplate.

- **Trade-off: a deploy re-downloads more of the boot path.** The entry carries the release, so it changes every deploy, and it now holds all the app's boot code: 134 → 225 KiB gzip per deploy for every installed worker. A change to any shell module renames the whole `shell` chunk (168 KiB gzip), where before only its small chunk was renamed. This amends `20261023-214248-chunks-import-each-other-through-an-import-map.md`'s per-deploy counts for the boot path; route chunks are unchanged. Public routes pay ~38 KiB gzip more for 57 fewer requests.

- **Out of scope.** Route chunks beyond the shell still split per set of sharers (Market: 116 files with the shell). A new lazy route outside the signed-in shell has to join `PUBLIC_ROUTE_SUFFIXES`, or `lazyChunks.test.ts` fails.
