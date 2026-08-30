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
  a non-array queue — `src/engine/queueImport.ts:19-25`). Shape is `{ entries: PlanEntry[],
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

**Verified schema — `.emp` / plan XML** (EVEMon is the origin format; EveLens is a
compatible successor, same underlying container). Source: EVEMon's public GitHub repo,
`evemondevteam/evemon` (MIT-ish OSS), fetched 2026-08-29:

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
  - Not independently confirmed: EveLens's own export, since EveLens's own repo wasn't
    fetched in this pass (time-boxed to EVEMon, which is the format's origin and what corps
    circulate as ".emp"). Recommend a smoke-test against one real EveLens export file before
    calling this item done — if EveLens diverges, it's likely additive (extra elements), and
    a lenient parser (unknown attributes/elements ignored) already tolerates that.

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

**Design tokens/components used:** No new primitives. The dialog stays a single `Panel`
(✓) with the existing preview/warnings/errors sub-sections unchanged
(`ImportClipboardDialog.tsx:97-174`); the only new visual surface is the file/drop mode
described under "File input UX" below, which reuses `Tabs` (✓) and `Button` (`ghost`, ✓) —
no new component needed, stays consistent with the dense, hairline-bordered, one-`ghost`-row
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

- **Lead mitigation, load-bearing regardless of parser internals**: legitimate
  EVEMon/EveLens plan exports never contain a `<!DOCTYPE` (confirmed by the export code path
  above — `OutputPlan`/`SerializablePlan` have no DTD). **Reject any input containing the
  literal substring `<!DOCTYPE` before it ever reaches `DOMParser`** (case-insensitive check
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

**File input UX** (existing import is clipboard-paste only —
`ImportClipboardDialog.tsx:66-95`): add a second mode to the same dialog rather than a new
route/page — density and "one dialog per concern" match the existing Photon-UI feel.
Concretely:

- A `Tabs` (✓ DESIGN.md component) inside the existing dialog `Panel`: "Paste" (today's
  `textarea`) / "File" (new). Reuses the ✓ `Tabs` primitive rather than inventing a toggle.
- File tab: a `panel-2`-filled drop target (`rounded-xs`, `border border-line`, dashed via
  `border-dashed` on drag-over → `border-line-bright`/`border-accent` per DESIGN.md's
  hover/focus-adjacent token), containing a hidden `<input type="file" accept=".emp,.xml"
/>` triggered by a `Button` (`ghost`, matches "one primary button per view" — the
  primary/accent button stays "Import"/"Apply" as today) plus native drag-and-drop handlers
  (`onDragOver`/`onDrop`) reading `event.dataTransfer.files[0]`.
- Same preview list, same `warnings`/`errors` panels below it — reuses
  `ImportClipboardDialog.tsx:97-174` verbatim, since `ClipboardImportPreview`'s shape doesn't
  need to change (mode gains a third value, `'planXml'`, alongside `'skillPlan'`/`'eftFit'`).
- No `DataAgeBadge` needed — this isn't ESI-derived data, it's a local file the user just
  picked, same as clipboard paste today.

**Tests:**

- `src/engine/import/skillPlanXml.test.ts` (TDD-required, write first): "resolves entries by
  skill name", "dedupes duplicate entries keeping highest level", "reports unknown skill
  name as an error not a throw", "case-insensitive name match", "ignores unrecognized
  fields on the intermediate object (forward-compat with an EveLens divergence)" (mirrors
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

**i18n keys** (new, under `plans.*` to match existing `plans.import*` naming
— `src/i18n/locales/en.json:94,103-114`):

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

- EveLens's own `.emp`/plan-XML export wasn't independently verified (only EVEMon's origin
  format was, since EveLens's repo wasn't fetched this pass) — confirm compatibility with one
  real EveLens-exported file before shipping; if it diverges, the lenient
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

**Verdict:** CONFIRMED — nothing similar exists. `grep -rn "csv\|CSV" src --include=*.ts
--include=*.tsx -i` returns zero hits outside a Fuzzwork API URL comment
(`src/market/fuzzwork.ts:3`, unrelated). `src/lib/` contains only `duration.ts`
(`src/lib/duration.ts` — `formatDuration` only). `src/engine/clipboardExport.ts` is
skill-plan-specific (EVE-clipboard-format text, not CSV, `clipboardExport.ts:9-23`).

**Verified baseline:** No blob-download helper anywhere (`grep -rn "Blob\|createObjectURL"
src` — zero hits). This is a genuinely new capability, not a variant of something existing.

**Gap:** CSV serialization (with correct escaping/injection-safety) + a download trigger +
one button per export surface.

**Engine vs UI split:** the task explicitly asks for this as two paths — "a pure CSV
serializer ... plus a thin DOM download trigger. Give exact paths for the split" — so give
two files, not one:

- **Pure CSV serializer** → `src/lib/csv.ts`, `toCsv(rows: readonly (string | number)[][],
headers?: string[]): string`. Not `src/engine` — CSV serialization is a generic formatting
  concern like `duration.ts`, not skill/industry domain math; it takes already-computed
  rows, doesn't calculate anything. `src/lib`'s stated purpose is "small pure formatters
  shared across features with no other natural home" (`docs/ARCHITECTURE.md` module-map row
  for `src/lib`) — exact fit. No fetch/DOM/Dexie import, fully unit-testable. Returns clean
  CSV text only — **no BOM here** (see below for why).
- **Thin DOM download trigger** → a separate file, `src/lib/download.ts`,
  `downloadTextFile(filename: string, content: string, mimeType: string): void` (blob →
  `URL.createObjectURL` → `<a download>` click → `URL.revokeObjectURL`, ~10 lines). This is
  the _only_ place `document.createElement`/`URL.createObjectURL` appear — it's DOM-touching
  so cannot be `src/engine`, and keeping it out of `csv.ts` means `toCsv` stays reusable by
  a non-download consumer later (e.g. a future "copy CSV to clipboard" action, which would
  want clean text, not a BOM-prefixed string built for a file).
- **BOM placement**: prepend the UTF-8 BOM (`﻿`) at the call site building the Blob for
  download (`downloadTextFile('skills.csv', '﻿' + toCsv(rows), 'text/csv;charset=utf-8')`
  or inside `downloadTextFile` itself gated by mimeType), not inside `toCsv`. `toCsv`
  producing a BOM-free string keeps the "genuinely shared" serializer honest — a BOM is a
  file-encoding concern, not a CSV-content concern, and baking it into the serializer would
  leak into every future non-file consumer of `toCsv`.
- Per-surface column mapping (skills → rows, materials → rows, etc.) lives in each
  `features/*` module, not in either shared helper — the helpers only know about
  `(string|number)[][]` → CSV text → Blob download, never about skills or ISK.

**Files touched:** `src/i18n/locales/en.json` (new keys, below) plus one button + handler
added in each of the 4 surfaces listed in the table below — no other existing file needs
structural changes.

**New modules:**

- `src/lib/csv.ts` — pure serializer, `toCsv(...)`.
- `src/lib/csv.test.ts` — colocated, see Tests below.
- `src/lib/download.ts` — DOM download trigger, `downloadTextFile(...)`.
- `src/lib/download.test.ts` — colocated (jsdom `URL.createObjectURL`/`revokeObjectURL` are
  mockable the same way `src/features/skills/clipboard.ts` injects a clipboard writer for
  testability — consider an equivalent injectable seam here rather than spying on global
  `document`/`URL`, for consistency with this codebase's existing pattern).

**Shared primitives needed:** `src/lib/csv.ts` (`toCsv`) and `src/lib/download.ts`
(`downloadTextFile`) themselves **are** the shared primitives this item produces — flagging
per the brief's instructions rather than assuming ownership: both become cross-cutting
dependencies once built. **Consumers who should adopt them beyond this item's 4 surfaces**:
any future export surface (wallet journal/transactions, assets list, contracts) —
`docs/ARCHITECTURE.md` §6 lists `/wallet`/`/assets`/`/contracts` as shipped views with
tabular ESI data, natural CSV-export candidates later; `downloadTextFile` specifically is
also reusable for any future non-CSV file download (e.g. a raw-JSON export of a build plan).
No existing code needs retrofitting today (nothing currently exports anything), so this is a
forward-looking note, not a refactor task.

**CSV correctness (the part that goes wrong if rushed):**

- **Escaping**: RFC 4180 quoting — any field containing a comma, double-quote, or newline
  gets wrapped in `"..."` with internal `"` doubled to `""`. Always test cases: plain field,
  field with comma, field with embedded quote, field with embedded `\n`.
- **Formula-injection sanitization**: a cell whose value starts with `=`, `+`, `-`, or `@`
  is interpreted as a formula by Excel/Sheets/LibreOffice on open — a malicious skill/item
  name (rare but not impossible — SDE names are CCP-controlled so low risk for skills/items,
  but this helper must be safe generically since callers may feed user-entered text like plan
  names or job-cost notes later) triggers arbitrary formula execution. Mitigation: prefix
  such cells with a single leading `'` (apostrophe) or a leading tab, per the standard
  OWASP-documented technique — apply this **only to string cells**, never to numeric cells
  (a leading `'` on a number cell defeats the "raw numbers" requirement below by turning it
  into a text cell).
- **BOM for Excel UTF-8**: prepend `﻿` to the file content — without it, Excel
  (Windows especially) mis-detects encoding for any non-ASCII character (item/skill names
  with accented characters, e.g. faction items).
- **Raw numbers, not display strings**: ISK amounts and durations in this app render through
  `formatIsk`(`src/features/industry/format.ts`)/`formatDuration`
  (`src/lib/duration.ts`) which produce strings like `"1,234,567 ISK"` or `"3d 4h"` with
  `tabular-nums` styling for display only. **CSV export must carry the underlying `number`
  (raw ISK float, raw seconds), not these formatted strings** — explicitly call this out
  because it's the easy mistake (reusing a display formatter for export data) and it breaks
  spreadsheet math (`SUM()` on a string column). `toCsv`'s type signature
  (`(string | number)[][]`) enforces numbers stay numbers through serialization; only the
  final stringification inside `toCsv` turns a `number` into its `toString()`, with no
  thousands-separator/unit suffix.

**Export surfaces, columns, and button placement:**

| Surface                 | Route/component                                                                       | Columns                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Button placement                                                                                                                                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trained skills list     | `src/routes/Skills.tsx` (flattens `groups` state, `Skills.tsx:257-274`)               | Group, Skill name, Level (1-5 int), SP (raw number)                                                                                                                                                                                                                                                                                                                                                                                                                | Page header actions row, next to the existing Refresh button (`Skills.tsx:185-189`, ghost `Button`, same row as `DataAgeBadge`)                                                                                                                               |
| Computed training queue | `src/features/skills/planner/ComputedQueue.tsx` steps (`ScheduledStep[]`)             | Skill name, Level (roman or int — recommend int for spreadsheet sort), Per-level seconds (raw), Cumulative seconds (raw), Is-prereq (bool)                                                                                                                                                                                                                                                                                                                         | `PlanEditor.tsx`'s existing button row (`PlanEditor.tsx:376-403`, alongside `plans.importQueue`/`plans.exportClipboard`/optimizer buttons) — ghost `Button`, this row already has no primary (all ghost except the reorder-accept dialog), so it's consistent |
| Build-plan materials    | `src/features/industry/MaterialsTable.tsx` data (`EffectiveMaterial[]` + `HubPrices`) | Material name, Quantity (raw int), Unit price ISK (raw number, blank if unpriced — not `"Unpriced"` string, so a spreadsheet SUM skips blanks correctly), Line total ISK (raw number, blank if unpriced)                                                                                                                                                                                                                                                           | `BuildPlanDetail.tsx`'s Materials `Panel`'s `actions` slot (`BuildPlanDetail.tsx:256-266`), next to the existing Refresh button + `DataAgeBadge` — **this is the teardown's called-out "more valuable export," build it with the most care of the four**      |
| Job costs               | `src/features/industry/ActiveJobsPanel.tsx` data (`IndustryJob[]`)                    | Activity (translated `activityI18nKey`, or raw `activity_id` — recommend translated string since it's more spreadsheet-readable, at the cost of not being stable across locales, which doesn't matter since this app is English-only per CLAUDE.md), Blueprint type ID, Runs, Start date (ISO 8601 string, not localized), End date (ISO 8601 string), Cost (raw ISK number, blank if absent since `cost?: number` is optional per `esi/endpoints.ts:609`), Status | `ActiveJobsPanel.tsx` header row, next to its own Refresh/`DataAgeBadge` (`ActiveJobsPanel.tsx:78-81`)                                                                                                                                                        |

**Design tokens/components used:** Plain `Button` (`ghost`, `size="sm"`) in each surface's
existing header/actions row — no new component. No primary-button conflict: every target
row already has at most a `ghost` Refresh button, adding another ghost Export button doesn't
violate "one primary per view." No new Panel/Tabs/DataTable needed — export reads data
already rendered, doesn't need its own display surface.

**Tests:**

- `src/lib/csv.test.ts` (write test-first though not `engine`-mandated — this module is
  small and correctness-critical): "escapes commas", "escapes embedded quotes (doubling)",
  "escapes embedded newlines", "prefixes formula-triggering leading chars (`=`,`+`,`-`,`@`)
  on string cells only, not numeric cells", "round-trips a mixed number/string row", "handles
  empty rows array (headers only)", "output contains no BOM" (guards the split — BOM
  belongs to `download.ts`, not here).
- `src/lib/download.test.ts`: "builds a blob with the given mimeType", "revokes the object
  URL after triggering the download", "prepends BOM for `text/csv` content" (or wherever the
  BOM line is finally drawn per the call-site decision above — pin it in the test either
  way).
- Per-surface: a thin `buildXxxCsvRows(...)`-style pure mapper colocated with each feature
  module (e.g. `src/features/industry/materialsCsv.ts` or inline in the component test) —
  each gets its own small test asserting the exact column order/values, especially the
  "blank not 'Unpriced'" rule for unpriced materials.
- e2e: not needed — `downloadTextFile`'s blob-URL/anchor-click mechanics aren't meaningfully
  testable in Playwright without extra download-interception plumbing, and the CSV content
  itself is already covered by the pure unit tests above. Skip unless the orchestrator wants
  file-download e2e coverage generally (a cross-cutting call, not specific to this item).

**i18n keys** (new, under each surface's existing namespace):

- `skills.exportCsv`, `plans.exportCsvQueue` (distinct from existing `plans.exportClipboard`
  — different action, needs its own label), `industry.exportCsvMaterials`,
  `industry.exportCsvJobs`.

**Sync / Dexie impact:** none. Pure read + local file download, no Editable Data touched, no
`db.version` bump, no `src/sync/` change.

**New ESI scopes:** none — reads data this app already fetches for each existing view; no
new endpoint calls introduced.

**Cost:** CONFIRMED S. The shared helper is genuinely small (~40 lines + tests), and each of
the 4 per-surface wire-ups is a button + a pure row-mapper + a test, repeated 4x — a few
days total, no architectural novelty. The teardown's characterization ("one shared helper; a
blob download") is accurate once the escaping/BOM/injection details are counted in, since
none of those add structural complexity, just careful test cases.

**Depends on:** none.

**Risks / open questions:**

- Column header i18n: should CSV header row text go through i18next (consistent with
  CLAUDE.md's "all UI strings through i18next") or stay hardcoded English (CSV is a
  data-interchange format, not UI chrome, and this app is English-only anyway per
  CONTEXT.md round 2)? Recommend routing through i18next for consistency with the rule's
  letter, but flagging since it's a defensible judgment call either way — low stakes since
  the catalog is English-only regardless.
- Filename convention (e.g. `neocom-desk-skills-{characterName}-{date}.csv` vs. something
  shorter) isn't specified anywhere in DESIGN.md — orchestrator should pick one convention
  applied across all 4 surfaces for consistency.
