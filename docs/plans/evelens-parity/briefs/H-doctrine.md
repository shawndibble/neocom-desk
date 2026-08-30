# Item 14 — Doctrine Designer

Investigation brief. Read-only pass over `feat/evelens-parity-plan` @ `c38389f`.

**Artifact claim:** "Their strongest original feature. Fits us better than them: a
doctrine is editable data, so ours would sync across a corp member's devices. Big UI,
but a real reason to pick us."

**Verdict:** PARTIALLY TRUE — the authoring path and the engine math are far cheaper
than the teardown implies (EFT fit → required skills is already shipped end-to-end:
`src/engine/import/fitToSkills.ts:53`, wired at
`src/features/skills/planner/clipboardImport.ts:97`), but the sync claim is wrong in
its premise. Sync is scoped **per character**, not per user/account
(`src/sync/planSync.ts:305,345`), and only the _active_ character is ever synced
(`src/app/App.tsx:62-65`). A Doctrine is inherently not per-character, so "which
character owns this record" is the load-bearing design decision, and cross-**user**
(corp-mate) sharing is out of scope by CONTEXT.md's own rule.

---

## Domain model (leading section — this is the decision the rest hangs off)

### Proposed glossary entry (for `CONTEXT.md`, round 4 additions)

> - **Doctrine**: A named set of required skill levels defining what a pilot must
>   train to fly a fleet role (e.g. "Muninn — Basic"). **Editable Data**: created
>   in-app, synced across the user's devices, never fetched from ESI. Usually
>   authored by pasting an EFT fit; the requirement set is the same
>   skill-level-target shape a **Skill Plan** uses, but unordered — a Doctrine is a
>   _goal_, a Skill Plan is a _route_. A Doctrine is assessed against many
>   **Characters** at once (trained / missing levels / missing SP / time to
>   satisfy), and can **generate** a personal Skill Plan for one Character.
>   Doctrines are shared between players by export/import payload, not by backend
>   sharing (see scope decisions).

Two supporting terms, only if the UI needs them named:

> - **Doctrine Gap**: for one Character × one Doctrine, the requirement levels not yet
>   trained, the SP still needed, and the training time to close it.
> - **Doctrine Roster**: the set of Characters a Doctrine is compared across. Not
>   persisted per doctrine in v1 — it is "all logged-in Characters".

### Q1: authored from scratch, or derived from an EFT fit?

**Both, and the fit path is already built.** VERIFIED:

- `src/engine/import/eftFit.ts:47` `parseEftFit(text) → { shipName, fitName, items[], errors[] }`.
  Pure, never throws, handles charges/`xN`/`/offline`/empty slots.
- `src/engine/import/fitToSkills.ts:53` `fitToSkills(fit, typeByName, requiredSkills) →
{ entries: PlanEntry[], errors[] }` — aggregates max required level per skill across
  hull + every module/charge/drone.
- `src/features/skills/planner/clipboardImport.ts:61-126` is the impure adapter:
  resolves names via `loadItemNameMap()` (`src/features/skills/typeCatalog.ts:26`),
  prefetches each type's dogma through `loadUniverseType`, converts with
  `extractRequiredSkills` (`src/features/skills/dogma.ts:81`), dedupes unknown-item
  warnings. `detectMode()` (`clipboardImport.ts:57`) already auto-detects EFT vs. plain
  skill-plan text.
- `src/features/skills/planner/ImportClipboardDialog.tsx:33` is the paste → preview →
  apply UI, already parameterized by `onApply(entries: PlanEntry[])` and `nameFor` —
  reusable verbatim for doctrine authoring with no change to the component.

**Consequence:** "paste a fit → doctrine" costs roughly _one call site_, not a feature.
The output type is `PlanEntry[]`, which is byte-identical to `SkillPlanRecord.entries`
(`src/db/index.ts:35`) — so a `DoctrineRecord.requirements: PlanEntry[]` introduces no
new serialization, no new merge concerns, and no new Firestore field types.

**Recommend:** author by EFT paste (primary), plain skill-plan paste (free, same
dialog), and manual add/edit via the existing `SkillPicker`
(`src/features/skills/planner/SkillPicker.tsx`). A doctrine covering several hulls is
just several pastes merged into one requirement set (max-level-wins, the same rule
`fitToSkills.ts:71` already applies within a fit).

**Caveat the teardown misses:** `fitToSkills` sorts output by `skillTypeID`
(`fitToSkills.ts:77`) for diff-stability. That is correct for a _requirement set_ and
useless as a _training order_. See Q2.

### Q2: distinct record type, or a flavour of Skill Plan? Live link or snapshot?

**RECOMMEND: distinct record type (`DoctrineRecord`), one-way snapshot generate into a
`SkillPlanRecord`, with an optional back-reference for a manual "regenerate".**

Rejected option — _Doctrine as a Skill Plan with a sentinel `characterId`_: it would
never sync. `skillPlanSpec.loadLocal` is
`db.skillPlans.where('characterId').equals(characterId)` (`src/sync/planSync.ts:345`)
and `handleOwnerHashChange` wipes by the same key (`planSync.ts:257`). A sentinel id
matches no real character, so the record is invisible to every sync pass. Also
pollutes the plan list UI (`PlanList.tsx:94`) and the `markPlanDeleted` tombstone
space.

Rejected option — _live link (doctrine edit propagates into every generated plan)_:

- Propagation is N-way: one doctrine edit must rewrite the generated plan for every
  assigned character, each bump touching `SkillPlanRecord.updatedAt`, each racing the
  LWW comparator in `mergeRecords` (`src/sync/merge.ts:128`) against another device
  that edited the same plan by hand. Two devices editing "the doctrine" and "the plan"
  produce a silent one-sided loss with no conflict surface.
- It also destroys the plan's own value: users reorder, insert Remap Markers
  (`markers?: number[]`, `src/db/index.ts:43`), and run the optimizer on generated
  plans. Any propagation must either clobber that work or attempt a merge nobody has
  specified.
- Upside (doctrine changes reach pilots automatically) is small in the real workflow:
  doctrines change on a patch cycle, not hourly, and a re-generate is one click.

**Snapshot, plus drift detection.** Add two optional fields to `SkillPlanRecord`:

```ts
/** Doctrine this plan was generated from, if any. Snapshot, not a live link. */
sourceDoctrineId?: string;
/** The doctrine's updatedAt at generation time — drives the "doctrine changed" hint. */
sourceDoctrineUpdatedAt?: number;
```

That gets the one genuine benefit of a live link (the UI can say "this plan was
generated from _Muninn — Basic_, which changed since; Regenerate?") with none of the
merge cost. Precedent for optional-additive-no-schema-bump is directly in-tree:
`markers?: number[]` was added to `SkillPlanRecord` with no `db.version()` bump because
it is not indexed (`src/db/index.ts:38-43`). Both new fields must still be threaded
through push/pull mapping — that is exactly the bug commit `d90e417` fixed.

**Generate must reorder.** VERIFIED gap: `DoctrineRecord.requirements` is
typeID-sorted; `normalizePlan` preserves user order where prereqs allow
(`src/engine/plan.ts:38`). A naive `entries = doctrine.requirements` therefore yields a
plan whose training order is "ascending typeID" — technically valid, practically
nonsense (it interleaves attribute pairs and trains cosmetic skills before tackle).
The generate step must pass the normalized steps through the existing
`suggestReorder` (`src/engine/optimizer/reorderSuggestion.ts`, exported from
`src/engine/optimizer/index.ts:20`), which groups by `(primary, secondary)` attribute
pair while honoring prereqs. Reuse, do not write a new sort.

### Q3: sharing between corp members — what it would actually take

**Out of scope. RECOMMEND export/import payload.** Evidence, strongest first:

1. **CONTEXT.md scope decision, v1:** "Corp/alliance: public info + the member's own
   view only. No director tooling." A shared corp doctrine library _is_ director
   tooling.
2. **There is no user/account identity anywhere in the backend.** The Firestore root
   is `/characters/{uid}` with `uid = char:{characterId}`
   (`src/sync/syncAuth.ts:19`, `firestore.rules:22`). CONTEXT.md's **Account**
   ("implicit app-level grouping of linked Characters") is aspirational — grep finds no
   implementation. So "share with my corp" has no principal to share _to_.
3. **The token carries no corp claim.** `mintFirebaseToken` returns
   `{ token, uid, ownerHash }` only (`src/sync/syncAuth.ts:23-27`); rules can test
   `request.auth.uid` and `request.auth.token.ownerHash` and nothing else
   (`firestore.rules:23-31`).

To actually ship cross-user sharing you would need, at minimum:

- A new Cloud Function contract: verify the EVE access token _and_ call ESI
  `/characters/{id}/` for `corporation_id`/`alliance_id`, mint that as a custom claim.
  Claims are baked at sign-in, so a corp change leaves a stale claim until re-mint —
  needs a TTL/refresh policy.
- A second document root outside `/characters/{uid}` (e.g. `/corpDoctrines/{corpId}/…`)
  with new rules: read if `token.corporationId == corpId`, write if… who? There is no
  role model, so either every member can overwrite every doctrine, or you invent
  roles — director tooling by another name (and ESI roles need
  `esi-characters.read_corporation_roles.v1`, a new scope forcing every character to
  re-authorize, `src/esi/scopes.ts:6`).
- An abuse/quota story: today every doc is provably owned by one authenticated
  character, so a hostile write can only damage that character's own data. A shared
  collection is the first multi-tenant write surface in the app and needs write
  validation in rules (`firestore.rules` currently validates only `ownerHash`).
- Deletion/ownership semantics when the authoring character leaves the corp.

That is a milestone in its own right and it contradicts a v1 scope decision.

**In-scope alternative — export/import payload.** A Doctrine is a small JSON object
(`{ name, requirements: PlanEntry[] }`), so:

- **Export:** copy JSON to clipboard / download `.json`. Optionally also export the
  human-readable in-game format via existing `exportPlanToClipboard`
  (`src/engine/clipboardExport.ts:9`) for pasting into a forum post.
- **Import:** paste JSON, or paste the EFT fit that the doctrine came from (already
  works). Pairs directly with **item 06** (.emp/XML importer): the same
  "paste/drop a payload → preview → apply" shell serves both, and an EVEMon-format
  doctrine/plan import lands as an extra parser under `src/engine/import/`.
- Skill-name-based (not typeID-based) export is worth considering for
  human-editability, but typeIDs are stable and the SDE map is present
  (`src/features/skills/typeCatalog.ts:14`) — recommend typeIDs with names embedded as
  a comment/`displayName` for readability.

Cost: this is a day, not a milestone, and it is genuinely enough for the real
workflow (an FC posts the doctrine payload in corp chat / a forum thread).

**Record this as `docs/adr/0003-doctrines-shared-by-export-not-backend.md`**, not as a
CONTEXT.md bullet. Everything above is already ADR-shaped — context, decision,
consequences, enumerated rejected alternatives — and it is the same species of
security-model decision as ADR 0001.

### Q4: which character owns a `DoctrineRecord`? (the real sync problem)

A Doctrine is cross-character but the sync spine is per-character. Options:

- **(a) `authorCharacterId` + a per-character `doctrines` subcollection.** Locally
  correct with zero work: Dexie is a single shared database, so a doctrine authored
  while char A is active is readable when char B is active (just don't filter the
  Dexie query by `characterId`). Two real defects: (i) a fresh device signed in only as
  char B never pulls char A's doctrines — `triggerSync` is called only for the active
  character (`src/app/App.tsx:62-65`); (ii) `handleOwnerHashChange` wipes
  by `characterId` (`src/sync/planSync.ts:257`), so selling the author character
  deletes doctrines the user's other characters still use.
- **(b) Replicate a copy under every character.** N copies of the same logical record,
  N-way LWW churn, no canonical id. Reject.
- **(c) (a) + sync every logged-in character, not only the active one.**

**RECOMMEND (a)+(c).** VERIFIED that (c) is architecturally supported today and merely
unwired:

- `triggerSync` is already serialized **globally**, not per character, precisely so
  two characters can't race the single Firebase session
  (`src/sync/planSync.ts:192-194, 225-244`, header comment lines 16-23).
- `ensureSignedIn` already swaps the Firebase session per character and is a no-op when
  it already matches (`src/sync/syncAuth.ts:35-38`).
- So `for (const c of await db.characters.toArray()) await triggerSync(c.characterId)`
  is safe by construction. The change is ~5 lines in `src/app/App.tsx:62-65` plus a
  test. It is not new infrastructure.

Defect (ii) still needs an explicit decision: either (1) keep `handleOwnerHashChange`
wiping doctrines with the author character (simple, occasionally surprising), or (2)
on ownerHash change, re-home surviving doctrines to another logged-in character before
the wipe. Recommend (1) for v1 + a one-line note in the export/import UI ("export
doctrines you care about") — (2) invents a re-homing rule with no owner.

**Note for the orchestrator:** (c) benefits items 02/07/09 too (any multi-character
view wants all characters' editable data present). Flag as a shared change, not a
doctrine-private one.

---

## Verified baseline

| Claim                                           | Verdict                                                                                                                                                                                                                                                                                    | Citation                                                                                                                                                                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EFT fit → required skills already exists        | CONFIRMED                                                                                                                                                                                                                                                                                  | `src/engine/import/eftFit.ts:47`, `src/engine/import/fitToSkills.ts:53`                                                                                                                                                                           |
| …and is already wired to a paste-preview dialog | CONFIRMED                                                                                                                                                                                                                                                                                  | `src/features/skills/planner/clipboardImport.ts:141`, `ImportClipboardDialog.tsx:33`                                                                                                                                                              |
| Training-time math exists and is pure           | CONFIRMED                                                                                                                                                                                                                                                                                  | `src/engine/plan.ts:10`, `src/engine/schedule.ts:28`, `src/engine/sp.ts:23-51`                                                                                                                                                                    |
| Attribute-grouped reorder exists                | CONFIRMED                                                                                                                                                                                                                                                                                  | `src/engine/optimizer/reorderSuggestion.ts`, exported `src/engine/optimizer/index.ts:20`                                                                                                                                                          |
| Sync is per-**user** / account-scoped           | **FALSE** — per character                                                                                                                                                                                                                                                                  | `src/sync/planSync.ts:305,345`; `src/sync/syncAuth.ts:19`; `firestore.rules:22`                                                                                                                                                                   |
| Sync runs for all characters                    | **FALSE** — active character only                                                                                                                                                                                                                                                          | `src/app/App.tsx:62-65`                                                                                                                                                                                                                           |
| ESI reads work for a non-active character       | CONFIRMED (today, no work needed)                                                                                                                                                                                                                                                          | `src/auth/session.ts:104-119` (`getValidAccessToken(characterId)`), `src/esi/client.ts:23` (global provider), `src/features/skills/data.ts:37` (`loadCharacterSkills(characterId)`), `esiCache` keyed `[characterId+key]` (`src/db/index.ts:103`) |
| A second synced collection is a proven pattern  | CONFIRMED — `buildPlans` added in `29a8a88`                                                                                                                                                                                                                                                | `src/sync/planSync.ts:371-410`, `firestore.rules:41-47`                                                                                                                                                                                           |
| `DataTable` / `CharacterAvatar` exist           | **FALSE** — both ○, absent from `src/components/ui/index.ts`                                                                                                                                                                                                                               | `docs/DESIGN.md` §4; `src/components/ui/index.ts`                                                                                                                                                                                                 |
| Doc staleness (bank these)                      | `/market` **is** routed contra ARCHITECTURE §6 (`src/app/App.tsx:79`); `markers.ts` exists contra §6's "no Marker implementation" (`src/features/skills/planner/markers.ts`); `SkillBar` exists contra DESIGN §4 ○ — but at `src/features/skills/SkillBar.tsx`, **not** in `components/ui` |                                                                                                                                                                                                                                                   |

## Gap

1. No `Doctrine` concept: not in `CONTEXT.md`, no record type, no table, no route.
2. No cross-character comparison anywhere in the app. Every route reads
   `activeCharacterId` (`src/routes/SkillPlans.tsx:55`, `Skills.tsx`, `Overview.tsx`).
   No batch "load these N characters' sheets" helper exists.
3. No gap/missing-SP math. Nothing in `src/engine` answers "which requirement levels
   is this character short of, and by how much SP".
4. Sync driver never touches non-active characters (`src/app/App.tsx:62-65`).
5. No `DataTable` primitive; the doctrine comparison grid is exactly what it is for.
6. `normalizePlan` **throws** on unknown typeID and on circular prereqs
   (`src/engine/plan.ts:24,27`). Every other import-path module is never-throw
   (`eftFit.ts:46`, `fitToSkills.ts:50`). A doctrine imported from a fit can carry a
   typeID missing from the SDE snapshot, so the comparison layer must not call
   `normalizePlan` bare.

## Engine vs UI split

**`src/engine/doctrine/` (new, pure, TDD-required).** Everything here is math over
existing engine types; no fetch/DOM/Dexie.

- Gap computation per character, missing-SP totals, time-to-satisfy, and the
  never-throw wrapper around `normalizePlan`.
- Explicitly **not** in engine: which characters to compare, loading their sheets,
  Dexie/Firestore, sorting/formatting for display.

**`src/features/doctrine/` (impure adapters).**

- Loading N characters' `CharacterSheet`s from ESI/cache (shared helper — see below).
- Doctrine CRUD against Dexie + `scheduleSync`.
- Generating a `SkillPlanRecord` from a doctrine (needs `crypto.randomUUID`, Dexie
  write, the reorder call) — orchestration, not math.
- Export/import payload adapters (clipboard/File API).

**`src/routes/Doctrines.tsx`.** Route composition + `Layout` nav entry only.

## Files touched

| File                                                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT.md`                                              | Add **Doctrine** (+ _Doctrine Gap_) to glossary, round 4; add scope decision "Doctrines are shared by export/import payload; no cross-user backend sharing in v1 — see ADR 0003".                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `docs/adr/0003-doctrines-shared-by-export-not-backend.md` | **New ADR.** Q3 below is already ADR-shaped (context / decision / consequences / four enumerated rejected alternatives with a security rationale), CLAUDE.md points decisions at `docs/adr/`, and ADR 0001 is the same species of decision. Record it there; keep CONTEXT.md's line as a pointer.                                                                                                                                                                                                                                                                                                                           |
| `src/db/index.ts`                                         | Add `DoctrineRecord` interface; add `doctrines: EntityTable<DoctrineRecord,'id'>` to the `db` type; **additive** `db.version(4).stores({...v3 stores unchanged..., doctrines: 'id, authorCharacterId'})`. Add optional `sourceDoctrineId?`/`sourceDoctrineUpdatedAt?` to `SkillPlanRecord` (unindexed → no bump needed for those two, same as `markers?` at :43).                                                                                                                                                                                                                                                           |
| `src/db/index.test.ts`                                    | Assert v4 opens, v3 data survives, `doctrines` queryable by `authorCharacterId`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/sync/merge.ts`                                       | Add `RemoteDoctrineDoc extends RemoteDoc`; add `sourceDoctrineId?`/`sourceDoctrineUpdatedAt?` to `RemotePlanDoc` (mirrors the `markers?` line added in `d90e417`). No change to `mergeRecords` — it is already generic (`merge.ts:62`).                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/sync/planSync.ts`                                    | (1) `doctrineTombstonesKey`; (2) `doctrineSpec: CollectionSpec<DoctrineRecord, RemoteDoctrineDoc>` modelled on `buildPlanSpec` (:371-410) — `name: 'doctrines'`, `loadLocal` by `authorCharacterId`, explicit `toRemoteDoc`/`toLocalRecord` field lists, `...(x !== undefined ? {x} : {})` for optionals; (3) `markDoctrineDeleted`; (4) call `syncEditableCollection(doctrineSpec, ctx)` in `syncCharacter` (:423); (5) wipe `doctrines` in `handleOwnerHashChange` (:257) + clear its tombstones; (6) thread `sourceDoctrineId`/`sourceDoctrineUpdatedAt` through `skillPlanSpec.toRemoteDoc`/`toLocalRecord` (:346-366). |
| `src/sync/index.ts`                                       | Export `markDoctrineDeleted`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/sync/planSync.test.ts`                               | New `describe('triggerSync: doctrines')` mirroring the plans block; plus a `d90e417`-style round-trip test for the two new plan fields (push, pull, and "key omitted when undefined").                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `firestore.rules`                                         | One `match /doctrines/{doctrineId}` block inside `match /characters/{uid}`, copying lines 41-47 verbatim (get hash-strict, list uid-only, create/update hash-strict both ways, delete uid-only). Update the file header comment listing synced collections.                                                                                                                                                                                                                                                                                                                                                                 |
| `firestore.indexes.json`                                  | **No change.** Currently `{"indexes":[],"fieldOverrides":[]}`; the only query is `where('ownerHash','==',x)` (`planSync.ts:297`), single-field, served by automatic indexes.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/app/App.tsx`                                         | Sync **all** logged-in characters on boot, not only the active one (:62-65). Add `/doctrines` route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/app/Layout.tsx`                                      | Nav entry for Doctrines (under the Skills group).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/features/skills/planner/ImportClipboardDialog.tsx`   | Reused as-is if possible. Only likely change: make the "already trained" dimming (`:19-24`) optional, since a doctrine is authored without a character context.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/i18n/locales/en.json`                                | New `doctrines.*` namespace (below).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `docs/ARCHITECTURE.md`                                    | New `src/features/doctrine` + `src/engine/doctrine` rows in §2; §3 "editable collections" now three; §6 inventory row. (Also worth correcting the known-stale rows while in there.)                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `docs/DESIGN.md`                                          | Flip `DataTable`/`CharacterAvatar` to ✓ once built; correct `SkillBar` to ✓ and record its promotion to `components/ui`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `e2e/support/mockEsi.ts`                                  | Multi-character skills/attributes/implants fixtures (today's fixtures are single-character — `e2e/support/fixtureData.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## New modules

**Engine (pure, TDD-required):**

- `src/engine/doctrine/types.ts` — `DoctrineRequirement` (alias of `PlanEntry`),
  `DoctrineGap`, `DoctrineComparison` result shapes.
- `src/engine/doctrine/gap.ts` — `doctrineGap(...)`: the per-character answer.
- `src/engine/doctrine/compare.ts` — `compareDoctrine(...)`: map gap over N characters,
  never throwing, per-character error slot.
- `src/engine/doctrine/generatePlan.ts` — pure `doctrineToPlanEntries(requirements,
skills, trained)`: normalize → `suggestReorder` → collapse back to `PlanEntry[]`.
  (Pure; the Dexie write stays in the feature layer.)
- `src/engine/doctrine/payload.ts` — pure serialize/parse of the export/import JSON
  payload, never-throw with a `{ doctrine, errors }` result (same convention as
  `skillPlanPaste.ts`).

**Feature (impure):**

- `src/features/doctrine/data.ts` — Dexie CRUD (`createDoctrine`, `renameDoctrine`,
  `updateRequirements`, `deleteDoctrine` → `markDoctrineDeleted` + `scheduleSync`).
- `src/features/doctrine/roster.ts` — thin wrapper over the shared multi-character
  sheet loader; adapts ESI shapes to `CharacterSheet` via the existing
  `toTrainedSkillsMap`/`toEngineAttributes` (`src/features/skills/skillMap.ts:41,62`).
- `src/features/doctrine/generate.ts` — calls `doctrineToPlanEntries`, writes a
  `SkillPlanRecord` with `sourceDoctrineId`/`sourceDoctrineUpdatedAt`, `scheduleSync`.
- `src/features/doctrine/DoctrineList.tsx` — CRUD list (near-copy of `PlanList.tsx:94`).
- `src/features/doctrine/DoctrineEditor.tsx` — requirement list + add/remove +
  "Import fit" button (reuses `ImportClipboardDialog`).
- `src/features/doctrine/ComparisonTable.tsx` — the N×M grid; consumes `DataTable`.
- `src/features/doctrine/DoctrineExportDialog.tsx` / `DoctrineImportDialog.tsx`.
- `src/routes/Doctrines.tsx` — route shell.

### Specified pure functions

```ts
// src/engine/doctrine/types.ts
export interface DoctrineGap {
  /** Requirement levels not yet met, expanded to single-level steps incl. prereqs. */
  missingSteps: ScheduledStep[];
  /** Requirement entries the character already satisfies. */
  satisfied: PlanEntry[];
  /** SP still needed, summed over missingSteps (prereq-inserted steps INCLUDED). */
  missingSp: number;
  /** Seconds to close the gap = last missingStep.cumulativeSeconds (0 when none). */
  secondsToSatisfy: number;
  /** True when missingSteps is empty. */
  satisfiedFully: boolean;
  /** Requirement typeIDs absent from the skill catalog, or cyclic. Never throws. */
  errors: { skillTypeID: number; reason: 'unknown-skill' | 'circular-prereq' }[];
}

// src/engine/doctrine/gap.ts
export function doctrineGap(
  requirements: readonly PlanEntry[],
  sheet: CharacterSheet, // engine/types.ts:38 — attributes+implants+trainedSkills
  skills: ReadonlyMap<number, EngineSkill>,
  options?: { boosters?: Booster[]; startDate?: Date }
): DoctrineGap;

// src/engine/doctrine/compare.ts
export interface DoctrineComparisonRow {
  characterId: number;
  gap: DoctrineGap;
}
export function compareDoctrine(
  requirements: readonly PlanEntry[],
  sheets: ReadonlyMap<number, CharacterSheet>,
  skills: ReadonlyMap<number, EngineSkill>,
  options?: { boosters?: Booster[]; startDate?: Date }
): DoctrineComparisonRow[]; // one row per sheet, input order preserved

// src/engine/doctrine/generatePlan.ts
export function doctrineToPlanEntries(
  requirements: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trained: ReadonlyMap<number, TrainedSkill>
): { entries: PlanEntry[]; errors: DoctrineGap['errors'] };
```

**Reuse, do not reimplement** (all verified present):

- `normalizePlan` (`plan.ts:10`) already expands entries → per-level steps, inserts
  prereqs recursively, and skips already-trained levels. That _is_ the gap expansion.
- `computeSchedule` (`schedule.ts:28`) already returns `sp`, `seconds`,
  `cumulativeSeconds` per step, with booster-expiry rate breakpoints. `secondsToSatisfy`
  is the last element's `cumulativeSeconds`; `missingSp` is `sum(step.sp)`. No new
  `spBetween` call needed — `computeSchedule:68` already does it.
- `suggestReorder` (`optimizer/index.ts:20`) for the generated plan's order.
- `toTrainedSkillsMap` / `toEngineAttributes` (`skillMap.ts:41,62`) for ESI → engine.
- `formatDuration` (`src/lib/duration.ts`) for display.
- So `doctrineGap` is a _composition plus an error boundary_, ~40 lines. The genuinely
  new logic is only: never-throw wrapping, `satisfied` partitioning, and the SP sum.

**Two decisions to bake into the tests:**

1. **Prereq-inserted steps count toward missing SP and time.** They are unavoidable
   training. Excluding them would make the badge lie (a pilot needing Gunnery V as a
   prereq would show "0 SP missing"). Assert this explicitly.
2. **Never throw.** `doctrineGap` must pre-filter requirements whose `skillTypeID` is
   absent from `skills`, and catch the cycle error from `normalizePlan:27`, folding
   both into `errors[]` while still returning a usable gap for the rest. Without this,
   one bad typeID from a stale SDE snapshot blanks the whole comparison table.

## Shared primitives needed

Named asks for the orchestrator to assign — **do not** let this feature build private
one-offs:

1. **`DataTable`** (`docs/DESIGN.md` §4 ○, confirmed absent from
   `src/components/ui/index.ts`). Dense sortable table: `panel-2` uppercase header row,
   hairline row separators, `tabular-nums` right-aligned numerics, row hover `panel-2`,
   sticky first column (the character column in an N×M grid). The comparison table is
   the strongest justification in the app for building it; items 02/07/09 want it too.
2. **`CharacterAvatar`** (§4 ○, absent). `characterPortraitUrl` already exists
   (`src/app/images.ts:6`) and is inlined ad hoc at `src/routes/Characters.tsx:62` and
   `src/routes/Overview.tsx:98` — a third inline copy in the doctrine roster is the
   moment to extract it. Note `DESIGN.md` says `rounded-full`, but both existing call
   sites use `rounded-xs`; the primitive owner must reconcile.
3. **`SkillBar` promoted to `src/components/ui`.** It exists at
   `src/features/skills/SkillBar.tsx` — a doctrine feature importing across feature
   boundaries is the smell. Move + export from `components/ui/index.ts`.
4. **Multi-character sheet loader** — owned by whoever is doing items 02/07/09. **This
   is not a blocker; the mechanism already works** (`getValidAccessToken(characterId)`
   at `session.ts:104`, `loadCharacterSkills(characterId)` at `data.ts:37`, cache keyed
   `[characterId+key]`). What is missing is one batch helper. Interface I need:

   ```ts
   // proposed: src/features/character/sheets.ts (owner: multi-character item)
   export interface CharacterSheetResult {
     characterId: number;
     name: string;
     sheet: CharacterSheet | null; // engine/types.ts:38
     fetchedAt: number | null; // for DataAgeBadge; oldest of the parts
     needsReauth: boolean; // per character — must NOT blank the whole grid
   }
   export function loadCharacterSheets(
     characterIds: readonly number[]
   ): Promise<Map<number, CharacterSheetResult>>;
   ```

   Two wrinkles the owner must handle: (i) `loadImplantBonuses` does an N+1 type fetch
   per character (`src/features/skills/data.ts:108-113`) — 10 characters is a lot of
   round trips; the per-type cache is global (`GLOBAL_CACHE_CHARACTER_ID`) so it
   amortizes, but the first load needs concurrency capping. (ii) One character's
   401/403 must degrade that row only, surfacing `ReauthBanner`
   (`src/components/ui/ReauthBanner.tsx`) or an inline per-row re-auth affordance, not
   fail the batch.

5. **Sync-all-characters on boot** (`src/app/App.tsx:62-65`). Shared change; benefits
   every multi-character item. Verified safe today (see Q4).

## Design tokens / components used

- Everything inside `Panel`; no nested Panels — inner surfaces use `bg-panel-2`
  (DESIGN §5).
- **One `primary` button per view.** Doctrine list view: "New Doctrine". Editor view:
  "Import fit". Comparison view: "Generate plan". Everything else `ghost`; delete is
  `danger` outline (matches `PlanList.tsx:80`).
- Micro-headings uppercase `text-[11px] font-semibold tracking-widest text-text-dim`,
  exactly as `PlanList.tsx:108` and `ComputedQueue.tsx:37`.
- `rounded-xs` on every rectangle; 1px `border-line` hairlines; hover
  `border-line-bright`.
- Comparison grid cell tones — **color is never the sole signal**, always paired with
  text: `success` + "✓" for satisfied, `warning` + the missing level (e.g. "IV → V")
  for partial, `danger` + "—" for not-started. Missing-SP and time columns are
  `tabular-nums`, right-aligned, `text-sm`.
- Missing-SP badge: `StatChip` with tone `warning`, or a bare `text-warning` cell in the
  grid (a chip per cell in a 10×40 grid is too loud — use chips only in the per-character
  summary strip).
- **`DataAgeBadge` is required**: the grid is API-derived (each character's trained
  skills). Show one badge per character row (ages differ per character), or one badge
  for the oldest with a tooltip listing per-character ages. Recommend per-row — it also
  gives the re-auth affordance somewhere to live.
- `SkillBar` (5-segment) in the per-character requirement detail view: filled accent =
  trained, `line` = missing. Reads instantly for "trained to III, doctrine wants V".
- `EmptyState` for "no doctrines yet" (hint: "Paste an EFT fit to create one") and for
  "no other characters logged in".
- `Tooltip`/`InfoTooltip` on the "Missing SP" column header — the prereq-inclusion rule
  is non-obvious and must be stated in the UI.
- `Tabs` inside a doctrine: **Requirements** | **Comparison**. Not for nav.

## UI — shippable slices in dependency order

**Slice 0 — sync all characters** (`src/app/App.tsx:62-65`). No UI. Prerequisite for any
doctrine reaching a second device. The loop itself is ~5 lines and safe by construction
(`planSync.ts:192-194`, `syncAuth.ts:35-38`), but two things stop it being a one-liner:

- **Cost per boot.** Every character means one `mintFirebaseToken` invocation plus three
  Firestore collection queries (plans, buildPlans, doctrines) — 10 characters is 10
  function calls and 30 queries on every cold start. CONTEXT.md's sync decision is
  explicitly "Firebase (Firestore + one Cloud Function). Free scale." Either cache the
  minted custom token per character with a TTL, or sync non-active characters lazily /
  on a longer interval than the active one.
- **Session slot ordering.** `ensureSignedIn` owns a single Firebase session slot
  (`src/sync/syncAuth.ts:35-38`), so after the loop the session belongs to whichever
  character ran last, and the next `scheduleSync(activeCharacterId)` re-mints. **Order
  the loop so the active character runs last.** One line, easily missed.

**Slice 1 — storage + sync spine.** `DoctrineRecord`, `db.version(4)`, `doctrineSpec`,
`markDoctrineDeleted`, `firestore.rules` block, the `d90e417`-style push/pull tests. No
UI beyond a stub route. This is the piece that must be right; it is also a near-verbatim
copy of `buildPlanSpec`.

**Slice 2 — authoring.** `/doctrines` route: `DoctrineList` (create/rename/duplicate/
delete, cloned from `PlanList.tsx`) + `DoctrineEditor` (requirement rows,
add via `SkillPicker`, "Import fit" reusing `ImportClipboardDialog` unchanged). Cheapest
high-value slice — the EFT path is already built.

**Slice 3 — engine gap math.** `doctrineGap` + `compareDoctrine` + tests. Pure, no UI.
Can run in parallel with slice 2.

**Slice 4 — single-character readout.** Active character only: "You are missing 6 of 31
requirements · 4.2M SP · 12d 4h", the missing-requirement list with `SkillBar`, and the
"show only missing" toggle. Needs no multi-character work at all. **This is where v1
should stop.**

**Slice 5 — generate Skill Plan.** `doctrineToPlanEntries` → `SkillPlanRecord` with
`sourceDoctrineId`, navigate to `/skills/plans`. Needs the `suggestReorder` call
(Q2) and the two new plan fields threaded through sync.

**Slice 6 — N×M comparison grid.** Depends on `DataTable` + `CharacterAvatar` +
`loadCharacterSheets`. Character rows × requirement columns (or the transpose — with 30+
requirements, characters-as-rows and _summary_ columns, expanding to per-requirement
detail, is the readable layout). "Show only missing" filters columns. Per-row
`DataAgeBadge` + re-auth. This is the expensive slice.

**Slice 7 — export/import payload.** `payload.ts` + two dialogs. Merge with item 06's
importer shell if that lands first.

### Defensible v1 (slices 0-5)

Doctrines are creatable from a pasted fit, sync across the user's devices, tell the
**active** character exactly what it is missing (levels, SP, training time), and
generate a properly-ordered personal Skill Plan. **Defers:** the multi-character
comparison grid, the roster concept, export/import. That v1 is genuinely useful (a
solo player checking "can I fly the doctrine Muninn?") and it de-risks the expensive
slice behind a working data model — but it is _not_ the differentiator until slice 6
lands. Be honest with stakeholders about that: the teardown's selling point is the
comparison grid.

## Tests

**TDD-required (CLAUDE.md — failing test first), colocated:**

- `src/engine/doctrine/gap.test.ts`
  - fully-trained character → `satisfiedFully: true`, `missingSp: 0`, `secondsToSatisfy: 0`
  - partially-trained (III, needs V) → two missing steps, SP equals
    `spForLevel(rank,5) - spForLevel(rank,3)`
  - **prereq-inserted steps are counted** in `missingSp` and `secondsToSatisfy`
  - requirement whose typeID is not in the catalog → `errors: [{reason:'unknown-skill'}]`
    and the _other_ requirements still evaluated (does **not** throw — guards
    `plan.ts:24`)
  - circular prereqs → `errors: [{reason:'circular-prereq'}]`, no throw (guards
    `plan.ts:27`)
  - implants raise the rate → `secondsToSatisfy` strictly lower with implants than
    without, same `missingSp`
  - booster expiring mid-gap → time between the all-boosted and un-boosted bounds
    (exercises `schedule.ts:72-87`)
  - empty requirements → satisfied, zeroes, no errors
- `src/engine/doctrine/compare.test.ts`
  - one row per input sheet, input order preserved
  - a sheet whose data is degenerate produces an errored row, not a thrown batch
  - rows are independent (character A's error doesn't affect B)
- `src/engine/doctrine/generatePlan.test.ts`
  - output entries satisfy every requirement when normalized against the same sheet
  - output is **not** merely typeID-ascending: attribute-paired skills are adjacent
    (asserts `suggestReorder` actually ran — guards the `fitToSkills.ts:77` sort trap)
  - `isValidOrder` (`optimizer/index.ts:20`) holds on the result
  - already-trained requirements are omitted
- `src/engine/doctrine/payload.test.ts`
  - round-trip serialize → parse is identity
  - malformed JSON / wrong shape → `errors[]`, never throws
  - unknown fields in a future payload are ignored, not fatal

**Sync (the historically buggy part — commit `d90e417`):**

- `src/sync/planSync.test.ts`
  - `describe('triggerSync: doctrines')` mirroring the existing plans block: pushes a
    local-only doctrine with `ownerHash` + `deleted:false`; pulls a remote-only one;
    LWW by `updatedAt`; `markDoctrineDeleted` writes a tombstone and the remote doc
    becomes `deleted:true`; a doctrine deleted remotely is removed locally
  - `sourceDoctrineId`/`sourceDoctrineUpdatedAt` round-trip through push **and** pull,
    and the keys are **omitted entirely when undefined** (Firestore rejects
    `undefined` — the exact assertion pattern at `planSync.test.ts` in `d90e417`)
  - `handleOwnerHashChange` wipes doctrines + their tombstones
- `src/db/index.test.ts` — v4 opens; v3 records survive the upgrade.

**Component:**

- `DoctrineList.test.tsx` — create/rename/delete confirm (mirror any `PlanList` coverage).
- `ComparisonTable.test.tsx` — "show only missing" toggle hides satisfied
  requirements; a character with `needsReauth` renders a re-auth affordance and the
  other rows still render.

**E2E** (`e2e/doctrines.spec.ts`, new):

- login → `/doctrines` → paste an EFT fit → doctrine created with N requirements →
  readout shows missing count → "Generate plan" lands a plan on `/skills/plans`.
- `e2e/support/mockEsi.ts` needs a **second** character's
  `skills`/`attributes`/`implants` responses (today's fixtures are single-character,
  `e2e/support/fixtureData.ts`) — required for slice 6's e2e, not for v1's.
- Note `playwright.config.ts` blanks `VITE_FIREBASE_*`, so `isSyncConfigured()` is
  false in e2e — doctrine sync is unit-tested, not e2e-tested. Consistent with plans.

## i18n keys

New `doctrines.*` namespace in `src/i18n/locales/en.json` (top-level, alongside
`plans`). All strings through i18next per CLAUDE.md.

Plus **one key in the existing `nav` namespace** (`Layout.tsx` reads `nav.*`; 16 keys
today): `nav.doctrines`.

```
doctrines.title
doctrines.create, doctrines.rename, doctrines.duplicate, doctrines.delete,
doctrines.deleteConfirm, doctrines.newDoctrineName, doctrines.namePlaceholder,
doctrines.copySuffix
doctrines.emptyTitle, doctrines.emptyHint, doctrines.selectHint
doctrines.tabRequirements, doctrines.tabComparison
doctrines.requirements, doctrines.requirementsEmpty, doctrines.addSkill,
doctrines.removeRequirement, doctrines.importFit, doctrines.importedFromFit
doctrines.columnCharacter, doctrines.columnSkill, doctrines.columnRequired,
doctrines.columnTrained, doctrines.columnMissingSp, doctrines.columnTimeToTrain
doctrines.showOnlyMissing
doctrines.statusSatisfied, doctrines.statusPartial, doctrines.statusMissing
doctrines.missingSp, doctrines.missingSpTooltip   // "Includes prerequisite skills."
doctrines.satisfiedCount        // "{{met}} of {{total}} requirements met"
doctrines.timeToSatisfy, doctrines.alreadySatisfied
doctrines.generatePlan, doctrines.generatePlanNamed, doctrines.generatedPlanName,
doctrines.regenerate, doctrines.sourceChanged
doctrines.export, doctrines.exportCopied, doctrines.import, doctrines.importPaste,
doctrines.importPreview, doctrines.importApply, doctrines.importCancel,
doctrines.importError, doctrines.importedCount
doctrines.unknownSkill, doctrines.circularPrereq, doctrines.characterNeedsReauth
doctrines.noOtherCharacters
```

## Sync / Dexie impact

**Yes — this is the heaviest non-UI part, and it is the part with a known past bug.**

New Editable Data record type:

```ts
/** User-editable Doctrine: required skill levels for a fleet role (CONTEXT.md). */
export interface DoctrineRecord {
  id: string;
  /** Character whose sync subcollection carries this doctrine. Doctrines are
   *  cross-character in the UI — never filter the Dexie read by this. */
  authorCharacterId: number;
  name: string;
  /** Required skill levels. Same shape as SkillPlanRecord.entries.
   *  INVARIANT: always written sorted ascending by skillTypeID. */
  requirements: PlanEntry[];
  /** Hull(s) the doctrine was imported from, for display only. */
  shipNames?: string[];
  /** Epoch ms of the last edit. */
  updatedAt: number;
}
```

**Storage invariant — canonically sort `requirements` on every write.** A Doctrine is
semantically unordered, but `requirements` is an ordered array merged by whole-record
LWW (`src/sync/merge.ts:128`). Two devices adding the same two skills in different order
produce semantically identical, byte-different arrays and LWW picks one arbitrarily.
Always write sorted ascending by `skillTypeID` — the same rationale
`src/engine/import/fitToSkills.ts:5` already states ("deterministic, diffable result
independent of item order"), and `fitToSkills.ts:77` already produces that order for
free on the import path. Assert it in `gap.test.ts`'s sibling CRUD tests.

Dexie bump — **additive, never mutate a shipped version** (`src/db/index.ts:97,106`):

```ts
db.version(4).stores({
  characters: 'characterId',
  tokens: 'characterId',
  settings: 'key',
  skillPlans: 'id, characterId',
  esiCache: '[characterId+key]',
  buildPlans: 'id, characterId',
  doctrines: 'id, authorCharacterId',
});
```

`sourceDoctrineId`/`sourceDoctrineUpdatedAt` on `SkillPlanRecord` are **unindexed
optional** fields — no version bump needed for them (precedent: `markers?` at
`src/db/index.ts:38-43`).

Push/pull mapping — the `d90e417` pattern, three places, all required:

1. `src/sync/merge.ts` — declare the field on the remote doc interface
   (`RemoteDoctrineDoc`, and the two new keys on `RemotePlanDoc`).
2. `planSync.ts` `toRemoteDoc` — explicit field list, never a spread
   (`CollectionSpec` comment, `planSync.ts:274`); optional fields via
   `...(x !== undefined ? { x } : {})` because **Firestore rejects `undefined`**
   (`planSync.ts:352,387`).
3. `planSync.ts` `toLocalRecord` — the mirror, stripping `ownerHash`/`deleted`.

Tombstones: `markDoctrineDeleted` via the existing `recordDeletion` helper
(`planSync.ts:142`). A plain `db.doctrines.delete()` **resurrects** the record from the
remote copy — that is the documented failure mode (`planSync.ts:155-160`).

Owner-hash wipe: add `db.doctrines.where('authorCharacterId').equals(id).delete()` +
clear its tombstones in `handleOwnerHashChange` (`planSync.ts:253-263`).

No `functions/` change: `mintFirebaseToken` is collection-agnostic.
No `firestore.indexes.json` change (single-field equality only).

## New ESI scopes

**None.** Everything the feature reads is already granted:
`esi-skills.read_skills.v1`, `esi-skills.read_skillqueue.v1`,
`esi-clones.read_implants.v1` (`src/esi/scopes.ts:7-9`). Character portraits come from
`images.evetech.net`, unauthenticated (`src/app/images.ts:6`). This is important — a new
scope would force **every** character to re-authorize (ARCHITECTURE §4).

The only scope that would appear is `esi-characters.read_corporation_roles.v1`, and
only under the rejected cross-user-sharing design (Q3). Another reason to reject it.

## Cost

**Confirmed: L** for the full feature — the _distribution_ is what the teardown gets
wrong. Slice-by-slice:

| Slice                        | Cost                    | Note                                                                                                                                                         |
| ---------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0 — sync all characters      | S (1-2 days)            | `App.tsx:62-65`; serialization is safe by construction (`planSync.ts:192-194`, `syncAuth.ts:35-38`), but see the two caveats below — this is not a one-liner |
| 1 — storage + sync spine     | S (2-3 days)            | Near-verbatim copy of `buildPlanSpec` (`29a8a88`); the tests are the work                                                                                    |
| 2 — authoring UI             | S (2-3 days)            | `ImportClipboardDialog` + `SkillPicker` reused unchanged; `DoctrineList` clones `PlanList`                                                                   |
| 3 — engine gap math          | S (2 days)              | Composition of `normalizePlan`+`computeSchedule`; TDD; the error boundary is the only subtlety                                                               |
| 4 — single-character readout | S (2-3 days)            | Plain list + `SkillBar` + toggle                                                                                                                             |
| 5 — generate Skill Plan      | XS-S (1-2 days)         | Must call `suggestReorder`; two new synced plan fields                                                                                                       |
| 6 — N×M comparison grid      | **M-L (1.5-2.5 weeks)** | `DataTable` + `CharacterAvatar` + `loadCharacterSheets` + per-row data-age/re-auth + a genuinely hard layout problem at 30+ requirements × 10 characters     |
| 7 — export/import            | S (2-3 days)            | Or ~1 day riding item 06's shell                                                                                                                             |

Slices 0-5 ≈ **M, upper end** (10-14 working days — plan for the top of the spec's
"week or two", not two weeks flat). Adding 6-7 lands the whole feature at
**L, 4-6 weeks**. So Cost L is confirmed, with a materially different distribution than
the teardown implies:

- **Authoring is overstated.** "A doctrine is a set of required skill levels derived
  from a fit" sounds like the hard part; it is already shipped and needs a call site
  (`clipboardImport.ts:141`).
- **Sync scoping is understated.** The teardown's "a doctrine is editable data, so ours
  would sync across a corp member's devices" glosses over the fact that sync is
  per-character and active-character-only. It is a cheap fix (slice 0) but it is a real
  precondition, and the _corp-mate_ half of that sentence is out of scope entirely.
- **The differentiator is slice 6, and slice 6 is most of the cost.** Anything short of
  the comparison grid is a nicer skill-plan template, not a reason to pick us.
- Honest sequencing note: this is later than the teardown implies only in that
  `DataTable` must exist first. It does not depend on item 06 (export/import can ship
  standalone), and it does **not** depend on new multi-character _infrastructure_ —
  that mechanism already works today.

## Depends on

- **Slice 0 (sync all logged-in characters)** — self-owned, but coordinate: this is a
  shared change to `src/app/App.tsx` that items 02/07/09 also want.
- **`DataTable` + `CharacterAvatar` primitives** (DESIGN §4 ○) — hard blocker for slice
  6 only. Assign an owner; do not build private versions.
- **`SkillBar` promotion** to `src/components/ui` — soft blocker for slice 4.
- **Items 02/07/09 multi-character work** — soft dependency: the _mechanism_ exists
  today, so slice 6 could build `loadCharacterSheets` itself if that work slips. State
  the interface (above) and let whoever gets there first own the file.
- **Item 06 (.emp/XML importer)** — no dependency, but slice 7 should share its
  paste/drop/preview shell rather than duplicate it. Sequence 06 first if both are
  scheduled.

## Risks / open questions — for the orchestrator to decide

1. **Doctrine ownership on character sale.** `handleOwnerHashChange` wipes by
   character (`planSync.ts:253-263`). If the author character is sold, its doctrines
   are deleted even though the user's other characters still use them. Options: accept
   (recommended for v1, with an export nudge) vs. re-home to another logged-in
   character. Needs a decision before slice 1 ships.
2. **Comparison grid layout at scale.** A capital doctrine can hit 40+ requirements; a
   user can have 10+ characters. Characters-as-columns × requirements-as-rows is the
   EveLens layout and scrolls horizontally past ~8 characters. Recommend
   characters-as-rows with summary columns (met / missing SP / time) that expand to
   per-requirement detail, plus "show only missing" as a _column_ filter. Needs a design
   call — this is the single biggest UI risk.
3. **Is "assigned characters" a persisted concept?** v1 assumption: comparison is over
   _all_ logged-in characters, no per-doctrine roster. If a roster must persist, it is
   another synced field (`assignedCharacterIds?: number[]`) with the same
   cross-character ownership problem as the doctrine itself. Recommend deferring.
4. **Prereq-inclusion in "missing SP".** Recommended: include (see Tests). If the
   product wants the EveLens number to match exactly, verify what EveLens reports before
   locking the assertion — the badge is the headline number and must not be quietly
   different from a competitor's.
5. **Multi-hull doctrines.** A "Muninn fleet" doctrine realistically covers hull + logi
   - boosters. v1: merge all pastes into one requirement set (max wins). If per-role
     sub-sets are wanted, `DoctrineRecord` gains a `roles: { name, requirements }[]`
     nesting — decide before slice 1, since it changes the synced shape.
6. **Alpha/Omega clone state.** `trainingRate` (`sp.ts:39`) assumes Omega and there is
   no alpha handling anywhere in the engine. A doctrine comparison across an alt roster
   will overstate alpha characters. Pre-existing gap, but the comparison grid is where
   it first becomes visible and embarrassing. Flag as a separate item.
7. **Doctrine naming collisions on import.** Two corp-mates importing the same payload
   get different `id`s (fresh `crypto.randomUUID`), so re-importing an updated payload
   creates a duplicate rather than updating. Decide: stable id embedded in the payload
   (enables update-in-place, risks cross-user id collisions in one user's own store) vs.
   fresh id + name-match prompt. Recommend fresh id + "a doctrine named X exists —
   replace or keep both?".
8. **`ImportClipboardDialog` reuse.** It takes `trainedSkills` to dim already-trained
   rows (`ImportClipboardDialog.tsx:14-15`). Doctrine authoring has no character
   context. Make the prop optional rather than forking the component — but that edit
   touches a file the Skill Plans work is also editing (ARCHITECTURE §2 flags
   `planner/` as concurrently edited). Coordinate.
