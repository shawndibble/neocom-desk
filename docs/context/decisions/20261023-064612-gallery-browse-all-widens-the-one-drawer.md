# Scope decisions — Gallery Browse all widens the one drawer

_Recorded 2026-10-23._

- **Browse all is the Gallery's own wide mode, not a second surface.** The Overview and
  the Corp Board mount the same `Gallery`; "Browse all" widens that one non-modal
  `SlideOver` (to 70% of the page) instead of opening a modal, so the board's left edge
  stays in view while you add and the search text and category survive the switch. A
  phone keeps its bottom sheet and gets no toggle.
- **Featured is the board's default layout, not the pilot's Roles.** Roles are only a
  first-run chooser and are never stored per pilot, so there is nothing to personalise
  from. The default layout is what each board already starts a new pilot with, and works
  the same on the Corp Board.
- **Done stays in Browse all.** The drawer's close control is easy to miss in a wide panel, and
  Done is the multi-add exit the design asked for; it only closes, it adds nothing.
- **No "New" badge.** `20261011-151540-overview-widgets-carry-no-new-tag.md` still
  stands: there is no lifetime or seen-state to hang one on. "Not on your board" (on by
  default in Browse all, not in the drawer) answers the same question for a pilot.
- **"Coming soon" is the only unavailable reason.** `availability` carries no reason
  string, and the Corp Board hides kinds a Character lacks the Capability for.
