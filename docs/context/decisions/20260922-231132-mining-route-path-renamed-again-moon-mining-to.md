# Scope decisions — Mining route path renamed again: /moon-mining to /mining (issue #1304)

_Recorded 2026-09-22 · issue #1304._

- **The route path is now `/mining`, superseding the path call in
  `20260905-215631`** (issue #523's earlier path rename, itself already a
  reversal of `20260905-212452-...`'s "leave the path alone"). That doc kept
  `/moon-mining` while renaming the _label_ to "Mining" for #671; #1304 asked
  for the path itself to match the label as part of the wider "every tab is a
  path segment" navigation work (#1299). The module/file/type names underneath
  (`MoonMiningTax`, `features/miningTax`, `engine/miningTax`,
  `MiningTaxAssignmentRecord`, the `miningTax` i18n namespace) stay exactly as
  `20260905-215631` left them — nothing in #1304 named those, and renaming
  them is the same large, no-functional-value refactor that doc and its
  predecessor both declined.
- **Mining's two tabs (`tax`, `overview`) and Planetary Industry's three
  (`colonies`, `plan`, `advisor`) became path segments**
  (`/mining/tax`, `/planetary-industry/plan`, …) rather than the `?tab=`
  query param each used before, per #1299's shared "tab = path segment"
  pattern. PI's `type` (Plan) and `system` (Advisor) params stay scoped query
  params on top of the tab path, since they are not which-tab state — a
  planned commodity or an Advisor system is a value _within_ a tab, not the
  tab itself.
- **A stored mobile-tab-bar choice of `/moon-mining` migrates to `/mining` at
  read time** (`src/lib/mobileTabs.ts`'s `parseMobileTabs`), not via a Dexie
  schema bump — matching this codebase's established pattern for renaming a
  persisted settings value (see `useSyncedSetting.ts`'s `legacyKey`
  adoption). A schema migration would need every device to run the upgrade
  before reading the value; a read-time remap works immediately and needs no
  Dexie version bump.
