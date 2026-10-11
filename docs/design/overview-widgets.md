# Overview widget grid — design record

Approved by Shawn after a mockup review (four rounds, a hostile first-time-user
review, Mobbin research). The interactive mockup is
`docs/design/mockups/overview-widgets.html` — open it in a browser; it is the
visual source of truth. This file is the written source of truth, and the
checklist in §9 is what the implementation is verified against.

## 1. Intent

The Overview is the pilot's own summary of what matters to them. It stops being
a fixed board of 13 domain cards plus an Alerts column and becomes a **grid of
Widgets the pilot chooses, sizes, orders, renames and removes**. Each Widget can
be drawn as a **Number**, a **Chart** or a **List** (where it has them). The
alerts feature moves out of the page into a **bell in every page header** and a
**danger banner** on the Overview.

Everything on the page is the pilot's choice. The default is only a starting
point.

## 2. Vocabulary (add to CONTEXT.md)

- **Widget** — one tile on the Overview, an instance of a **Widget Kind** with
  its own size, view, optional rename, character scope and range. The same kind
  may appear more than once.
- **Widget Kind** — an entry in the catalogue (Wallet, Orders, Planetary…).
  Declares its title, category, which views it has, its default size, which
  settings apply (range), its ESI permission, its empty message.
- **View** — Number / Chart / List. A Widget shows one. List is also the text
  equivalent of a Chart.
- **Size** — S / M / L / Full: a share of one row's width (⅓, ½, ⅔, whole), not
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

1. Page header (existing `CharacterHeader`): character switcher (Kara Voss ▾ /
   other Characters / **All characters**), **Next deadline chip**, "Updated N
   ago", Refresh, **Customize** button, **bell**.
2. Sub-nav: Overview / Clones / Employment history. **Unchanged — those pages
   stay.** Only the Overview tab's content changes.
3. **Danger banner** (when an unacknowledged danger Alert exists).
4. **Edit bar** (while customizing).
5. **The grid.**

The old summary strip (Next deadline / Training / Wallet cells) is gone: Training
and Wallet are Widgets; Next deadline is only the header chip. The old Alerts
column and the "Everything else" phone fold are gone.

## 4. The grid

- Flex-wrap rows, **no gap-filling**: reading order = screen order = ↑/↓ order.
  A row's leftover width is shared (flex-grow), so no holes.
- Size → flex-basis: S ⅓ (min 190px), M ½ (min 260px), L ⅔ (min 340px), Full 100%.
- Size also sets how much a view shows: list rows S3 / M4 / L6 / Full10; chart
  height 44 / 70 / 100px; Number view at M+ adds a mini chart under the figure.
- **Every Widget always shows its headline number** — a Small Chart still shows
  the value above the chart.
- Phone: same list and order; S two across, M/L/Full full width. A Widget can be
  set **Hide on phone**.
- Each Widget header: title (micro), optional **New** tag, optional character
  scope chip ("All characters"), **Open ›** link to its page, **⋯ menu**.
- No Widget header carries glyph view-cyclers; view switching lives in ⋯.

### Widget ⋯ menu

View (Number/Chart/List, only the ones the kind has) · Character (Header / All)
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
(All, Recently added — only for returning pilots —, then the categories).
Each item: name, **New** tag, description, an Add / **Add another** button, and
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
separate count); Wallet flow is Income vs Spending bars; Net worth stack has no
red and a legend in bar order; bars carry a max and a time range; every chart
has a visually hidden text summary and its List view is the table; colour is
never the only signal.

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
- [ ] E2 Sizes S/M/L/Full set row width; order = screen order, no holes.
- [ ] E3 Views Number/Chart/List per kind; headline number always visible.
- [ ] E4 Widget header: title, New tag (returning only), scope chip, Open link, ⋯.
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
- [ ] E17 Character switcher incl. All characters; Updated N ago + Refresh; Next deadline chip (amber < 3 h, red < 30 min); Customize.
- [ ] E18 Sub-nav unchanged (Overview / Clones / Employment history).
- [ ] E19 Bell in every page header; badge red only for danger; dim at zero.
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
