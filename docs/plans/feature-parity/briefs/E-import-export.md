# Brief E — Import / Export

Area: `src/engine/import/`, `src/engine/clipboardExport.ts`, `src/engine/queueImport.ts`,
`src/features/skills/planner/ImportClipboardDialog.tsx` + `clipboardImport.ts`,
`src/features/skills/clipboard.ts`.

---

## Item 06 — Import .emp and plan XML files

**Artifact claim:** "The switching-cost lever... An XML parse next to
`engine/import/skillPlanPaste`. Cheapest way to make leaving them painless."

**Verdict:** CONFIRMED as S-cost lever, but the "next to skillPlanPaste" framing undersells
it — this is a two-layer feature (pure engine mapper + a features-layer DOM/gzip adapter +
new file-input UI), not a drop-in sibling file. No `.emp`/plan-XML importer exists anywhere
in `src/` (`grep -ri "\.emp\|DOMParser\|DecompressionStream" src` — zero hits outside this
investigation; `docs/ARCHITECTURE.md:36` enumerates the full current importer set as
`import/{eftFit,fitToSkills,skillPlanPaste}` — no XML/gzip member).

**Verified baseline — existing importer conventions** (read `skillPlanPaste.ts`,
`eftFit.ts`, `fitToSkills.ts`, `queueImport.ts` + their `.test.ts` files):

- **Return shape convention**: every parser returns a plain result object, never throws for
  malformed _content_ (only throws `TypeError`/`RangeError` for programmer-error inputs like
  a non-array queue — `src/engine/queueImport.ts:24-27`). Shape is `{ entries: PlanEntry[],
errors: E[] }` (`skillPlanPaste.ts:23-26`) or `{ ...fields, errors: E[] }` for a
  structural parse (`eftFit.ts:34-39`), with a separate `warnings: string[]` layered on top
  at the orchestration level (`clipboardImport.ts:27-36`), not inside the pure parser.
- **Error shape convention**: `{ line: number, text: string, reason: string }`
  (`skillPlanPaste.ts:15-21`, `eftFit.ts:21-27`) for line-oriented text formats; `{ itemName,
reason }` (`fitToSkills.ts:34-37`) for name-resolution-oriented aggregation. An XML format
  has no "line" in the same sense — recommend `{ path: string, reason: string }` where
  `path` is a human-locator like `entry[3] "Gunnery"` (element index + skill name), not an
  XML line number (DOMParser doesn't expose source line numbers reliably).
- **Unresolvable skill names**: resolved against a caller-supplied `ReadonlyMap<string,
{typeID}>` (`SkillCatalog`/`TypeCatalog`), case-insensitive (`.toLowerCase()`), and an
  unresolved name becomes an error entry, never a thrown exception
  (`skillPlanPaste.ts:78-82`, `fitToSkills.ts:65-67`). The new parser must resolve by **skill
  name**, not EVEMon's internal `skillID` (see schema below) — matches this app's SDE, which
  is CCP-authoritative; EVEMon's `skillID` is also a CCP type ID in practice but treating name
  as ground truth avoids a second silent-failure mode if the two ever disagree.
- **Orchestration**: `clipboardImport.ts`'s `previewClipboardImport` auto-detects format from
  content (`detectMode`, `clipboardImport.ts:57-59`) and is the single place that turns
  parser output into a `ClipboardImportPreview` the dialog renders. The new format needs an
  equivalent `previewXmlImport`-style entry point, either folded into
  `previewClipboardImport`'s dispatch or a sibling function the dialog calls directly (see
  UI section — recommend sibling, since the trigger is a file, not a paste).
- Dedup rule carried forward: skillPlanPaste dedupes by typeID keeping the highest level
  (`skillPlanPaste.ts:84-87`) — same rule applies to duplicate `<entry>` elements for the
  same skill in a plan XML.

**Verified schema — `.emp` / plan XML** (EVEMon is the origin format; a popular, actively
maintained successor tool is format-compatible with it, same underlying container). Source:
EVEMon's public GitHub repo, `evemondevteam/evemon` (MIT-ish OSS), fetched 2026-08-29:

- **Compression**: confirmed gzip. `src/EVEMon.Common/Helpers/UIHelper.cs:186` — `.emp` is
  written as `new GZipStream(fs, CompressionMode.Compress)` wrapping a `StreamWriter` writing
  UTF-8 XML text (`UIHelper.cs:148-192`,
  https://raw.githubusercontent.com/evemondevteam/evemon/master/src/EVEMon.Common/Helpers/UIHelper.cs).
  Plain `.xml` export is the same content, uncompressed. (A batch multi-plan variant, `.epb`,
  exists too — out of scope, not requested.)
- **Root element and entry shape** — `src/EVEMon.Common/Serialization/Exportation/OutputPlan.cs`
  (`[XmlRoot("plan")]`, adds a `revision` attribute) wrapping
  `src/EVEMon.Common/Serialization/Settings/SerializablePlan.cs` and
  `SerializablePlanEntry.cs`. **Important distinction confirmed by re-reading
  `PlanIOHelper.ExportAsXML` itself**, not just the class definitions: `SerializablePlan`'s
  full field set (`name`/`owner`/`description`/`sorting`/`entries`/`invalidEntries`) is the
  _internal settings-file_ shape. The actual `.emp`/`.xml` _export_ path only copies a
  subset across:

  ```csharp
  SerializablePlan serial = plan.Export();
  OutputPlan output = new OutputPlan { Name = serial.Name, Owner = serial.Owner, Revision = Settings.Revision };
  output.Entries.AddRange(serial.Entries);
  ```

  (`PlanIOHelper.cs`, `ExportAsXML(Plan)`). `Description` and `InvalidEntries` are **not**
  copied from `serial` to `output` — a real exported file has neither a `description`
  attribute nor any `<invalidEntry>` elements; both are always absent, not merely optional.
  `SortingPreferences` is non-null by `OutputPlan`'s own constructor default, so a `<sorting>`
  element may still appear, but it carries no plan-content our importer needs and should be
  ignored (matches the "unknown elements/attributes tolerated" stance below).

  A real exported `.emp`/`.xml` file therefore looks like:

  ```xml
  <plan revision="N" name="My Plan" owner="{guid}">
    <sorting>...</sorting> <!-- present, UI prefs only, ignore -->
    <entry skillID="3300" skill="Gunnery" level="4" priority="3" type="Planned">
      <notes>optional free text</notes>
      <group>optional tag</group>
      <!-- <remapping>...</remapping> optional, complex, not needed for skill import -->
    </entry>
    ...
  </plan>
  ```

  - `skill` (attribute) = skill name string — this is the resolution key to use, per the
    established convention above.
  - `skillID` (attribute) = EVEMon's internal type ID — usable as an optional fallback/hint
    only; do not make it load-bearing (SDE lookup is name-keyed everywhere else in this
    codebase).
  - `level` = integer 1..5.
  - `type` = enum `Planned` | `Prerequisite` (`src/EVEMon.Common/Enumerations/PlanEntryType.cs`)
    — a plan-supplied entry vs. one EVEMon auto-inserted as a prereq. Recommend importing
    both kinds as plain entries (this app recomputes its own prereq closure via
    `normalizePlan`/the scheduler, same as it already does for skill-plan-paste and EFT
    imports) rather than trying to preserve the distinction.
  - `<invalidEntry>` exists as a class (`SerializableInvalidPlanEntry.cs`) but — per the
    `ExportAsXML` trace above — never actually appears in a `.emp`/`.xml` file produced by
    EVEMon's Save/Export flow. Parser should tolerate the element defensively (ignore
    unknown elements generally, so it wouldn't break on one), but do **not** build a
    dedicated warning path or i18n string for it — that would be designing for a case that
    doesn't occur in practice.
  - Sources:
    https://raw.githubusercontent.com/evemondevteam/evemon/master/src/EVEMon.Common/Serialization/Settings/SerializablePlan.cs ,
    https://raw.githubusercontent.com/evemondevteam/evemon/master/src/EVEMon.Common/Serialization/Settings/SerializablePlanEntry.cs ,
    https://raw.githubusercontent.com/evemondevteam/evemon/master/src/EVEMon.Common/Serialization/Exportation/OutputPlan.cs ,
    https://raw.githubusercontent.com/evemondevteam/evemon/master/src/EVEMon.Common/Helpers/PlanIOHelper.cs (confirms `.emp` == gzip(XML), that plain `.xml` files from EVEMon are the _same_ `<plan>` schema just uncompressed, and the exact `Name`/`Owner`/`Revision`/`Entries`-only copy shown above).
  - Not independently confirmed: the compatible successor tool's own export, since its repo
    wasn't fetched in this pass (time-boxed to EVEMon, which is the format's origin and what
    corps circulate as ".emp"). Recommend a smoke-test against one real export file from that
    tool before calling this item done — if it diverges, it's likely additive (extra
    elements), and a lenient parser (unknown attributes/elements ignored) already tolerates
    that.

**Gap:** No gzip decompression, no XML parsing, no file-input UI, no `.emp`/`.xml` route
into `previewClipboardImport`'s preview pipeline.

**Engine vs UI split** (the DOMParser-in-engine problem, resolved):

`src/engine` may not import DOM (`docs/ARCHITECTURE.md` module-map row for `src/engine`;
`DOMParser`, `document`, etc. are DOM APIs). `DOMParser.parseFromString` must live in a
`src/features/*` module. Recommend a 3-stage pipeline mirroring the EFT-fit split
(`eftFit.ts` pure structural parse → `fitToSkills.ts` pure mapping), except the DOM step
itself is impure and pushed one layer up:

1. **`src/features/skills/planner/planXmlDocument.ts`** (impure, features layer): takes raw
   file bytes → decompress if gzip magic bytes present (`1F 8B`) → decode as UTF-8 text →
   `new DOMParser().parseFromString(text, 'text/xml')` → walk the resulting `Document` into
   a **plain, engine-safe intermediate object** (no DOM node types survive past this
   function): `{ name?: string, entries: { skillName: string, skillID?: number, level:
number }[] }`. This is the only file in the feature that touches
   `DOMParser`/`Document`/`Element`. Two failure modes this function must check explicitly
   (neither is a parser-level throw — both need code):
   - `DOMParser.parseFromString` **does not throw** on malformed/truncated XML; it returns a
     `Document` whose parse failed silently into a `<parsererror>` element somewhere in the
     tree (root or descendant, browser-dependent placement). Check
     `doc.getElementsByTagName('parsererror').length > 0` (or query the well-known
     `parsererror` namespace element) and surface a real error — without this check, a
     corrupt file yields zero entries and zero errors: a silent empty import.
   - Check the document root element name: expect `plan`. A `.epb` batch file (root
     `<plans>`, see `OutputPlans.cs` — out of scope for this item) should produce "this looks
     like a multi-plan backup file, not a single plan" rather than a confusing empty parse.
2. **`src/engine/import/skillPlanXml.ts`** (pure, TDD-required): takes that plain
   intermediate object (not a `Document`) + `SkillCatalog` (same type as
   `skillPlanPaste.ts`'s) → resolves names → dedupes by typeID keeping highest level → same
   `{ entries: PlanEntry[], errors: SkillPlanXmlError[] }` shape as `skillPlanPaste.ts`. Unit
   tests build the intermediate object by hand (a plain JS object literal), never a real
   `Document` — this is what keeps it engine-pure and fast to test.
3. `clipboardImport.ts`-equivalent orchestration in `src/features/skills/planner/` composes
   1 → 2, same role `previewEftFit`/`previewSkillPlan` already play.

This split is deliberate: DOMParser output (a live `Document`) never crosses into
`src/engine`, only a plain serializable object does — satisfies the "no DOM imports" rule
by construction, not by convention alone (a `Document` argument couldn't even be constructed
without importing DOM lib types).

**Design tokens/components used:** No new primitives. **Correction: the dialog is a `Modal`
(✓), not a `Panel`** — `ImportClipboardDialog.tsx` already renders `<Modal open onClose={...}
title={...}>`, built on the native `<dialog>` element (`showModal()`, per `Modal.tsx`'s own
doc comment: "platform inertness is correct and free," no hand-rolled focus trap). That
matters for this item specifically: the new file input and drop target must be added inside
that `<Modal>`, not as a sibling element outside it — anything outside the `<dialog>` is
inert while the dialog is open (native `<dialog>`'s top-layer/inert-background behavior), so
a drop target rendered outside it would never receive drag/drop events or a click. The
existing preview/warnings/errors sub-sections stay unchanged; the only new visual surface is
the file/drop mode described under "File input UX" below, which reuses `Tabs` (✓) and
`Button` (`ghost`, ✓) — no new component needed, stays consistent with the dense,
hairline-bordered, one-`ghost`-row
Photon-UI feel already established in this dialog.

**Files touched:**

- `src/features/skills/planner/ImportClipboardDialog.tsx` — add file-picker/drop-zone
  affordance (new mode, alongside the existing paste `textarea`).
- `src/features/skills/planner/clipboardImport.ts` or a new sibling — wire the XML path in,
  OR keep it a fully separate `previewXmlImport` entry point the dialog calls when a file
  (not paste text) is provided. Recommend separate: format detection here is by _input
  channel_ (file vs. paste), not by sniffing content, so conflating it with
  `detectMode`/`previewClipboardImport` adds a branch that's never actually ambiguous.
- `src/i18n/locales/en.json` — new keys, listed below.

**New modules:**

- `src/engine/import/skillPlanXml.ts` — pure: intermediate-object → `PlanEntry[]` +
  errors/warnings. TDD-required.
- `src/engine/import/skillPlanXml.test.ts` — colocated tests.
- `src/features/skills/planner/planXmlDocument.ts` — impure: raw `File`/`ArrayBuffer` →
  gzip-sniff → decompress (if needed) → `DOMParser` → plain intermediate object. Not
  TDD-required by the letter of CLAUDE.md (impure, features layer) but should still get
  tests using jsdom's `DOMParser` (available in this repo's Vitest jsdom environment) plus a
  couple of real fixture files (one plain `.xml`, one gzip `.emp`) under
  `src/features/skills/planner/__fixtures__/` or similar.
- `src/features/skills/planner/FileImportDropzone.tsx` (or fold into
  `ImportClipboardDialog.tsx` as a mode toggle — see UX below) — the picker/drop-zone
  component.

**Shared primitives needed:** none new. Reuses `Panel`, `Button` (✓ in DESIGN.md inventory).
No `DataTable` needed — the preview list in `ImportClipboardDialog.tsx` already renders a
plain `<ul>`, unaffected by this change.

**Decompression — DecompressionStream vs. a dependency:**
`DecompressionStream('gzip')` is a standard Web Streams API, Baseline widely-available since
May 2023 (Chrome 80+, Firefox 113+, Safari 16.4+, per
https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream and
https://web.dev/blog/compressionstreams). This app has no browserslist/legacy-IE constraint
(Vite/PWA SPA, `docs/ARCHITECTURE.md` §1) and CLAUDE.md's spirit is "no new deps where the
platform already covers it." **Recommend `DecompressionStream`, no pako dependency.**
Tradeoff: it's an async streaming API (`new Response(cs.readable).arrayBuffer()`-style
consumption), slightly more ceremony than pako's synchronous `pako.ungzip(bytes)|<Uint8Array
in, Uint8Array out>`, but zero bundle-size/dep-audit cost, and this is a features-layer
concern anyway (fine to be async — the dialog already awaits `handleParse()`).
Feature-detect at call time (`typeof DecompressionStream === 'function'`) and surface a
translated error ("browser doesn't support decompression — update your browser") rather than
crashing, for the vanishingly small fraction of pre-2023 browsers.

**Security — untrusted third-party file:**

- **Lead mitigation, load-bearing regardless of parser internals**: legitimate EVEMon-format
  plan exports (including from the compatible successor tool) never contain a `<!DOCTYPE`
  (confirmed by the export code path above — `OutputPlan`/`SerializablePlan` have no DTD).
  **Reject any input containing the literal substring `<!DOCTYPE` before it ever reaches
  `DOMParser`** (case-insensitive check
  on the decoded text, a pure unit-testable string guard). This is the primary defense, not
  a belt-and-suspenders extra — it removes both XXE and internal-entity-expansion (billion
  laughs) as live concerns without depending on any particular browser's parser behavior.
- **Why not rely on browser defaults alone**: it's commonly asserted that browser
  `DOMParser`/`text/xml` doesn't fetch external DTD subsets or external general entities over
  the network (no SSRF/file-read vector the way a misconfigured server-side XML parser can
  have), and that's consistent with general web-platform security literature, but this
  wasn't verified browser-by-browser in this pass (would need a hands-on test against
  Chrome/Firefox/Safari with a crafted external-entity payload). Treat that as unconfirmed
  and don't build the security story on top of it — the `<!DOCTYPE` reject above makes the
  question moot for this feature either way, since it blocks both attack classes before the
  parser ever sees them.
- **Decompression-bomb DoS**: a gzip bomb (a tiny `.emp` expanding to gigabytes) is a risk
  independent of XML entirely — the `<!DOCTYPE` guard doesn't cover it, size caps below do.
- **Size caps** (both belong in `planXmlDocument.ts`, checked before the expensive step):
  cap the compressed file at a fixed ceiling (e.g. 2 MB — a plan with thousands of entries is
  still tiny XML) before attempting decompression; cap the _decompressed_ byte length (e.g.
  10 MB) by consuming the decompression stream with a running byte counter and aborting past
  the cap, rather than materializing an unbounded string first. Reject with a translated
  error, don't silently truncate.
- None of this needs to be TDD-required by CLAUDE.md's letter (it's features-layer, not
  `src/engine`), but the DOCTYPE guard and the two size caps are exactly the kind of pure
  logic worth unit-testing anyway (`planXmlDocument.test.ts`: "rejects DOCTYPE", "rejects
  oversized compressed input", "rejects oversized decompressed input").

**File input UX** (existing import is clipboard-paste only, via a `<textarea>` inside the
`Modal`): add a second mode to the same dialog rather than a new route/page — density and
"one dialog per concern" match the existing Photon-UI feel. Concretely:

- A `Tabs` (✓ DESIGN.md component) inside the existing `Modal`: "Paste" (today's `textarea`)
  / "File" (new). Reuses the ✓ `Tabs` primitive rather than inventing a toggle, and — per the
  correction above — both tabs' content must render inside the `Modal`, not beside it.
- File tab: a `panel-2`-filled drop target (`rounded-xs`, `border border-line`, dashed via
  `border-dashed` on drag-over → `border-line-bright`/`border-accent` per DESIGN.md's
  hover/focus-adjacent token), containing a hidden `<input type="file" accept=".emp,.xml"
/>` triggered by a `Button` (`ghost`, matches "one primary button per view" — the
  primary/accent button stays "Import"/"Apply" as today) plus native drag-and-drop handlers
  (`onDragOver`/`onDrop`) reading `event.dataTransfer.files[0]`.
- Same preview list, same `warnings`/`errors` panels below it — reuses the existing preview
  rendering in `ImportClipboardDialog.tsx` verbatim, since `ClipboardImportPreview`'s shape
  doesn't need to change (mode gains a third value, `'planXml'`, alongside
  `'skillPlan'`/`'eftFit'`).
- No `DataAgeBadge` needed — this isn't ESI-derived data, it's a local file the user just
  picked, same as clipboard paste today.

**Tests:**

- `src/engine/import/skillPlanXml.test.ts` (TDD-required, write first): "resolves entries by
  skill name", "dedupes duplicate entries keeping highest level", "reports unknown skill
  name as an error not a throw", "case-insensitive name match", "ignores unrecognized
  fields on the intermediate object (forward-compat with a divergence from the compatible
  successor tool)" (mirrors
  `skillPlanPaste.test.ts` structure).
- `src/features/skills/planner/planXmlDocument.test.ts`: parses a real (small, hand-built)
  gzip `.emp` fixture and a plain `.xml` fixture to the same intermediate shape; rejects
  `<!DOCTYPE`; rejects oversized compressed/decompressed input; gzip-magic-byte detection
  (`.xml` vs `.emp` by content sniffing, not just filename, since a user might rename a
  file); **"malformed/truncated XML surfaces an error, not a silent empty result"**
  (exercises the `parsererror` check); **"a `<plans>`-rooted (`.epb` batch) file surfaces a
  specific 'not a single plan' error"** (root-element check).
- `ImportClipboardDialog.test.tsx` — **no test file exists for this component today**
  (confirmed: `ls src/features/skills/planner/` has `ImportClipboardDialog.tsx` with no
  `.test.tsx` sibling). Adding the file-tab/drop-zone mode is a reasonable trigger to add
  one: file-tab renders, drop handler wires to the same preview pipeline as a programmatic
  `File`.
- e2e: likely skippable for v1 (Playwright file-upload via `setInputFiles` is doable but this
  is a nice-to-have, not core-path coverage) — flag as an open question for the orchestrator
  rather than deciding unilaterally.

**i18n keys** (new, under `plans.*` to match existing `plans.import*` naming, e.g.
`plans.importQueue`, `plans.importClipboard`, `plans.importDialogTitle` in
`src/i18n/locales/en.json`):

- `plans.importFileTab` ("File"), `plans.importPasteTab` ("Paste")
- `plans.importFileDrop` ("Drop a .emp or .xml file here, or")
- `plans.importFileBrowse` ("Choose file")
- `plans.importFileTooLarge`, `plans.importFileDecompressFailed`,
  `plans.importFileUnsupportedFormat`, `plans.importFileBrowserUnsupported`,
  `plans.importFileMalformedXml`, `plans.importFileMultiPlanUnsupported`

**Sync / Dexie impact:** none. Import produces `PlanEntry[]`, applied via the existing
`onApply` callback into an already-synced `SkillPlanRecord.entries` field
(`ImportClipboardDialog.tsx:10`, existing `onApply` prop) — no new Editable Data field, no
`db.version(n+1)` bump, no `src/sync/` change. (Contrast with `d90e417`'s markers-field
case, which added a _new field_ to the record — this item adds a new _way to populate an
existing field_.)

**New ESI scopes:** none — this is a local file operation, no ESI call involved.

**Cost:** Revise **S → S/M border, lean M** once the full split is counted: pure engine
mapper (S) + DOM/gzip adapter with security hardening (S, but the DOCTYPE/size-cap tests add
real time) + new Tabs-based file/drop UI in the dialog (S) + fixture files for tests (a real
gzip `.emp` needs generating, not just imagining). Individually each piece is small; the sum
across 3 files + fixtures + a UI mode is a week, not "few days." The teardown's S undercounts
the DOM/engine split and the security work specifically.

**Depends on:** none of the other numbered items structurally, but shares
`ImportClipboardDialog.tsx`/`clipboardImport.ts` with whatever else touches that dialog
concurrently — check for other in-flight work on `src/features/skills/planner/` before
starting (ARCHITECTURE.md flags this dir as "two agents editing concurrently").

**Risks / open questions:**

- The compatible successor tool's own `.emp`/plan-XML export wasn't independently verified
  (only EVEMon's origin format was, since that tool's repo wasn't fetched this pass) — confirm
  compatibility with one real export file from it before shipping; if it diverges, the lenient
  unknown-element/attribute tolerance recommended above should absorb small additive
  differences, but a structural divergence (different root element name, say) would not be
  caught by this brief.
- `<remapping>` element (complex, nested attribute/dogma data) is deliberately out of scope
  — recommend ignoring it entirely on import (this app has its own Remap Marker model,
  round 2 CONTEXT.md, that doesn't map 1:1 to EVEMon's remap-point serialization). Flag to
  orchestrator as an explicit non-goal, not an oversight.
- Whether importing into an _existing_ plan should offer "merge" vs. "replace" vs. "new
  plan named after the file's `name` attribute" is a product decision, not an engineering
  one — `ImportClipboardDialog`'s current `onApply(entries)` contract already leaves this to
  the caller (`PlanEditor.tsx`), so no design is blocked on the answer, but the orchestrator
  should pick one before UI copy is finalized.

---

## Item 12 — CSV export

**Artifact claim:** "Missing. One shared helper; a blob download in the browser. Our
build-plan material list is the more valuable export."

**Verdict: ALREADY SHIPPED IN FULL for the 4 surfaces originally scoped.** This is the
single biggest correction in this brief — do not re-open a build task for what's below; the
only real remaining work is the new surfaces listed at the end of this section.

**Shipped shared helpers:**

- `src/lib/csv.ts` — `toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string`,
  where `CsvColumn<T> = { header: string; value: (row: T) => string | number | null |
undefined }`. **Not** the `(string | number)[][]`-plus-`headers?` shape this brief
  originally proposed — the shipped signature takes column definitions (header + accessor),
  which is what every consumer below actually calls. Also exports `csvFilename(base: string,
date: Date): string` → `neocom-<base>-<YYYY-MM-DD>.csv` (local calendar date, so a caller's
  test can pin the name via an injected `Date` instead of freezing the clock) — this resolves
  the filename-convention question the original brief left open, uniformly across all
  surfaces.
- `src/lib/download.ts` — `downloadTextFile(filename, text, mimeType = 'text/csv;charset=utf-8')`,
  the DOM-touching blob → `URL.createObjectURL` → `<a download>` click → deferred
  `URL.revokeObjectURL` trigger. Has **no BOM handling and no BOM-related test** — the BOM is
  entirely `csv.ts`'s concern (see below).
- `src/lib/downloadCsv.ts` — `downloadCsv(surface: CsvSurface, rows, columns, now = new
Date())` composes the two: `downloadTextFile(csvFilename(surface, now), toCsv(rows,
columns))`. `CsvSurface` is a closed union (currently `'skills' | 'skill-queue' |
'build-materials' | 'industry-jobs'`) so a new export surface is a deliberate edit to that
  type, not a stringly-typed call site.
- Each helper has a colocated test file (`csv.test.ts`, `download.test.ts`,
  `downloadCsv.test.ts`).

**BOM — corrected, this matters:** `toCsv` **already prepends the UTF-8 BOM** (`﻿`) to
every string it returns — confirmed by `csv.test.ts`'s "emits a leading UTF-8 BOM" test and
`downloadCsv.test.ts`'s "passes the serialized CSV through, BOM and all" test. **Never
prepend a second BOM at a call site** (e.g. `downloadTextFile('skills.csv', '﻿' +
toCsv(rows), ...)`) — every existing consumer calls `downloadCsv`/`toCsv` directly and gets
exactly one BOM; manually prepending another would double it, and every unit test would still
pass since none of them assert there's only one.

**Escaping / formula-injection / raw-numbers — already implemented, not just planned:**

- RFC 4180 quoting: any field containing a comma, double-quote, CR, or LF is wrapped in
  `"..."` with internal `"` doubled to `""` (`NEEDS_QUOTING_RE` in `csv.ts`).
- Formula-injection guard: a string cell starting with `=`, `+`, `-`, `@` (after skipping
  leading whitespace), or a leading tab/CR, gets a single leading `'` prefix
  (`FORMULA_PREFIX_RE`) — applied only to string cells; `number` values are always emitted
  bare so spreadsheet math still works.
- Raw numbers, not display strings: every consumer's column mapper passes the underlying
  `number` (raw ISK float, raw seconds) rather than `formatIsk`/`formatDuration` output — e.g.
  `jobsCsvColumns` emits `job.cost ?? null` (blank, not `0` or a placeholder string, when
  ESI's `cost?: number` field, `src/esi/endpoints.ts:606`, is absent) and
  `materialsCsvColumns` emits `null` for an unpriced material rather than a display fallback
  string, so `SUM()` on the column still works.

**Surfaces wired (all 4 of the originally-scoped ones):**

| Surface                 | Wired in                                                                        | Column mapper                                                          | i18n key                      |
| ----------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| Trained skills list     | `src/routes/Skills.tsx`, header actions row next to `DataAgeBadge`              | `src/features/skills/skillsCsv.ts` (`skillCsvRows`, `skillCsvColumns`) | `skills.exportCsv`            |
| Computed training queue | `src/features/skills/planner/PlanEditor.tsx`, existing button row               | `src/features/skills/planner/queueCsv.ts` (`queueCsvColumns`)          | `plans.exportCsvQueue`        |
| Build-plan materials    | `src/features/industry/BuildPlanDetail.tsx`, Materials `Panel`'s `actions` slot | `src/features/industry/materialsCsv.ts` (`materialsCsvColumns`)        | `industry.exportCsvMaterials` |
| Job costs               | `src/features/industry/ActiveJobsPanel.tsx`, header actions row                 | `src/features/industry/jobsCsv.ts` (`jobsCsvColumns`)                  | `industry.exportCsvJobs`      |

Each mapper takes a `CsvTranslate` (`csv.ts`'s structural stand-in for i18next's `TFunction`)
so column headers go through i18next, same as any other UI string — resolves the original
brief's open question in favor of i18next, consistently across all 4 surfaces.

**Sync / Dexie impact:** none. Pure read + local file download, no Editable Data touched, no
`db.version` bump, no `src/sync/` change.

**New ESI scopes:** none — reads data this app already fetches for each existing view.

**Remaining scope — the only real ticket content left in this item:** wallet, assets,
contracts, orders, mail, calendar, market do not export CSV yet. Extending coverage to any of
them is now a small, well-worn pattern, not new design: add the surface to `CsvSurface` in
`downloadCsv.ts`, write a `<surface>Csv.ts` column mapper (mirroring `jobsCsv.ts`/
`materialsCsv.ts` — raw numbers, blank not placeholder-string for optional/derived fields,
`CsvTranslate`-routed headers), add one `ghost` `Button` next to the surface's existing
Refresh/`DataAgeBadge`, and add the surface's `exportCsv`-style i18n key. No new shared
helper work — `toCsv`/`downloadTextFile`/`downloadCsv` already cover it.

**Cost:** Revise down from the original S — the shared-helper cost is already sunk. Each
remaining surface is a column mapper + a button + a test, the same increment `jobsCsv.ts`/
`materialsCsv.ts` already prove out; no architectural novelty, no BOM/escaping/injection work
left to redo.

**Depends on:** none — `toCsv`/`downloadTextFile`/`downloadCsv` are already built and stable.

**Risks / open questions:**

- Some of the remaining surfaces have data shapes worth a moment's thought before copying the
  pattern blind: wallet journal/transaction rows and contract prices have the same
  "optional/derived numeric field" shape `materialsCsvColumns`/`jobsCsvColumns` already
  solved (blank cell via `??`, never a placeholder string) — reuse that precedent rather than
  re-deriving it. Mail and calendar are less obviously tabular; confirm with the orchestrator
  that a CSV export is still the right shape for those two before wiring them the same way.
