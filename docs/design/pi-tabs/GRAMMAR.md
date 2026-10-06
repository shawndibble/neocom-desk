# PI tabs: conformance to `docs/DESIGN.md` §6c (interaction grammar)

The mockups in this folder predate §6c (merged in #2638, states in #2640). Where a
mockup and §6c disagree, **§6c wins**. Compare structure, wording and icons against
the mockups, but build these cues the §6c way. Each is a deliberate difference to
leave out of any "differences from the mockup" list.

| Mockup does | Build instead (§6c) |
| --- | --- |
| Product / item names as plain text or boxed chips | Item names are accent entity links (real `<a href>`) to the PI product detail (the Map drawer, by URL; §6c Overrides, #2726), underlined on hover and focus. Market and Show info sit in the ⋮ or the drawer. A column is all links or none. |
| System names as plain text | Solar-system names link to Route Safety with that system as destination. Stations are not clickable. |
| Native `title=` tooltips (▲ ≈ ▼ chips, icons, truncated text) | `Tooltip` / `HintText` (dotted underline) / `InfoTooltip`. The content is also in the accessible name; a tooltip is never the only place. |
| A "?" button that opens "How to use the map" / "New to PI?" | Those are drawers, so use a labelled button, not the "?" circle (the "?" circle is a tooltip only). |
| "Sell at" in both the strip and the settings modal | One picker, in the header strip ("Where do you sell?"). The strip also carries a labelled "PI settings" button (text, not a gear) for the rest of the settings; the modal has no sell picker. Settings → Industry has no strip, so it keeps the picker. |
| A bare "EST." badge after an unrelated chip | The badge sits on the note it qualifies ("Estimated prices", a `HintText` saying why). |
| A gear that opens PI settings | Fine (a gear opens this page's settings modal). Linking to the Settings page is labelled text, not a gear. |
| Rows that jump to another page (Colonies row to Plan) | A real link ending in a faint `CaretRight` (accent on hover). A row that expands in place uses `Disclosure`'s rotating leading caret. |
| Selected card / planet / product (tint or box) | Accent 2px left border + `panel-2` fill + accent label, `aria-current="true"` (single) or `aria-selected` (multi). A toggle uses `aria-pressed` with the accent tint. Selected must never look like hover. |
| Buttons labelled "Edit…", "Show me how" etc. | "…" only when the click opens a dialog that needs more input or confirmation. Not on buttons that only reveal or show. |
| EVE University and other third-party links | `ExternalLink` (trailing icon, new tab, hidden "(opens in a new tab)"). Our own pages open in the same tab. |
| ISK as plain formatted text | `IskAmount` (B/M/K suffix, exact value on hover or tap). Full `formatIsk(…, 2)` only where the exact figure is the point. |
| Hover fills and hand-rolled focus rings | Use the shared recipe in `controlStyles.ts` (120ms colour-only transitions, `panel-2` hover inside `@media (hover: hover)`, 2px accent focus outline: outset on boxed controls, inset on full-bleed rows and tabs). Disabled = `opacity-40` + `aria-disabled` and a tooltip when a reason matters. |
| Loading text on buttons | `Button loading`. |
| Phone cards and sheets | Whole card is the primary action with an accent title; ⋮ pinned top-right at 44px; touch-and-hold opens the ⋮ menu, never a tooltip. Bottom sheets: grabber, swipe-down, scrim / close / Back / Esc, safe-area padding. 44px tier applies below `md` or on `(pointer: coarse)`. |
| Animations (drawer slide, hint pulse) | Overlays 200–250ms; none of it under `prefers-reduced-motion`. Never animate a transform on a control. |

## Per page

- **Plan:** recipe cards are not rows that navigate, so no `CaretRight`. The product name is the entity link; "Show me how" is an in-place expand (`Disclosure` caret). A red "Find one" host mark on a card is a ghost `Button` that opens that card's Show me how (never closes it). Planet names under planet images are plain text (not entities); system names in the finder are Route Safety links with the security colour plus its number.
- **Map:** planet toggles are `aria-pressed`; a traced or selected product takes the selected treatment; a product name (tile, phone row, drawer chain) opens that product's PI detail by URL, never Market; Market and Show info are the drawer's "View in Market" and "Show info" buttons; the drawer follows the sheet rules above.
- **Colonies:** each row is a `Disclosure` (expands in place; a click on the row body expands it too, while the planet and product names inside stay links, a recorded exception: `docs/context/decisions/20261006-093301-colonies-row-click-expands-despite-inner-links.md`); "Plan this colony" is a real link with `CaretRight`; the planet / system name is an entity link; the row's actions live in a ⋮ menu (`rowMoreActions`), which right-click and touch-and-hold on the row also open (on a link, the browser's menu wins), with the primary action also visible.

## Deliberate differences from the mockups (not §6c)

Beyond the cues above, six departures are product decisions, recorded in
[the 2717 decision](../../context/decisions/20261005-210436-pi-design-refs-deliberate-differences-not-built.md). Leave them out of any
"differences from the mockup" list; do not build them.

- **Plan / Find best:** no "What matters more" switch (Make more keeps it); "Show me how" has no planet diagram.
- **Map:** phone shows a tier list, not "Your best moves" / the trace; the "have" tag stays boxed; no "I have planets / best thing to make" question toggle.
- **All tabs:** "New to PI?" opens the explainer drawer directly, with no popover or link to it.

Source of truth: `docs/DESIGN.md` §6c. If this file and §6c ever disagree, §6c wins.
