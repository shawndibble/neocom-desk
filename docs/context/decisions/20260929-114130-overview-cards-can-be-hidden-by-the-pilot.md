# Scope decisions — Overview cards can be hidden by the pilot

_Recorded 2026-09-29._

- **The pilot can switch whole Overview cards off from an edit menu in the
  board's summary strip.** Orders, Mining tax, Contracts, Planetary industry,
  Industry jobs and Alerts can each be hidden. This narrows the board's
  "every card renders in every state" rule. The board still never drops a card
  because of what it guessed about the data. It drops one only because the
  pilot said to. The Summary Strip itself (deadline, training, wallet) can't
  be hidden.
- **One synced list for the whole account, not per device or per Character**
  (`sync.overviewHiddenCards`). A domain you don't do is a fact about the
  pilot, and the user asked for it to follow them across devices and
  Characters. The list stores hidden keys, so a card added later shows by
  default.
- **A hidden card leaves the board completely.** It gives up its desktop slot,
  its folded row on a phone, and its share of the Next deadline. A deadline
  whose link lands on a card you hid would be a number with nothing behind it.
  Training and calendar deadlines aren't cards, so they always count.
- **Hidden cards still load their data.** The loads are unconditional hooks,
  and skipping them would mean reworking `useRouteSnapshot`. That's a possible
  follow-up if the ESI cost of a hidden card ever matters.
