# Scope decisions — Deleting a Build Group now deletes its member plans (issue #626)

_Recorded 2026-09-23 · issue #626._

- **Deleting a Build Group now cascades: every member plan is deleted with
  it, not merely orphaned.** Reverses the "orphan, never cascade" call
  recorded in `20260908-211916-build-groups-membership-on-the-plan-names-in.md`.
  That decision reasoned a Build Plan is worth more than its membership; the
  product call now is that a group the pilot chose to delete, plans included,
  should not leave a pile of ungrouped plans behind for them to clean up by
  hand. Direct pilot instruction, not a bug fix.

- **The write order is unchanged: members go first, the group's own record
  last.** `deleteBuildGroup` (`buildGroupActions.ts`) still deletes the
  members before removing the group from `sync.industryBuildGroups`, so a
  torn write still leaves the group outliving what pointed at it — now
  showing as an empty group rather than a group with orphaned members.

- **Member deletion goes through a new bulk tombstone path,
  `markBuildPlansDeleted`, not a loop of the existing single-plan
  `markBuildPlanDeleted`.** The single-plan version does its own
  read-modify-write of the shared per-Character tombstone-list setting;
  calling it once per member in parallel (`Promise.all`) races on that same
  setting and silently drops all but the last write's tombstones. The repo
  already has this exact bulk pattern for `markProductionRunDeleted`'s sale
  links and order watches — `markBuildPlansDeleted` follows it: one
  `bulkDelete` plus one tombstone read/write for the whole batch.

- **Not touched: a Build Plan's own Production Runs.** `markBuildPlanDeleted`
  (called per-plan, or now via the bulk path) still deliberately does not
  cascade to a deleted plan's logged Production Runs — that reversal already
  happened once (see its doc comment) and stands on its own reasoning: a
  logged run is a locked financial snapshot, unrelated to whether its plan or
  that plan's group still exists.
