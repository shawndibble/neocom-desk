# Scope decisions — Craft Sweep: bulk build-depth/strategy control for Build Group and Build Plan

_Recorded 2026-09-09, from a grilling session ahead of ticket-writing. No code
exists yet — this records what was decided, for whichever ticket(s) implement
it._

- **A Craft Sweep is a one-shot bulk write, not a persistent policy.**
  Running it patches `buildHere` into every affected plan immediately;
  re-running it (a different depth, a different Sweep Strategy, or just
  pressing it again) recomputes from scratch and overwrites whatever
  craft/buy choices — including hand-picked ones — were there before. There
  is no override-tracking: nothing remembers that a specific material was
  manually flipped back to buy so a later sweep could spare it. The only
  guard is a generic confirmation ("this will overwrite manufacturing choices
  on N plan(s)") — never a computed preview/diff of what would change, since
  that would require running the walk twice per press purely for the dialog.
  Chosen explicitly over a remembered-override model: "I don't care if we
  lose information... as long as the user knows changes will impact all
  individual items." Matches the only existing precedent for a group writing
  into its members (Retarget, `buildGroups.ts`'s "not a second writer" —
  except a Craft Sweep to a group with a saved snapshot on it is a repeatable
  action a user is expected to press again, not a one-time fact bootstrap).

- **A Craft Sweep runs on a Build Group (every member) or a single Build
  Plan** (grouped or not) through the same call — a solo plan is simply
  `members = [thisPlan]`. There is no reason to gate this to grouped plans
  only; that would be an arbitrary gap for a Character running one big plan
  outside any group.

- **Three Sweep Strategies decide build-or-buy for every material a sweep
  reaches:** `buy` (force every eligible material to buy), `build` (force
  every eligible material to craft), and `cost-effective` (build only where
  cheaper — reuses/generalizes `autoMakeOrBuy.ts`'s existing `autoBuildHere`
  heuristic and its underlying `makeOrBuy` single-level cost compare, per the
  existing "auto pass is a decision function, not a second recursive cost
  engine" principle
  (`20260909-153528-auto-make-or-buy-depth-reuses-buildhere-decided.md`)).
  `cost-effective` is the default a Craft Sweep control opens on.

- **A Sweep Depth of 1..N, or "All", bounds how far the sweep walks** — the
  product's own materials sit at depth 0 (unchanged counting convention from
  `autoBuildHere`/`materialResolution.ts`), so depth 1 evaluates only those,
  depth 2 also evaluates the materials of whichever of those the strategy
  picked, and so on. "All" means "however deep this tree actually goes,"
  bounded only by the recursive engine's own `MAX_SUB_BUILD_DEPTH` (10)
  safety valve — **not** by `autoMakeOrBuy.ts`'s existing `MAX_AUTO_BUILD_DEPTH`
  (3), which was sized for Build Opportunities' own UI, not as a ceiling on
  this feature. The walk function's depth bound becomes a parameter rather
  than the current hardcoded `Math.min(MAX_AUTO_BUILD_DEPTH, ...)` clamp.

- **A Craft Scope — which Activity Types a sweep is allowed to mark
  buildable — is a multi-select, not a hardcoded manufacturing-only filter.**
  Only **Manufacturing** is functional in this round of tickets. Reactions
  and Planetary (PI) are reserved slots in the same control, each lit up by
  its own later ticket rather than a redesign of this one — Reactions
  because recursive reaction crafting inside a build tree is out of scope
  here (a follow-up ticket is filed alongside this work to cover it), PI
  more tentatively ("we may also allow crafting to include PI"). Until those
  land, the control only offers Manufacturing — exposing a toggle that
  silently does nothing would be worse than not showing it.

- **A material outside the Craft Scope is left as buy, but the walk does not
  dead-end there — it keeps walking into that material's own inputs,**
  looking for further in-scope (manufacturing) materials underneath, and
  still counts those against the same Sweep Depth. This is a real behavior
  change from `autoMakeOrBuy.ts`'s current `visit()`, which today `continue`s
  past a reaction or planetary material without ever looking at what is
  beneath it — the walk dead-ends there. The two "not eligible to build in
  this round" methods (reaction, planetary) are treated identically: neither
  gets special-cased over the other.

- **This is one shared walk, not a second one forked off for group/plan
  use.** Build Opportunities' existing Auto Build Depth control (0–3,
  cost-effective only) is the same underlying function, generalized — its
  own UI keeps offering its own bounded range, but the skip-and-continue
  fix and the depth-as-parameter change apply there too, since maintaining
  two tree-walkers that could quietly drift apart is exactly what the
  original Auto Build Depth decision ruled out ("not a second recursive cost
  engine"). Build Opportunities' own scope stays cost-effective/manufacturing
  only for now; Craft Scope and Sweep Strategy as user-facing controls are
  new to the Build Group / Build Plan surfaces, not backported to
  Opportunities' UI in this round.

- **A Build Group persists its last-used Sweep Strategy and Sweep Depth**
  (not a live-enforced policy — see the one-shot decision above) purely so
  reopening the group pre-fills the control with what was last run, instead
  of resetting to the default every time.

- **Plan → Group visibility needed no new engine work.** `groupRollup.ts`
  already recomputes live from each member's current state on every open, so
  editing an individual plan's craft/buy choices already shows up in the
  group total today. The only new UI is a tooltip on the individual plan
  telling the pilot that their edit is reflected in the group — closing a
  perception gap, not a real one.
