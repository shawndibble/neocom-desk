# Scope decisions — Moon Mining: rename route path and lead nav with Progression (issue #523)

_Recorded 2026-09-05 · issue #523._

- **The route path itself is now `/moon-mining`, reversing this feature's
  prior decision doc** (`20260905-212452-...`), which deliberately left
  `/moon-mining-tax` alone as "a large, purely-cosmetic refactor across ~20
  files for no functional change." Direct user feedback asked for the path
  rename specifically, so the earlier call no longer holds for this one
  route — `App.tsx`'s route map, `routeScopes.ts`'s `ROUTE_REQUIREMENTS` key,
  and every `Layout.tsx`/test reference to the old path all moved together.
  The module/type/file names underneath (`features/miningTax`,
  `engine/miningTax`, `MiningTaxAssignmentRecord`, the `miningTax` i18n
  namespace) are still deliberately untouched — nothing in this request
  named those, and renaming them remains the same large, no-functional-value
  refactor the prior doc declined.
- **Moon Mining moved out of the desktop rail's Economy group and into
  Progression, directly after Industry** (`Layout.tsx`): direct user
  feedback ("let's move moon mining right after industry"). The mobile
  "More" sheet's own order is unchanged — Industry isn't a sheet item (it's
  a primary bottom tab), so there's no equivalent anchor to move Moon Mining
  relative to there, and the sheet remains the only mobile entry point to
  this route.
