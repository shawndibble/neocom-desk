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

- **Severity is one shared ladder, not a copy per board.**
  `severityForRemaining` (24h critical, 3d warning, 7d watch, else clear) moved
  out of `engine/corp/board.ts` into `engine/severity.ts`, and both boards
  import it. Duplicating the thresholds was the first plan — cheaper on paper,
  since the corp type had five import sites — but the function itself turned out
  to have no importer outside `engine/corp/`, so the extraction cost one moved
  file and `CorpBoardSeverity` survives as an alias. It is also what the corp
  board's own decision already required: "one `severityForRemaining` ladder,
  called by every source". Two private copies would have satisfied the letter
  of that and none of its point.

- **The board has no forward horizon.** A 30-day window was drafted to keep the
  rail short and removed before it shipped: paging the Calendar Map past the cap
  showed empty cells that were empty _because of the cap_, which is precisely
  the failure this page was rebuilt to fix, reproduced in the other direction.
  Every source is naturally bounded — ESI returns at most 50 calendar events and
  50 queue entries — and the rail's day grouping is what makes a long list
  readable.

- **Hatching a past day means "nothing new can land here", not "nothing is
  here".** The `/calendar` feed cannot put an event in the past, but the five
  other clocks can be overdue, and an industry job sitting `ready` since Tuesday
  belongs on Tuesday. Past cells therefore still draw their count and dots, and
  the caption says the narrower thing that is actually true.
