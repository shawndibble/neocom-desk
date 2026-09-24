# Scope decisions — Standing icon and skill gate marker take a tab stop (issue #1489)

_Recorded 2026-09-24 · issue #1489._

- **Tooltip-only triggers are tab stops: the standing icon, the skill gate marker and the Contacts across-characters count.** A sighted keyboard reader can only get the standing number, the missing skills or the holding characters from the tooltip, and the tooltip opens on focus (WCAG 2.1.1). This reverses StandingIcon's earlier choice to skip the tab stop because a long contact list would gain one per row. That cost is accepted, and it reaches every StandingTag surface (Contacts, Contracts, contract detail, Mail). DataTable rows now handle Enter/Space only when the row itself has focus, so a focused trigger inside a clickable row does not also activate the row.
