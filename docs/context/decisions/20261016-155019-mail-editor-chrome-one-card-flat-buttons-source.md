# Scope decisions — mail editor chrome: one card, flat buttons, source icon toggle

_Recorded 2026-10-16._

- **The mail editor is one card with a flat format bar.** The bar is the top strip of the same frame as the writing area (one border, one hairline under the bar), not a bordered box above a bordered surface. Bar buttons are borderless (`IconButton variant="plain"`): visible on hover/focus, accent-tinted when pressed, grouped by hairlines as [bold, italic, underline] | [colour, size] | [link, table] | [clear]. 44px touch targets stay. Phone with the keyboard up: an edge-to-edge fixed strip with a top hairline (`data-mail-format-bar="docked"` unchanged) (superseded: see `20261016-183802-mail-format-bar-sits-at-the-top-of.md`).
- **Source is an icon-only `</>` toggle at the bar's right end** ("Edit source", `aria-pressed`); Preview is just the default state. **Supersedes** the "Preview/Source SegmentedControl above the writing surface" bullet of `20261016-141225-mail-editor-tiptap-view-switch-above-the-surface.md`.
- **The body counter sits in the card's bottom-right corner**, passed to the editor as a `counter` prop; Subject keeps its counter beside its label.
- **Link is disabled inside a table cell** (cells hold plain text, so a link would silently do nothing), with a tooltip saying why.
