# Scope decisions — Calendar colour names the kind of clock, not how soon it is

_Recorded 2026-09-07._

- **The Calendar page stops painting severity and paints the kind instead.**
  The rail is ordered by deadline and every row carries a countdown, so a
  severity tone was the third telling of "this is soon" and the first telling
  of nothing — while _what_ is ending, the one thing a merged six-source board
  makes genuinely hard to see, had no colour at all. The hue now answers that
  question, and the countdown keeps the colour because the countdown is where
  the eye already lands. Rules out keeping both: two colour scales on one
  surface is how neither gets read.
  - This **reverses the "Severity is one shared ladder" bullet** of
    `20260907-123312-calendar-becomes-the-characters-coming-up-surface.md` as
    far as the _character_ board is concerned. `engine/severity.ts` stays and
    the corp ops board still ranks and paints by it — the extraction was still
    worth doing, it just has one caller again. `CharacterBoardItem.severity`
    is gone rather than left unread.
  - Urgency loses no information: the order, the countdown on every row, and
    the overdue wording all survive untouched.

- **This adds the app's first nominal palette, and it is meant to be its
  only one.** `20260907-125125-mail-rows-go-two-line-colour-marks-state.md`
  refused per-folder hues on three grounds, and this decision has to answer
  them rather than ignore them:
  - _"Every colour scale in this app is ordinal or semantic."_ True, and this
    one is not — that is the change. Six clocks are a nominal set, and the
    page's whole premise is that they are merged, so telling them apart is the
    page's central problem in a way that four mail folders were not.
  - _"Four new hues would read as status."_ Answered by measurement rather
    than by taste: every one of the six sits **≥ 20 ΔE from `accent`,
    `success`, `warning` and `danger`**, so none of them is close enough to a
    status tone to borrow its meaning. The constraint is recorded in
    DESIGN.md §1 so the next hue has to clear it too.
  - _"The next categorical set would either reuse it wrongly or fork it."_
    This is the argument that decided **where** the palette lives: app-level
    tokens (`--color-kind-*`) read through `components/ui/kindTone.ts`, beside
    `severityTone.ts` rather than under `features/character/`. A calendar-local
    set of six class names would have guaranteed the fork it warned about.

- **Colour reinforces, and is never the signal.** Six hues cannot be made
  mutually distinct under dichromacy inside this palette's lightness band —
  measured, the worst pair falls to ΔE 12 under deuteranopia (DESIGN.md §7).
  That is acceptable only because every hue appears beside something that says
  the same thing in a second channel: the rail's rows keep `KIND_ICON` and the
  kind's written name, the filter menu carries a swatch _beside_ each label,
  and the map and ticker name their kinds in the cell's `aria-label`. Rules out
  stretching the palette to neon for colour-blind separation it does not need
  to carry alone, and rules out any future surface that paints these hues bare.
  - The row's `sr-only` severity word goes with it. It existed because colour
    carried severity invisibly; kind is already written on the row's third
    line, so repeating it would be the only thing on the row said twice.

- **The Calendar Map draws one dot per kind, not one per item.** The dots were
  one per clock in the day's worst severity, which meant four dots restated the
  count sitting two inches away — and needed a `+N` overflow to do it. The
  count now carries how much and the dots carry what of. Because there are only
  six kinds, no cell can overflow: `MAX_DOTS` and the `+N` are deleted, not
  reconfigured. `DayLoad` changes from `{count, severity}` to `{count, kinds}`,
  deduplicated and held in `CHARACTER_BOARD_ITEM_KINDS` order so two days
  holding the same kinds draw the same dots in the same places.
  - The Day Ticker's bar becomes segmented from the same `kinds` array, so the
    phone and the grid cannot disagree about a day — the rule that file already
    followed for its counts.
