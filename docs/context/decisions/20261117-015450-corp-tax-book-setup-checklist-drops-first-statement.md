# Scope decisions — Corp Tax Book setup checklist drops the first-bill step (issue #6309)

_Recorded 2026-11-17 · issue #6309._

- **"First bill issued" is no longer a setup step.** It amends the step list in `20261112-220942-corp-tax-book-setup-checklist-on-the-overview.md`. A new book could not issue its first calendar bill until a period closed, usually weeks later, so the checklist stayed open for weeks and never completed. Sending Late notices is a recurring task, not setup; the late-notice run prompt and the Moons nav badge already say when a run is due.
- **Steps now: Corp tax rate set, Automatic sync turned on, Refinery names readable.** The checklist completes and hides once those are done. The button to the bills tab is gone from the checklist.
- **The dismissal `localStorage` key is unchanged**, so a book that dismissed or completed the checklist stays hidden.
