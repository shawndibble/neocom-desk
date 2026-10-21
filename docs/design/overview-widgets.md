# Overview widget grid — design record

Approved by Shawn after a mockup review (four rounds, a hostile first-time-user
review, Mobbin research). The interactive mockup was
`docs/design/mockups/overview-widgets.html`; deleted when its tickets closed
(in git history). This file is the source of truth, and the
checklist in §9 is what the implementation is verified against.

## 1. Intent

The Overview is the pilot's own summary of what matters to them. It stops being
a fixed board of 13 domain cards plus an Alerts column and becomes a **grid of
Widgets the pilot chooses, sizes, orders, renames and removes**. Each Widget can
be drawn as a **Number**, a **Chart** or a **Table** (where it has them), and each
kind opens in the view that answers its question best (appendix A). The
alerts feature moves out of the page into a **bell in every page header** and a
**danger banner** on the Overview.

Everything on the page is the pilot's choice. The default is only a starting
point.

## 2. Vocabulary (add to GLOSSARY.md)

- **Widget** — one tile on the Overview, an instance of a **Widget Kind** with
  its own size, view, optional rename, character scope and range. The same kind
  may appear more than once.
- **Widget Kind** — an entry in the catalogue (Wallet, Orders, Planetary…).
  Declares its title, category, which views it has, its default size, which
  settings apply (range), its ESI permission, its empty message.
- **View** — Number / Chart / Table. A Widget shows one. Number is a figure and
  at most one secondary line, never a chart. Table is also the text equivalent
  of a Chart, and at Large and Full the Chart view shows it beside the chart.
  Each kind has a default view (appendix A); a stored layout keeps its own.
- **Size** — S / M / L / Full: a share of one row's width (¼, ⅓, ½, whole), not
  a height. Content sets height.
- **Overview Layout** — the ordered list of Widgets and their settings. One per
  pilot (not per Character), synced like the hidden-card setting.
- **Role** — a first-run answer (Trader, Industrialist, Planetary industry,
  Miner, Fighter, Explorer and hauler) that maps to a set of Widget Kinds.
- **Gallery** — the Add a widget drawer/sheet.
- **Widget State** — ok / loading / needs permission / failed / empty.
- **Danger banner** — the strip under the page header naming an unacknowledged
  danger Alert.

## 3. Page structure

1. Page header (existing `CharacterHeader`, with the Overview's `overview`
   layout): the Character's name with a read-only "Updated N ago" beside it
   (there is no header Refresh; a failed widget's Retry reloads) over the
   corporation line, on the left; on the right one row of the **Next
   deadline** button (a link to the page that owns the clock), **Customize**
   and the **bell**, last at the top right. On a phone Customize (icon only)
   and the bell sit at the right end of the identity row and the Next button
   is its own full-width line under them. There is no Character switcher (the
   rail footer and the command palette switch the active Character; a
   widget's own menu chooses Header character or All characters) and no SP
   chips: the Skill points widget carries Total, Unallocated and spare SP.
   Every control in a row is one `md` control height (44px on a phone, 36px
   on a pointer).
2. Sub-nav: Overview / Clones / Employment history. **Unchanged — those pages
   stay.** Only the Overview tab's content changes.
3. **Danger banner** (when an unacknowledged danger Alert exists).
4. **Edit bar** (while customizing).
5. **The grid.**

The old summary strip (Next deadline / Training / Wallet cells) is gone: Training
and Wallet are Widgets; Next deadline is only the header button. The old Alerts
column and the "Everything else" phone fold are gone.

## 4. The grid

- Flex-wrap rows, **no gap-filling**: reading order = screen order = ↑/↓ order.
  A row's leftover width is shared (flex-grow), so no holes.
- Size → flex-basis: S ¼ (min 220px), M ⅓ (min 300px), L ½ (min 440px), Full 100%.
  On the 1152px content column of a 1440px desktop that is **four S, three M,
  two L or one Full per row**; a narrower window wraps to fewer across at each
  size's minimum width, and rows share their leftover equally.
- Size also sets how much a view shows: table rows S4 / M5 / L8 / Full12; chart
  height 44 / 70 / 100px. The **Number view is only a number**: the headline plus
  at most one `secondary` line (a direction glyph, then text, coloured by good or
  bad for the pilot, one line at every size, never restating the headline). A
  zero count never carries a warning.
- **Table columns by size.** A kind declares ordered columns with a `priority`
  (name first, then the key value). S shows the name and the best-priority
  column, M up to four by priority, L and Full all. Beside a chart at L and Full
  the table gets the narrow budget (two columns at L, four at Full). A table with
  no header labels draws no header row; a row with a `to` is a link with a
  trailing caret.
- **Table cell tone and bars (one rule).** A signed change is green above zero
  and red below, with no colour at zero or when unknown, and the sign glyph stays
  in the text (income and spending columns tone by direction; Orders "vs best" is
  red only when a rival beats the order; Price watch "Gap" is green once the
  target is hit and amber within 5% of it; a clone that finishes the queue sooner
  is green). A thin bar appears only for a real 0..1 quantity: job progress, a
  share of a whole (Wallet flow, Net worth, LP, Mining yield), and structure fuel
  against a fixed 30-day horizon (ESI does not give the tank size). A count or a
  bare duration gets none (Planetary "Ends in" has no known cycle, Stock counts
  are not a fraction). The text always states the value, so the colour and bar
  are decoration and the table's text and screen-reader reading are unchanged.
  The helpers are `signedTone`, `signedCell` and `fractionBar` in
  `widgets/data/cellKit.ts`.
- At S the scope chip collapses to an icon with a tooltip, so the title is never
  crushed.
- **Every Widget always shows its headline number** — a Small Chart still shows
  the value above the chart.
- Phone: same list and order; S two across, M/L/Full full width. A Widget can be
  set **Hide on phone**.
- Each Widget header: title (micro), optional **New** tag, optional character
  scope chip ("All characters"; an icon with a tooltip at S), **⋯ menu**. The
  **title is the link** to the kind's page (entity link, trailing chevron, tooltip
  "Opens the X page"); a kind with no page has a plain title. One compact line
  (about 32px on desktop, 44px on a phone for the touch target); no separate
  Open link, and the card itself is not clickable.
- No Widget header carries glyph view-cyclers; view switching lives in ⋯.

### Widget ⋯ menu

View (Number/Chart/Table, only the ones the kind has) · Character (Header / All)
· Range (7d/30d/90d, only for kinds with a range) · Name (rename) · Duplicate ·
Move to top · Move to bottom · Show on phone (On/Off) · Remove from Overview.
Esc / outside click closes.

## 5. Customize

- Entering Customize snapshots the layout. **Done** keeps; **Cancel** restores
  the snapshot.
- Edit bar: "Customizing", "N of 30 widgets", **+ Add widget**, **Start from a
  role**, **Reset** (asks "Reset the layout? Reset / Keep"), Cancel, Done.
- While editing each Widget shows a **drag handle** (desktop), a size
  segmented control (S M L Full), ↑ ↓ and − buttons, and a dashed border.
- **Undo toast** (8 s) after: remove, add, resize, duplicate, reset.
- Soft limit **30** Widgets; Gallery then says "Limit reached".
- Adding scrolls to / flashes (1.6 s outline) the new Widget.
- Phone Customize is a **reorder / remove / add list with 44px targets**; sizes,
  views and ranges are set on larger screens.

## 6. Gallery

Drawer (desktop, right, 460px) / sheet (phone). Search box, category chips
(All, then the categories).
Each item: name, description, an Add / **Add another** button, and
a real Medium-size preview of the widget (desktop only). Categories:
Character · Money and market · Industry and mining · Planets and structures ·
Space and travel · Messages and schedule.

## 7. First run and roles

First visit (no stored Overview Layout): "What do you do in EVE?" — multi-select
Role chips, "Always included: Wallet, Training, Coming up and Mail", **Build my
Overview** and **Just the basics**. The union of the Roles' Widget Kinds plus the
base four becomes the Layout. "Start from a role" in Customize reuses it.
"New" tags are not shown on a first-run Layout.

Role → kinds: Trader: orders, priceWatch, stock, walletFlow, netWorth ·
Industrialist: industry, profit, stock, structures · Planetary industry:
planetary · Miner: miningYield, survey, miningTax, moonChunks · Fighter:
location, kills, jumpTimers, incursions · Explorer and hauler: routeSafety,
hauling, incursions, location.

## 8. Widget states, charts, alerts

### States (every Widget)
- **loading** — skeleton, `aria-busy`.
- **needs permission** — "Needs permission", the ESI permission name, **Grant
  access** (reuses the app's existing Grant note / `beginGrant`).
- **failed** — "Could not load", last good value (dimmed), **Retry**.
- **empty** — the kind's message ("No colonies yet"), **Remove widget**.

### Charts
Honest and accessible: Orders chart is Not-undercut vs Undercut (expiring is a
separate count); Wallet flow is one net bar per day or week (green up for a net
gain, red down for a net loss) with its figure printed beside it, and hovering a
bar reads Income, Spending and Net apart; Profit is drawn the same way; Net worth stack has no
red and a legend in bar order; bars carry a max and a time range; every chart
has a visually hidden text summary and its Table view is the table; colour is
never the only signal. Bar and line charts (wallet, net worth, profit, mining,
kills, route safety) read a point out on hover, or on a tap and drag on touch,
through the shared `ChartHover` bubble (`ChartTip` titles and rows on the model).
The drawing is aria-hidden and takes no focus, so the summary and Table view
stay the keyboard and screen-reader route. Small Net worth is a single stacked bar with its legend, so it has no hover.

### Alerts (global)
- **Bell** in every page header (replaces the Alerts link): badge = unread
  count; badge is **red only when an unacknowledged danger Alert exists**, else
  accent. Dim (not hidden) when zero.
- **Panel**: popover on desktop, full-height sheet on phone. Title with count,
  **Mark all read** (leaves danger alone), Close; type chips (All, Danger,
  Market, Industry, Mail, Structures, Skills) that filter; rows with title,
  detail, age (EVE time on hover), buttons **View**, **Snooze 1h** (where
  snoozable), **Dismiss** — or **Acknowledge** for an unacknowledged danger
  Alert. Empty state "You are all caught up". Footer: Older alerts (N), Notify me
  about…, "Push on this device: On", "Danger alerts also appear as a banner".
  Esc and outside click close.
- **Danger banner**: red-bordered strip, "Danger · title · detail · age", View,
  Acknowledge.
- `/alerts` redirects to `/overview` with the panel open (command palette,
  shortcut, push click and card links keep working).

## 9. Verification checklist (implementation is checked against this)

Grid & widgets
- [ ] E1 Overview renders a Widget grid from a persisted Overview Layout.
- [ ] E2 Sizes S/M/L/Full set row width (4 / 3 / 2 / 1 per row on a 1440px desktop); order = screen order, no holes.
- [ ] E3 Views Number/Chart/Table per kind, each kind opening in its default view; headline number always visible.
- [ ] E4 Widget header: one compact line: title as the page link with a chevron (plain when the kind has no page), scope chip, ⋯.
- [ ] E5 ⋯ menu: view, character, range, rename, duplicate, top, bottom, phone, remove; Esc/outside closes.
- [ ] E6 Same kind addable twice.
- [ ] E7 Widget states: loading, needs permission (Grant access), failed (Retry + last good), empty (Remove).
- [ ] E8 Phone: two-across S, full-width others, Hide on phone honoured.

Customize
- [ ] E9 Customize snapshot; Done keeps, Cancel restores.
- [ ] E10 Edit bar: count of 30, Add widget, Start from a role, Reset (confirm), Cancel, Done.
- [ ] E11 Per-widget size control, ↑ ↓, −, drag handle (desktop).
- [ ] E12 Undo toast for remove/add/resize/duplicate/reset.
- [ ] E13 Soft limit 30.
- [ ] E14 Phone Customize = 44px reorder/remove/add list.

Gallery & first run
- [ ] E15 Gallery: search, category chips, Add / Add another, real previews (desktop), Limit reached.
- [ ] E16 First run Role chooser builds the Layout; Just the basics; reachable later via Start from a role.

Header & alerts
- [ ] E17 No header Character switcher; Updated N ago (read-only, no Refresh button) beside the name; Next deadline button (amber < 3 h, red < 30 min), Customize and the bell in one equal-height row at the top right (phone: Next on its own line under Customize and the bell); no SP chips.
- [ ] E18 Sub-nav unchanged (Overview / Clones / Employment history).
- [ ] E19 Bell in every page header; badge red only for danger; dim, not hidden, on desktop and on the Overview; hidden at zero on phone page headers elsewhere.
- [ ] E20 Alerts panel (desktop popover / phone sheet) with chips, Mark all read (spares danger), View/Snooze/Dismiss/Acknowledge, empty state, footer, Esc/outside close.
- [ ] E21 Danger banner with View + Acknowledge.
- [ ] E22 `/alerts` redirects to Overview with panel open; old Alerts column and "Everything else" fold removed.

Widgets (catalogue)
- [ ] E23 Existing 13 cards exist as Widget Kinds (orders, miningTax, contracts, planetary, industry, comingUp, spExtraction→sp, mail, priceAlerts→priceWatch, incursions, stock, structures, moonChunks) plus training and wallet.
- [ ] E24 New kinds from recent work where the data already exists in the app (netWorth, profit, miningYield, survey, routeSafety, hauling, lp, clones, walletFlow, location, kills, jumpTimers).
- [ ] E25 Honest charts per §8; hidden text summaries.

Persistence
- [ ] E26 Layout persists (Dexie) and syncs per pilot like hidden cards; first run detected by absence.

## 10. Scope of the first implementation

The framework, grid, Customize, Gallery, first run, states, the bell/panel/
banner rework and the 13 existing cards + Training + Wallet as Widget Kinds are
required. New-data Widget Kinds (E24) are included where an existing loader
already returns the data; any whose data does not exist yet ship as Kinds
marked unavailable in the Gallery with a follow-up ticket, and are listed in
the PR. Per-widget character scope ships as a setting; widgets that cannot sum
across Characters fall back to the header Character and say so.

## 11. Open questions (recorded, not blocking)

Layout sync per account vs device (decided: per pilot, synced) · single list vs
separate phone layout (decided: single list + Hide on phone) · which Widgets sum
across Characters · whether other alert types than danger raise the banner.

## 12. Implementation decisions (settled after reading the code)

- **Unavailable in v1** (shown in the Gallery marked "Coming soon", not addable):
  none remain: routeSafety, hauling, jumpTimers and kills shipped in #3578,
  #3579, #3581 and #3580.
  Each needs a follow-up ticket; listed in the PR.
- **Reduced kinds:** `sp` is Number/Table only (no SP history store); `priceWatch`
  is Number/Table only (the poller keeps no price history, so no sparkline);
  `wallet` Chart uses the journal-derived daily balance; `netWorth` has the four
  layers the app records (ISK, assets, escrow, sell orders) — no Contracts layer.
- **Acknowledge = dismiss.** Acknowledging a danger Alert dismisses its feed
  entries (synced `dismissedAt`); Mark all read dismisses every non-danger entry.
  No new synced field.
- **Snooze 1h** is device-local (`createLocalSetting`, group key -> until ms),
  offered only where the type is snoozable (price alerts).
- **Undo toast is persistent** (the existing `Toast` with an `undo` action closes
  on its close button, Esc, the next toast or a route change — WCAG 2.2.1), not 8 s.
- **Old Alerts page features** (per-Character filter, search, muted-type chips)
  move to the panel footer: "Notify me about…" links to Settings >
  Notifications. "Older alerts (N)" is not built: dismissed alerts have no
  history view, so the link would only repeat the first one.
- **Charts are hand-built inline SVG/CSS.** recharts is never imported statically
  into the Overview graph; Firebase-backed loaders are `import()`ed (the boot
  import graph test enforces it).
- **Data architecture:** per-kind data hooks mounted once above the grid, keyed by
  Character (or all), with a refresh epoch from context; widgets of one kind
  share a provider and range is applied at render time.
- **Layout store:** `createSyncedSetting` key `sync.overviewLayout`, default
  `null`; `parse` keeps unknown kinds and fields (forward compatible); first run =
  `null` after hydration. Returning pilots with old hidden/order keys are
  migrated.

## 13. Corp overview board

`/corp` is the same engine on a second board (decision
`docs/context/decisions/20261020-201817-corp-overview-is-a-widget-grid-the-pilot.md`).
A `WidgetBoard` context (`widgets/board.ts`) carries what differs; the grid,
Customize, Gallery, menu and phone list are shared.

- **One catalogue.** One global kind table; corp-only ids start with `corp`.
  Each kind lists the boards it is on; Structures and Moon extractions are on
  both. Corp kinds carry `capabilities` (any one opens it) and sit in the corp
  Gallery groups `CORP_KIND_CATEGORIES` (Clocks, Money, People, Industry, Ops).
- **One layout per pilot**, `sync.corpOverviewLayout`; not per corporation or
  Character.
- **No Role chooser, no first-run prompt.** Until the pilot edits, the page
  draws the full `corpDefaultLayout()` and never saves it; `canDraw` decides
  what each Character sees. Reset rebuilds it.
- **Hide, don't lock.** A kind whose capability the Character lacks is not
  offered, drawn or fetched (`canDraw`); a saved one stays in the layout, undrawn.
  Coming-soon kinds are listed for everyone, not addable.
- **No Character scope menu** (`characterScope: false`): corp data belongs to
  one corporation.
- **Gated reads.** Each corp loader calls `resolveCorpReadAccess` before it
  fetches. Unreadable (no role, or a lapsed grant), failed (Retry) and empty
  stay distinct. One exception: Corp kills reads public zKillboard stats, so
  it carries no capability and no gate.
- **Cache window.** No countdown shorter than the read's cache window: 1 h for
  the corp reads, 5 min for corp contracts (ESI caches that route for 300 s).
  The data-age popover carries the hourly note.
- **No Show info links** from rows; tables link rows to pages.
- **Coming soon (one):** SRP, which needs app-owned data and an ADR first (#4608).
  Doctrine readiness and Corporation projects were dropped (#4614, #4609). Any new
  corp scope must be additive (`ADDITIVE_CORP_CAPABILITIES`).

## Appendix A. Default view and size per kind

The owner's rule: not every widget opens as a Number. A kind opens in the view
that answers its question; every kind still offers the other views it has.
`kinds.ts` is the source of truth (`defaultView`, `defaultSize`); roles,
Reset and the Gallery all follow it. A saved layout keeps the view it stored
(the old `list` reads as `table`).

| Kind | Default view | Default size | Views offered |
|---|---|---|---|
| training | Number | S | Number, Chart, Table |
| sp | Number | S | Number, Table |
| location | Number | S | Number, Table |
| clones | Table | M | Number, Table |
| wallet | Chart | S | Number, Chart, Table |
| walletFlow | Chart | M | Number, Chart, Table |
| netWorth | Chart | M | Number, Chart, Table |
| orders | Table | L | Number, Chart, Table |
| priceWatch | Table | M | Number, Table |
| stock | Table | M | Number, Chart, Table |
| omega | Chart | M | Number, Chart, Table |
| lp | Chart | M | Number, Chart, Table |
| belowMarket | Number | S | Number, Table |
| miningTax | Number | S | Number, Table |
| industry | Table | M | Number, Chart, Table |
| profit | Chart | M | Number, Chart, Table |
| miningYield | Chart | M | Number, Chart, Table |
| planetary | Table | M | Number, Chart, Table |
| structures | Table | M | Number, Chart, Table |
| moonChunks | Table | M | Number, Table |
| incursions | Table | S | Number, Table |
| comingUp | Table | M | Number, Table |
| contracts | Table | M | Number, Table |
| mail | Table | M | Number, Table |

Coming-soon kinds open as a Number until they are built.
