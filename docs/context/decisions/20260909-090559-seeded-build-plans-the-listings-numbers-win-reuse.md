# Scope decisions — Seeded Build Plans: the listing's numbers win, reuse matches on value (issue #637)

_Recorded 2026-09-09 · issue #637._

- **This supersedes #636's "the plan is not seeded with the contracted copy's
  ME/TE/runs" bullet.** That decision deferred seeding as its own piece of work
  precisely because it needed new URL params and a change to Industry's
  `createPlan`; this is that work. The bullet in
  `20260908-222216-right-click-an-item-name-to-start-a.md` is now history, not
  current behaviour.

- **One precedence order for research, everywhere: explicit seed > owned copy >
  assumed preference.** `newBuildPlan` resolves
  `overrides.me ?? owned?.material_efficiency ?? assumedMe` and
  `overrides.te ?? owned?.time_efficiency ?? 0`. A pilot shopping a 10/20
  five-run copy is evaluating a copy they might buy, not the one in the hangar,
  so an owned copy must not overwrite the listing. `??` and never `||`: an
  unresearched BPC is ME 0 / TE 0, a real answer about a real copy, and
  truthiness would silently fall through to the owned copy for exactly those
  listings. #634 (assumed-TE _preference_) had not landed when this did; when it
  does it slots in as the last fallback on the `te` line, matching `assumedMe`
  on the line above.

- **A seed is all-or-nothing, and parsed strictly rather than clamped.** All
  three of `me`/`te`/`runs` must be present, integral, and inside the game's own
  ranges (ME 0-10, TE 0-20, runs >= 1); anything else is no seed at all and the
  `?product=` path behaves exactly as before. A listing always carries all
  three, so a partial query is a truncated or hand-edited URL, not a
  half-seeded intent. Clamping is ruled out for a sharper reason than taste:
  Industry's create-if-missing effect stops re-firing only once the plan it
  wrote matches the seed it was given, so a value silently adjusted on the way
  in would leave the two permanently disagreeing and write a plan to Dexie on
  every render. `newBuildPlan.test.ts` pins that invariant directly.

- **Reuse matches on the three values, not on a marker stored on the plan.**
  Browsing back to the same listing re-opens the plan the first click created;
  a plan for the same blueprint at _different_ research is left untouched and
  the seeded plan is created beside it. Rules out a `seededFrom` field on
  `BuildPlanRecord` (a second source of truth for something the plan's own
  ME/TE/runs already say). Accepted cost, taken knowingly: edit a seeded plan's
  ME and the next click on that listing creates a fresh plan — correct, since
  the edited plan no longer describes that copy.

- **A seeded plan is told apart by its name — "Rifter 10/20 x5" — composed at
  the UI layer.** The reuse rule lets a pilot hold a plain plan and several
  seeded plans for one blueprint, and rows all reading "Rifter" would be
  unusable. The string is an i18next key (`industry.seededPlanName`) read in
  `Industry.tsx`, passed to `newBuildPlan` as `overrides.name`, so the plan
  factory stays free of i18n. Rules out a badge or icon in `BuildPlanList`: the
  name is what the list, the compare checkboxes and the group headers all
  render, and it survives the inline rename as an ordinary starting name.

- **One action, one label: the seed is an optional prop on the existing menu
  item, not a second entry.** `BuildPlanContextMenu` takes `seed?`, and a
  seeded row and a plain row read identically — the "Build Plan" /
  "Build Plan (checking…)" / "No blueprint options" vocabulary #636 unified
  is not allowed to fork into "Build Plan" and "Build Plan from this copy".

- **Only the BPC Sourcing search table seeds.** `BpcContractModal`'s contents
  list and the character `ContractDetailModal`'s tables keep the plain menu:
  they render raw ESI contract items, which the shape those views fetch does
  not carry ME/TE/runs on. Extending the seed there is a separate piece of
  work, the same way this one was separate from #636.

- **The seed is cleared with the `?product=` param it rode in on.** `?material=`
  preserves whatever it does not delete, so a leftover `me`/`te`/`runs` would
  ride along onto an unrelated navigation.
