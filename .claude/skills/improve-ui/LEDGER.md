# UI audit ledger

Reference for the next `/improve-ui` run. Curated in place, by topic rather
than by run. No dates, no run metadata. Keep under ~150 lines. Phone-width
findings live in `.claude/skills/improve-mobile-ux/LEDGER.md`, not here.

## Surfaces audited

One row per surface, with what the audit concluded.

| Surface                          | Conclusion                                                                                                                                                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Industry (index tabs)            | Build Plans list hand-rolls its heading in the panel body (filed). Active Jobs bar, Records, Opportunities follow the Panel contract. Free-slots triad and 7xl width are deliberate (see Killed). Populated states are not renderable from the mocks. |
| Skills (Plans, Trained)          | Skill Plans list hand-rolls its heading beside a Panel-header Attributes pane (filed). Trained tab is clean.                                                                                                                                          |
| Market (Market, Open, Appraisal) | Empty-state renders read fine at 1440 and 1024. Item-selected and History renders failed (ESI orders route unmocked), so the order-book panel is unaudited.                                                                                           |
| Overview, Wallet, Assets         | Already ticketed by earlier runs (#1615, #1616, #1617); not re-audited.                                                                                                                                                                               |
| Contracts                        | Search tab only reachable as "isn't available" without the sync backend; History not audited.                                                                                                                                                         |

## Contract already enforced

UI rules proved by a spec or a shared primitive, so no run re-discovers them.

- `Panel`'s header (panel-2 fill, hairline, `min-h-9` at `md`) is the shared toolbar. A panel given `title` or `actions` gets it for free.
- Page width tiers are per-route `mx-auto max-w-*` (decision: app-wide page width). Most routes are `max-w-6xl`; Industry's three routes are `max-w-7xl`.

## Standing kill-tests

Reusable heuristics learned from runs, beyond RUBRIC.md's own.

- **Comment-documented design.** A header comment stating why a control looks the way it does (tone per category, tooltip breakdown, placement in `actions`) makes it deliberate. Ask for a real cost the comment did not weigh, not a redesign.
- **Width drift between route families.** A few px shift in the content column between routes is cosmetic; the wide-table routes were widened on purpose.
- **Mock-limited surfaces.** If the populated state cannot be rendered offline, mark the finding `code-read only` or leave the panel unaudited; do not file from an empty state alone.

## Filed findings

Issue number, size (tweak/rework), verdict, one line.

- #1625 tweak SHIP: Skill Plans and Build Plans panels draw their heading in the body, not Panel's header bar.

## Killed findings

What was killed, and why. This is what stops a re-pitch.

- Industry "Free slots 1 / 1 / 1" unlabeled categories: the label is visible from `sm` up, the tooltip carries the breakdown, and a header comment documents the per-category tone and far-right placement (#679). KILL.
- Industry `max-w-7xl` versus `max-w-6xl` elsewhere: the Industry tables were widened deliberately; a 25px shift on navigation is cosmetic and unprovable beyond restating a constant. KILL.
