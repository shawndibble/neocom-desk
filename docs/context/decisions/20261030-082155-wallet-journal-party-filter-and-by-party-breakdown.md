# Scope decisions — Wallet Journal party filter and By party breakdown (issue #5602)

_Recorded 2026-10-30 · issue #5602._

- **The personal journal copies Corp Wallet's row menu.** Each line gets "Filter to <party>" and "Filter to type"; the filter bar gets a searchable Party select and a Party chip in the URL. A clickable name in the Description cell was rejected: the cell is ESI's text, and a row action beats a name link.
- **A Journal Party is the other side of a line, whoever it is:** player, corporation or NPC (CONCORD, Secure Commerce Commission). Hiding NPCs was rejected as a surprising rule. Transfers between the user's own Characters stay netted.
- **"Where the ISK went" gets a By type / By party switch, remembered per device.** By party lists every party (no cap) with In / Out / Net, largest first; a row click sets the party filter. This is RIFT's Insights → Transactions drill.
- **Each view ignores only its own filter.** By party ignores the party filter and follows ref type, dates and text; By type keeps ignoring the ref-type filter (`20261007-222712`) and now follows the party filter, so a drilled-in party shows its type mix.
- **Market fills group into one "Market trades" row in By party;** clicking it sets the ref-type filter to market transactions. Each order-book stranger as a row was rejected as noise; the Party select still reaches one trader.
- **Corp Wallet is unchanged:** it keeps its Player filter and gets no By party view.
