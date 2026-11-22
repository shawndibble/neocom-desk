# Scope decisions — Contracts opens on My contracts, not Item search

_Recorded 2026-11-22._

- **Contracts opens on My contracts (the tab id and URL stay `history`).** Owner,
  2026-11-22: it is the page they want first, and "History" was a misnomer since
  it also lists current contracts. This reverses `20260912-200030`.
- **The remembered Items/Courier landing (#1719) is removed.** A bare `/contracts`
  visit always lands on My contracts, so a remembered search mode had nothing to
  override. A stored `contractSearchMode` value is simply unread.
- **A Type column joins the table; the identity column is headed Contract.** The
  identity column showed the title or route under a "Type" header. Type is an
  optional column, off the phone card (the identity line already says it for an
  untitled contract). A courier's collateral sits inline after its route.
