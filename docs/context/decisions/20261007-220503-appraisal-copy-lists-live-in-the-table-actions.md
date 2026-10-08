# Scope decisions — Appraisal copy lists live in the table actions menu, one list per exit

_Recorded 2026-10-07._

- **The Appraisal's copy lists sit in its table actions menu, above "Export table ▸", not behind a
  separate Copy button.** Copy and export read as the same job to a pilot, and the shared
  `TableActionsMenu` already stacks table-level actions over an Export submenu. A second
  clipboard icon beside it is what this rules out.
- **Four lists, each item in at most one of the three sell exits.** Sell now (name, quantity),
  List at undercut (name, price — the existing sell list), Refine (name, quantity) and Multibuy.
  An item goes to Refine when the table's own `refineBeatsSellAsIs` is true, else to List when a
  legal undercut price beats the best buy order, else to Sell now when someone is buying. The
  same stack is never pasted into two in-game windows. List at undercut no longer includes items
  whose undercut is no better than the buy order; those moved to Sell now.
- **No quantity column on the undercut list stands** (Import Prices matches by name only); Sell
  now and Refine are name-and-quantity checklists, not paste-and-go price imports.
- **Out of scope here:** a per-row override of which exit an item takes, cost-basis floors on
  Appraisal rows, and a market-volume column ("moves about N a day", hidden by default). Each is
  its own ticket.
