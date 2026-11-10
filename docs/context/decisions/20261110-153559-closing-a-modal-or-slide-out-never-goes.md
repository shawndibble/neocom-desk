# Scope decisions — Closing a modal or slide-out never goes Back

_Recorded 2026-11-10._ Replaces the "Back when the app pushed the entry" Close
(`docs/features/entities-share.md`, and the same pattern copied to the Ship Info
window, Implants editor, LP store and PI drawer) for every window the URL backs.

- **Close writes the URL; it never calls `navigate(-1)`.** A modal or slide-out
  sits over a page the pilot wants to see as they left it. Going Back lands on
  the entry before the open, so anything the page changed under the window
  (a faction picked on the live Ship Tree, a param written by an effect) was
  reverted, and an entry pushed from another page (the LP store) put the pilot
  on that page, not the one under the layer. Reproduced with a failing test on
  each of the Ship Info window, entity info (`?info=`), the Implants editor and
  the LP store; the PI product drawer had the same code but no second write to
  revert today. All five now replace the entry with the same URL minus the
  window's params: `closeShip`, `EntityInfoRoute` close, `closeModal`,
  `closeStore`, `dropProduct`. The `{entityInfo}`, `{implantsPushed}` and
  `{piProduct}` history-state markers existed only to choose Back, so they went.

- **Opening still pushes, so browser Back still closes the window** (DESIGN §6c,
  "Back / Escape closes the top overlay"). The cost, accepted: after a ✕ close
  the pushed entry stays as one extra Back step onto the same page.

- **`useOverlayHistory` keeps calling `history.back()` on close, and that is
  the one Back that stays.** It pops only an entry it pushed itself, at the
  page's own URL, and only while that entry is still the current one (it checks
  its marker). The page is identical before and after, so nothing visible
  moves, and it spares the pilot a dead Back step on every ordinary modal. A
  URL write over its entry drops the marker, so it then does nothing.

- **`MovePlanTab`'s `onBack` is not a window close.** It is the Back control of
  a plan step the tab pushed on entering it, and stays.
