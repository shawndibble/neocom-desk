# UI audit ledger

Reference for the next `/improve-ui` run. Curated in place, by topic rather
than by run. No dates, no run metadata. Keep under ~150 lines. Phone-width
findings live in `.claude/skills/improve-mobile-ux/LEDGER.md`, not here.

## Surfaces audited

One row per surface, with what the audit concluded.

| Surface                                                                                         | Conclusion                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fittings start screen (`/fittings`, nothing open: `FittingStartScreen` list + `FittingPreview`) | Two real bugs at pointer width: preview pane too narrow for its two-column layout at 1024, and long names push a row's actions menu out of the list. Populated state only reproduces with a mocked ESI fittings route. |
| Skills › Trained (`/skills/trained`)                                                            | Mostly clean. One gap: the training skill is invisible while its group is collapsed (the default). Group-level SP subtotals were rejected.                                                                             |
| Contracts › History (`/contracts`)                                                              | Clean at 1440 and 1024: table via `DataTable`, search + column picker + filter in one bar, long titles wrap. Search tab renders only an unavailable state without the sync backend, so it wasn't audited here.         |

## Contract already enforced

UI rules proved by a spec or a shared primitive, so no run re-discovers them.

- Page width: every single-column route is `mx-auto max-w-6xl` (Industry `max-w-7xl`), decided in `20260901-172427-app-wide-page-width`. `/fittings` is the deliberate exception: it has no cap because the editor goes three columns at 100rem.

## Standing kill-tests

Reusable heuristics learned from runs, beyond RUBRIC.md's own. A new one earns
its place by killing a whole class of finding.

- **A width-mismatched page that shares a route with a wide editor.** Fittings start screen vs its siblings' `max-w-6xl` is the editor's width, not drift. Drop unless the start screen itself misbehaves.
- **Mock artefacts.** An `Unknown 90000001` issuer or a blank status in a screenshot comes from the e2e mock (missing names, non-ESI status values), not the app.

## Filed findings

Issue number, size (tweak/rework), verdict, one line.

- #2000 tweak (bug), SHIP: Fittings start preview overflows the page at 1024 and mangles meters/resist table; lay the preview out by its pane's width.
- #2001 tweak (bug), SHIP: Fittings start list, a long fitting name pushes the row's actions menu and badge out of alignment.
- #2002 tweak, NARROW: Skills trained, show the in-training chip on the collapsed group header.

## Killed findings

What was killed, and why. This is what stops a re-pitch.

- Skills trained per-group SP subtotal in the header: no named user cost; Total SP chip already answers "how much SP".
- Fittings start page wider than sibling routes (no `max-w-6xl`): shares its container with the wide editor.
- Contracts History: nothing survived (Expires column shows absolute dates only, but Calendar already carries contract expiries).
- Fittings start list has no Saved/In-game filter or sort: the decision file rejected a sortable table, and search covers it.

## Tooling notes

- A fittings ESI route regex must allow the missing `/latest` prefix: `esi\.evetech\.net\/(.*\/)?characters\/\d+\/fittings`. `.*\/characters` needs two slashes and matches nothing, so the page silently shows the empty state.
- Populated preview needs the mocked `/universe/types/{id}` route from `e2e/fittingsLoadNarrow.spec.ts`.
