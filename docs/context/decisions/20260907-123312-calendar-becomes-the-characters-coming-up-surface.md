# Scope decisions — Calendar becomes the character's coming-up surface

_Recorded 2026-09-07._

- **The Month / Week / Agenda tabs are removed; one surface replaces all
  three.** `GET /characters/{id}/calendar` returns up to 50 events _from now
  only_, and `esiCache.put` replaces the row wholesale rather than merging —
  so no past event is ever in the list, on any device, at any time. A month
  grid therefore spent most of its cells on days that structurally cannot
  hold anything, and paging backwards always rendered "No events this month"
  no matter how busy that month had actually been. The grid stays, demoted to
  a **Calendar Map**; the list stays, promoted to the **Coming Up Rail**; they
  sit side by side instead of behind a switch. Rules out re-adding a view
  switcher: the two views were never alternatives, they were two halves of one
  question.

- **Week stops being a view and becomes a density.** With the grid demoted to
  a map, "seven days at a time" is a zoom level on the same surface, not a
  different surface. The Month / Fortnight toggle replaces it.

- **Past days are drawn and captioned, not hidden.** Hatching them and saying
  why in one line under the grid is cheaper than an empty state the user has
  to trigger before they learn the rule. Rules out silently clamping
  navigation to today — the user asked a reasonable question and deserves the
  answer rather than a dead control.

- **The Calendar page merges every clock the Character can read, not just
  calendar events.** Skill-queue completions, industry job deliveries, PI
  extractor program ends, contract expiries and market-order expiries all
  answer "what is coming up", and they were previously readable only by
  visiting five separate routes. This is the character-side counterpart of the
  corp ops board (`engine/corp/board.ts`), and it is deliberately the same
  idea: heterogeneous clocks in, one deadline-ordered list out. Overview keeps
  its per-source tiles — those answer "what is the state of X", which is a
  different question from "what happens next".

- **A source the Character cannot read contributes nothing and says so; a
  source that reads fine and has nothing due shows a zero.** Copied verbatim
  from the Kind Cards rule (issue #566): collapsing the two would put
  "no industry jobs" in front of someone who was never allowed to ask. This is
  also why the page no longer gates wholesale on the calendar scope — a
  revoked calendar scope must not blank five other working clocks.

- **The kind filter is multi-select, lives behind an icon at every width, and
  persists device-local.** Behind an icon because the page's two panes already
  spend the width; multi-select because the useful question is "show me
  industry and planets" rather than "show me one kind"; device-local
  (`createLocalSetting`, no `sync.` prefix) because which clocks you care about
  follows the screen you are at, not the character — the same reasoning that
  keeps **Data Owner** device-local. Rules out a synced setting and rules out a
  single-select segmented control.

- **Severity is the corp board's rule, not a second opinion.**
  `severityForRemaining` in `engine/corp/board.ts` (24h critical, 3d warning,
  7d watch, else clear) is what colours the map's dots, the ticker's bars and
  the rail's countdowns. The character engine carries its own copy of the
  thresholds rather than importing across the corp/character seam, and a test
  pins them — so the two can only drift with a test going red, never silently.
