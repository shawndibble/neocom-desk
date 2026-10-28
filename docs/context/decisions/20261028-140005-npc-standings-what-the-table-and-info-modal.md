# Scope decisions — NPC standings: what the table and info modal show, and what they assume

_Recorded 2026-10-28._ Rules and sources: `docs/research/npc-standings-*.md`.

- **There are no NPC alliances.** The hierarchy is faction > corporation >
  agent, so the Standings tab's Type words are Faction / Corporation / Agent,
  never "NPC corp" / "NPC agent".
- **A name in the Standings table opens the shared info modal**, whose open
  state is the URL (`?info=faction-<id>`, `corporation-<id>`, `character-<agent
id>`), so a Route Safety "N jumps" link inside it and Back return to the page
  with the modal open. A Back or Forward onto any entry that carries `info`
  now reopens its modal, for every entity modal, not only NPC ones.
- **An NPC corporation's modal drops the player-corporation facts** (member
  count, age, tax rate, CEO, founder, founding date, shares): they mean
  nothing for a corporation no player runs. A player corporation's modal is
  unchanged, including the Faction row of a Faction Warfare corporation.
- **ESI's `GET /characters/{id}/standings` is assumed to return BASE
  standings** (UNVERIFIED: no CCP source says). The assumption is one constant,
  `ESI_STANDINGS_ARE_BASE`; the check is a comparison with the in-game
  Standings tab on a pilot with Connections trained.
- **Access (the agent levels a chain opens) needs the pilot's skills.**
  Access is gated by the standing skills lift (Connections, Criminal
  Connections, Diplomacy), so with skills unknown the table's With skills and
  Access are empty and the modal omits its Access card, rather than answering
  from base standing and understating it. The modal's standing card still
  shows the base numbers.
- **Only basic (level 1-5 mission) agents are in the agents data.**
  Storyline, Faction Warfare, research, Epic Arc, career and CONCORD agents
  follow other access rules and are left out of the first version; a standing
  row for one shows its name and standing only.
- **Reprocessing tax is modelled as linear**, `take * max(0, 1 - standing /
6.67)`, with the station's own take (`reprocessingStationsTake`: 5% at most
  stations, 2.5% at 119) and the owner corporation's effective standing. CCP
  publishes only the endpoints (5% at 0, 0% at 6.67); the straight line is
  community-sourced (medium confidence). The modal shows it with a `~`.
- **A faction's "At their stations" card is built from the Trade Hubs it
  owns**: a faction that owns stations but no Trade Hub shows none.
- **The Standings filters sit inline on desktop**, with the Columns button at
  the right, an exception to `FilterBar`'s "always behind the funnel" rule that
  the page's design asked for; a phone uses `FilterBar`.
- **A faction's modal has no "Open in EVE"**: it is unconfirmed that the
  client's information window accepts a faction id.
