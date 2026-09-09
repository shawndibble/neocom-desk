# Scope decisions — Build Groups: membership on the plan, names in a synced setting, no new table (issue #626)

_Recorded 2026-09-08 · issue #626._

- **Membership is `buildGroupId?: string` on `BuildPlanRecord`, and lives
  nowhere else.** One writer per fact, so no merge can produce a plan in two
  groups or a group claiming a plan that moved. A `memberIds[]` on the group
  would be a second source of truth for one fact and would turn every
  concurrent move across devices into an LWW conflict. Additive and unindexed,
  so no Dexie version bump — the same treatment `buildHere`,
  `materialSourcing` and `ownedStockScope` already get. Named `buildGroupId`
  rather than `groupId` because `groupId` already means something else on
  `MiningTaxAssignmentRecord` in the same module.

- **Group names, order and the existence of an empty group live in one
  allow-listed synced setting, `sync.industryBuildGroups`, not a
  `buildGroups` table.** Rules out: a Dexie v11 `stores()` line that would have
  to restate all fifteen existing tables verbatim (Dexie drops any table a new
  version omits); a sync `CollectionSpec` and tombstone path; entries in
  `characterPurge.REMOTE_COLLECTIONS`, `clearCharacterSyncBookkeeping` and
  `handleOwnerHashChange`'s two hand-maintained lists; a `firestore.indexes.json`
  entry; and user-facing FAQ privacy copy.

  The decisive one is `firestore.rules`, which ends in `// Everything else:
implicit deny.` A new subcollection is denied until a human runs `firebase
deploy --only firestore`, and CI deploys nothing and tests that file with
  nothing. `permission-denied` is not `failed-precondition`, so
  `pullOwnedDocs`' degradation catch re-throws, and `syncCharacter` awaits ten
  collections **sequentially with no per-collection try/catch**. One denied
  collection therefore takes down the whole sync pass — Skill Plans included —
  for every Character, on every pass, until someone remembers the deploy. The
  feature is not worth a failure mode that large.

  The precedent is the repo's own: `MiningTaxAssignmentRecord.groupId` is a
  real, CONTEXT.md-named grouping implemented as a bare shared id with no group
  table, and `MiningTaxPaymentInfo.paymentId`'s docstring says a per-Payee
  history is "a group-by away **without a separate synced table**".

- **Accepted cost: `mergeSettings` is whole-value LWW per key, so two devices
  creating different groups concurrently lose one creation.** Taken knowingly.
  Membership is not in the blob, so what can be lost is a name and an ordinal
  — never which plans are in which group. A lost name is recoverable in
  seconds; a plan silently landing in the wrong group is not. Deleting a group
  is removing an entry from a blob rather than a document delete, which also
  keeps the whole 30-day tombstone-expiry path — and its resurrection edge —
  out of this feature entirely.

- **Deleting a Build Group orphans its members; it never cascades.** Members
  get `buildGroupId` cleared and reappear in the ungrouped list. The repo made
  this exact call once before and _reversed_ a cascade to reach it:
  `markBuildPlanDeleted` deliberately does not cascade to a Build Plan's own
  Production Runs. A Build Plan is worth more than its membership.

- **Deleting the last member leaves the group empty and visible**, and a
  dangling `buildGroupId` renders as an ordinary ungrouped plan — the rule
  reused verbatim from `MiningTaxAssignmentRecord.groupId` rather than phrased
  a second way. Auto-deleting an emptied group would destroy the one capability
  the synced setting exists to provide.

- **The Group Rollup sums owned-stock remainders and flags over-claim; it never
  re-nets.** `remainingQuantity` nets against each plan's _stored_
  `materialSourcing`, not against live detection, and detection only ever
  suggests a value to store. So two Build Plans already double-claim the same
  hangar today — the group makes a pre-existing defect systematic rather than
  creating it. Re-netting would make the group total contradict the member
  views open beside it, and there is no single pool to net against anyway,
  since `ownedStockScope` is per-plan and two members may legitimately scope to
  disjoint locations. The rollup instead reports typeIDs the members
  collectively over-claim, named, and never silently reconciles them.

- **A group carries no `hubId`.** Mixed hubs are reported, never overridden:
  one hub offers the multibuy paste, more than one disables it with a reason
  naming them, following `shoppingList.ts`'s existing "plainly unavailable
  beats silently empty" rule. A hub on the group would be a second writer for a
  fact the plan owns — the same rule that puts membership on the plan.

- **`parseEftFit` keeps its line cardinality; Fit Import aggregates in one pass
  of its own**, keyed by `blueprintTypeID ?? name.toLowerCase()`. Not for the reason
  first assumed — `fitToSkills` destructures `{ name }` and never reads
  `quantity` at all — but because `clipboardImport.ts` derives its
  user-visible `Unknown item: {name} ×{count}` warning from per-_line_
  cardinality, so aggregating in the parser would silently drop the `×N`. The
  parser's own docstring also scopes it to "pure text-structure parse only",
  and aggregation is semantics over that structure. Keying by resolved type
  subsumes name-keying, so a separate name-keyed pre-pass is ruled out as a
  second place for one merge rule to be wrong.

- **Charges are excluded from Fit Import by default.** EFT gives a loaded
  charge its _module line's_ quantity, so eight launchers reads as eight
  missiles — not a production quantity under any reading. Inventing a plausible
  batch size is worse than declining; the pilot knows their ammo stockpile and
  the app does not. A checkbox includes them at `runs: 1`.

- **Fit Import seeds each created plan's ME from `sync.industryAssumedMe`
  rather than defaulting to 0.** Ten of the thirteen rows in the canonical
  Buzzard fixture are T2 and need an invented BPC, which is out of scope for
  Build Plans — so a hard 0 would quote ~77% of a typical imported group as
  unresearched and overstate its material cost on the feature's own headline
  number. An owned BPC still wins, the same precedence `materialEfficiencyFor`
  already applies to sub-jobs. (This bullet originally read "ME/TE"; only the
  ME half shipped with #626 — there was no TE preference to seed from. Issue
  #634 added `sync.industryAssumedTe` beside it, and TE now comes from that
  key, not this one.)

- **The hull is an ordinary member plan, written with the highest `updatedAt`
  in the batch.** `mostRecentlyUpdatedPlan` uses a strict `>`, so plans sharing
  one `Date.now()` tie and array order decides; without this the settings the
  pilot's next hand-made plan inherits (issue #456) would come from a random
  member of the fit. Giving the tie a principled winner also keeps the hull out
  of special-casing in the rollup and the list.

- **Group collapse state is device-local and stores _expanded_ ids, not
  collapsed ones.** A viewing preference, never synced. Storing collapsed ids
  would make a group newly synced from another device arrive expanded, and
  would leave stale ids pinning deleted groups forever; storing expanded ids
  makes "collapsed by default" fall out of the empty default. The expansion Fit
  Import performs is persistent, because a session-only exception would need a
  second source of truth for one boolean.

- **Drag-and-drop is deferred to #627, not dropped.** Dragging into a container
  is the repo's first multi-container dnd — droppable headers, a hand-composed
  collision strategy, `DragOverlay`, `MeasuringStrategy.Always` and
  `onDragOver`, none of which exist here — and a collapsed group has zero child
  sortables, making its header the only target and the hardest case rather than
  the easiest. A "Move to group…" row action ships instead and makes groups
  fully usable without dragging.
