# Scope decisions — Colonies row click expands despite inner links (issue #2766)

_Recorded 2026-10-06 · issue #2766._ The rules live in `docs/DESIGN.md` §6c
"Entities" and "Restraint".

- **A click on a Colonies row's body expands it, and the planet and product
  names inside stay links.** This is a recorded exception to §6c Restraint's
  "a row's primary action beats name links inside it". The row is a
  disclosure, and expanding it is what a pilot scanning colonies wants from a
  click anywhere. The names answer other questions (where is it: Route Safety;
  should I build this: the PI product detail, per
  `20261005-212941-entity-link-destination-follows-the-page-pi-item.md`), and
  stay real `<a href>`s. A click on a link, button or input is that control's,
  never the row's. The leading caret button is the row's real toggle for
  keyboard and screen readers; the row-body click is a pointer convenience.
- **Right-click and touch-and-hold on the row open its ⋮ menu; on a link they
  stay the browser's.** Same items as the ⋮. A finger lifting off a hold that
  opened the menu does not also expand the row.
- **Rules out:** making the names plain text to satisfy Restraint, and
  dropping the row-body click.
