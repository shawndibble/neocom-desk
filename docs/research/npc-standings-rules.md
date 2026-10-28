# EVE NPC standings: rules for agents, NPC corporations and factions

Researched 2026-10-28.

Source tiers used:

- **CCP-1**: CCP support site, fetched through its public Zendesk JSON API (`support.eveonline.com/api/v2/help_center/en-us/articles/<id>.json`). Current: Standings article updated 2026-09-14, Broker Fee article 2026-09-26.
- **CCP-2**: CCP data. Live ESI OpenAPI spec (`esi.evetech.net/meta/openapi.json`, compat date 2025-09-30), live ESI responses, the ESI id-ranges doc, and the SDE (build 3654997, released 2026-10-27, downloaded and read).
- **CCP-3**: CCP news and patch notes.
- **EVEUni**: wiki.eveuniversity.org, read as raw wikitext (`index.php?title=<Page>&action=raw`). Current, but a community wiki.
- **Forum**: only used as a pointer. Never counted as verified.

## 1. Summary table of verified facts

| Fact                                     | Value                                                                                                                                                                                                          | Source                                                                                                                           | Confidence                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scale                                    | -10 to +10, real numbers                                                                                                                                                                                       | CCP-1 (Standings: "-10 standing" examples, max 10), EVEUni NPC_standings                                                         | High                                                                                                                                                                        |
| Hierarchy                                | faction > NPC corporation > agent. Each NPC corporation has exactly one `factionID` (SDE). Each agent has one `corporationID` (SDE `npcCharacters.agent`).                                                     | SDE `npcCorporations.jsonl`, `npcCharacters.jsonl`                                                                               | High                                                                                                                                                                        |
| NPC alliances                            | **None.** The SDE `npcCorporations` has no `allianceID` field. ESI id-ranges has no NPC-alliance range. The ESI NPC corp response (CONCORD, Caldari Navy) has no `alliance_id`.                                | SDE; docs.esi.evetech.net/docs/id_ranges.html; live ESI                                                                          | High. Absence-of-evidence, but three independent CCP data sources agree.                                                                                                    |
| Agent levels                             | 1 to 5                                                                                                                                                                                                         | SDE `agent.level`, CCP-1                                                                                                         | High                                                                                                                                                                        |
| Level to standing needed (normal agents) | L1 none (see conflict note), L2 1.0, L3 3.0, L4 5.0, L5 7.0                                                                                                                                                    | CCP-1 Standings table (L1 shown as -10), EVEUni Agent, EVEUni NPC_standings                                                      | High                                                                                                                                                                        |
| Which standing counts                    | the **highest** of the agent's, the corporation's and the faction's standing towards you, provided none of the three is -2 or lower                                                                            | CCP-1: "taken as the highest of the 'Standings With You' on the agent's Standings Tab, as long as none of those are -2 or lower" | High                                                                                                                                                                        |
| Effective or base for agent access       | **Effective** (skill-modified). The EVEUni tables mark every threshold "modified".                                                                                                                             | EVEUni NPC_standings; CCP-1 quick table says "modified" for -5, -2, 6.67, 8.5/9.2/9.9                                            | High for "effective". Medium for "skills also lift the agent's own personal standing" (EVEUni says so; CCP-1 says skills apply to "all standing values from NPC entities"). |
| Effective standing formula               | `effective = base + (10 - base) * 0.04 * skillLevel`, using whichever one skill applies                                                                                                                        | EVEUni NPC_standings and Skills:Social; CCP-1 says "up to 20%"                                                                   | High                                                                                                                                                                        |
| Which skill applies                      | Connections when base > 0 and the entity is non-criminal. Criminal Connections when base > 0 and the entity is criminal. Diplomacy when base < 0. Mutually exclusive.                                          | CCP-1; EVEUni Skills:Social                                                                                                      | High. Base exactly 0: conflict, see section 7.                                                                                                                              |
| "Criminal" definition                    | NPC factions that CONCORD holds at negative standing, plus their member corporations and agents. In practice the 5 pirate factions: Angel Cartel, Guristas, Sansha's Nation, Serpentis, Blood Raider Covenant. | CCP-1 (definition); EVEUni Criminal Connections (the list)                                                                       | Definition High. The exact list Medium.                                                                                                                                     |
| Social skill                             | +5% per level to standing **gains** from NPC agents, corporations and factions. Does not change current standing.                                                                                              | EVEUni Skills:Social; CCP-1 ("directly increases all standing gain percentages")                                                 | High                                                                                                                                                                        |
| ESI `GET /characters/{id}/standings`     | Returns `[{from_id, from_type: agent\|npc_corp\|faction, standing}]`. Scope `esi-characters.read_standings.v1`. Cache 3600 s. The schema does not say base or effective.                                       | Live ESI OpenAPI spec                                                                                                            | Schema High. **Base vs effective is UNVERIFIED in CCP docs.** Only a forum post says "raw". See section 7.                                                                  |
| Broker fee at NPC stations               | `3% - 0.3% * BrokerRelationsLvl - 0.03% * factionStanding - 0.02% * corpStanding`. Floor 1% (BR V, +10/+10). Minimum 100 ISK.                                                                                  | CCP-1 Broker Fee article; EVEUni Trading                                                                                         | High                                                                                                                                                                        |
| Broker fee uses                          | **Unmodified (base)** standings. Skills do not help. The "faction" and "corp" are the station owner's corporation and its faction.                                                                             | CCP-1 Broker Fee article                                                                                                         | High                                                                                                                                                                        |
| Reprocessing tax at NPC stations         | 5% at 0 standing, 0% at 6.67                                                                                                                                                                                   | CCP-1 Standings quick table; EVEUni Tax, Reprocessing                                                                            | High for the endpoints                                                                                                                                                      |
| Reprocessing tax standing used           | The higher of personal and corporation standing with the station-owner corp. CCP-1 labels 6.67 as "modified personal standing".                                                                                | EVEUni Tax, Reprocessing; CCP-1                                                                                                  | Medium. Only EVEUni says "higher of personal or corp".                                                                                                                      |
| Faction police                           | At -5.0 modified faction standing, that faction's navy attacks you on sight in its space. Navy ships do not scram or disrupt.                                                                                  | CCP-1 quick table; EVEUni NPC_standings                                                                                          | High                                                                                                                                                                        |
| Agent lockout                            | At -2.0 or lower with any of agent, corp or faction, that entity's L2 to L5 agents stop talking to you. L1 stay available.                                                                                     | CCP-1; EVEUni Agent                                                                                                              | High                                                                                                                                                                        |
| Corp tax-free refining                   | 6.67                                                                                                                                                                                                           | CCP-1, EVEUni                                                                                                                    | High                                                                                                                                                                        |
| COSMOS bonus offers                      | 8.5 faction frigate BPC, 9.2 cruiser BPC, 9.9 battleship BPC (modified)                                                                                                                                        | CCP-1; EVEUni                                                                                                                    | High                                                                                                                                                                        |
| Faction Warfare enlistment               | Unmodified faction standing >= 0.0. A militia member who drops below 0.0 is warned, then kicked after two downtimes.                                                                                           | EVEUni Faction_warfare, Agent, NPC_standings; CCP-1 FW article says "not negative"                                               | High for >= 0 unmodified. The kick rule is EVEUni only (Medium).                                                                                                            |
| Standing gain formula                    | `new = old + (10 - old) * inc`. Loss: `new = old + (-10 - old) * dec`                                                                                                                                          | CCP-1 ("ns=((10-s)*i)+s"); EVEUni                                                                                                | High                                                                                                                                                                        |
| Time decay                               | No passive time decay is documented anywhere. EVEUni's word "decay" means the percentage-of-distance maths only.                                                                                               | none found                                                                                                                       | **Absence only. Mark UNVERIFIED.**                                                                                                                                          |
| Agent quality                            | **Removed** in Incursion 1.5 (2011-05-19). All agents are "+20 payout, -20 access".                                                                                                                            | CCP-3 patch notes; SDE has no quality field                                                                                      | High                                                                                                                                                                        |
| Agent divisions today                    | Three real divisions: Distribution, Mining, Security. R&D agents also exist.                                                                                                                                   | CCP-3 patch notes (3 divisions); SDE `npcCorporationDivisions` and `agent.divisionID`; EVEUni Agent                              | High                                                                                                                                                                        |
| L5 agents today                          | 37 basic L5 agents, **all in low-sec, all Security division**. None in high-sec or null-sec.                                                                                                                   | SDE build 3654997, computed here                                                                                                 | High (a snapshot of the 2026-10-27 build)                                                                                                                                   |

## 2. Agent access in detail

### 2.1 Required standing by level

| Agent level | Normal (general) agents                                      | R&D agents                          | COSMOS agents (faction standing only) |
| ----------- | ------------------------------------------------------------ | ----------------------------------- | ------------------------------------- |
| 1           | no requirement. Agent, corp and faction may all be below -2. | -2.0 or higher (EVEUni Agent table) | -2.0 or higher                        |
| 2           | 1.0                                                          | 1.0                                 | 2.0                                   |
| 3           | 3.0                                                          | 3.0                                 | 4.0                                   |
| 4           | 5.0                                                          | 5.0                                 | 6.0 (some need 7.0)                   |
| 5           | 7.0                                                          | N/A                                 | N/A                                   |

Sources: CCP-1 Standings (general table), EVEUni Agent and NPC_standings (R&D and COSMOS columns, which CCP-1 does not mention).

Rules:

1. **Any one of the three is enough.** Agent, corporation or faction standing at or above the threshold unlocks the agent. CCP-1 says the game takes the highest. EVEUni gives the worked example "Eveynel Daerne".
2. **None of the three may be at -2.0 or lower** (L2 to L5). This is a veto. High corp standing does not rescue an agent whose faction standing is -2.5. EVEUni NPC_standings states this for each tier.
3. **Corp standing unlocks every agent of that level in that corporation. Faction standing unlocks every agent of every corporation in that faction.** (EVEUni Agent, "Sufficient corporation standing will give you access to all agents of a level within that corporation.")
4. **Location is irrelevant.** An agent of a Gallente corporation sitting in Minmatar space is gated by Gallente standings. (EVEUni Agent example.)
5. **R&D exception (EVEUni only).** Using faction standing for an R&D agent also needs corp standing of at least (agent requirement - 2). COSMOS agents ignore corp standing and use faction only.
6. **Effective, not base.** Connections, Criminal Connections and Diplomacy count (see section 3). The one place EVEUni says base is used is Faction Warfare.
7. **"No standing" is not 0.0.** Skills do not apply to an entity you have never interacted with (EVEUni NPC_standings). So a new character sees 0.0 effective until their first standing change with that entity. Then skills start to apply. Connections III then lifts 0.0 to 1.2, which unlocks L2.

### 2.2 Level 5, Epic Arcs, security status, divisions

- **Level 5.** No special rule beyond 7.0. They are rare and low-sec only. See section 2.3.
- **Epic Arc agents.** Only the active agent of an arc appears. EVEUni NPC_standings says faction standing unlocks them (L3 for pirate arcs, L4 for empire arcs). The Agency shows each arc's requirement. CCP-1 Epic Arc article: "the standing requirements to have the agent issue the mission can be seen when hovering the mouse cursor over the red tab". After finishing or cancelling an arc there is a 3 month wait before restarting. Arc standing gains are shared in fleets. Storyline gains are not.
- **Security status.** I found **no** security-status requirement for agent access in any CCP source or EVEUni. Security status is a separate system (Crimewatch). It is not a gate for agents.
- **Division-specific access rules.** None. The division only decides the mission type and which of the LP-gain skills applies. Distribution = courier, Mining = mining, Security = encounter. R&D = a separate small division. A division never changes the standing requirement.
- **Storyline agents.** All are L1, only active when you have done 16 missions of the same level for the same faction. They do not follow the normal standing table (CCP-1: "All level 1 agents (except for storyline agents)").
- **Career, tutorial, FW agents.** Faction Warfare agents need enlistment (unmodified faction >= 0.0) plus their own standing rules. EVEUni Faction_warfare says higher militia-corp standing unlocks higher FW agent levels.

### 2.3 Today's agent population (SDE build 3654997, 2026-10-27, computed here)

Basic agents by level and system security (high >= 0.45, low 0.1 to 0.4, null <= 0):

| Level | High | Low | Null |
| ----- | ---- | --- | ---- |
| 1     | 1659 | 654 | 211  |
| 2     | 1784 | 685 | 218  |
| 3     | 1167 | 566 | 237  |
| 4     | 747  | 542 | 268  |
| 5     | 0    | 37  | 0    |

L5 agents are all in the Security division. Other `agentTypeID` values exist (Research, Storyline, Epic Arc, Career, FW, CONCORD and others). The agent fields are `agentTypeID`, `divisionID`, `isLocator` and `level`. There is no quality field.

## 3. Effective standing and skills in detail

```
effective = base + (10 - base) * 0.04 * skillLevel
```

| Skill                | Applies when                                                                                            | Per level                  | Note                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| Connections          | base > 0 (EVEUni says "positive or 0") and the entity is NOT criminal                                   | +4% of the distance to 10  | The in-game text does not say it excludes criminal entities                               |
| Criminal Connections | same, but the entity IS criminal (faction CONCORD holds at negative standing, and its corps and agents) | +4%                        | Needs Social III                                                                          |
| Diplomacy            | base < 0                                                                                                | +4% of the distance to 10  | Same formula: base -3 with Diplomacy V = -3 + 13 * 0.2 = -0.4 (computed from the formula) |
| Social               | standing **gains** only                                                                                 | +5% on the gain percentage | Not part of the effective formula                                                         |

Examples (maths from the formula, not a quoted figure): base 0.9 with Connections II = 0.9 + 9.1 * 0.08 = 1.628. EVEUni gives the same number. Connections V caps the bonus at 20% of the distance to 10. Base 5 gives 6.0.

CCP-1 caveats: the three skills "add a permanent standing gain of up to 20%". "If Diplomacy has been trained higher than Connections or Criminal Connections, it may come to a standing drop if the standing value before the application of the skills crosses 0.0." This means the effective value can step down when a base standing rises from slightly negative to slightly positive.

Skills do **not** apply to: broker fees (base only), Faction Warfare enlistment (base only). EVEUni NPC_standings: "The only confirmed uses of unmodified standings are broker fees and faction warfare."

Unrelated: Fast Talk (+5% per level to security-status gains from CONCORD). It is not an NPC standing.

## 4. What else standing controls

| Effect                  | Rule                                                                                                                                                                                                                                                                                   | Source                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Broker fee              | See the formula in section 1. Max Broker Relations V (-1.5 points), +10 faction standing (-0.3), +10 corp standing (-0.2) = 1.0% floor. The faction standing is worth 1.5x as much per point as the corp standing. Uses **unmodified** standings. Does not apply on Upwell structures. | CCP-1 Broker Fee                                                 |
| Relist discount         | Base 50%, plus 5 percentage points per level of Advanced Broker Relations (75% at V). This is not a standing effect. **The sources conflict on the per-level number**: the CCP Advanced Broker Relations page says 5 points, but EVEUni Trading says 6 points.                         | CCP-3 (eveonline.com Broker Relations item page); EVEUni Trading |
| Reprocessing tax        | 5% at 0, 0% at 6.67. Higher of personal and corp standing with the station owner. Corp standing matters here, not the faction.                                                                                                                                                         | CCP-1; EVEUni Tax                                                |
| Agent access            | Section 2.                                                                                                                                                                                                                                                                             |                                                                  |
| Faction police          | -5.0 modified: navy attacks in that faction's space, with no scram. CONCORD navy attacks below -5.0 only in Sanctum (Genesis).                                                                                                                                                         | CCP-1; EVEUni NPC_standings                                      |
| Agent lockout           | At or below -2.0, L2 and above locked.                                                                                                                                                                                                                                                 | CCP-1                                                            |
| COSMOS special offers   | 8.5 / 9.2 / 9.9 modified faction standing.                                                                                                                                                                                                                                             | CCP-1; EVEUni                                                    |
| Faction Warfare         | Enlist with unmodified faction standing >= 0.0. Rank promotions at integer unmodified militia-corp standings.                                                                                                                                                                          | CCP-1 FW; EVEUni Faction_warfare                                 |
| Jump clone installation | **No longer standing-gated** since the Aegis update (2015-07-14). Used to need 7.0 or 8.0. NPC station clone bays charge 900,000 ISK.                                                                                                                                                  | EVEUni Jump_clones (Medium: no CCP page read)                    |
| Station services        | The SDE `stationStandingsRestrictions.jsonl` has a single row, for the Triglavian Collective (faction 500026). Docking -0.05, Repair -0.05, Fitting -0.05, Reprocessing 3.0, Factory 3.0, Office Rental 3.0, Jump Clone 3.0. The semantics of a negative value are not documented.     | SDE (data only; meaning UNVERIFIED)                              |
| LP and ISK skills       | Distribution/Mining/Security Connections +10% LP per level in that division. Negotiation +5% ISK payout per level.                                                                                                                                                                     | EVEUni Skills:Social                                             |

"What does +5 get me?" For a normal NPC corp or faction at an effective 5.0: L4 agents. Reprocessing tax about 1.25% (assuming linear, UNVERIFIED). At unmodified 5.0 with both faction and corp, the broker fee drops by 5 * 0.03% + 5 * 0.02% = 0.25 percentage points (straight from the CCP formula).

## 5. How standing changes (short)

- **Raise:**
  - Completing missions raises agent and corp standing.
  - Faction standing rises only through storyline, career-agent, data-centre, COSMOS and courier-circle missions, and Epic Arcs. These carry derived standings, except Epic Arcs and the final career-agent mission since patch 23.02 (2026-02-25).
  - CCP-1: "The only way to increase a characters standing towards an agent or a corporation is to successfully complete missions for that agent/corp."
  - FW promotions and complex captures raise militia standings.
- **Lower:**
  - Failing a mission.
  - Declining missions. CCP-1 says "declining two missions from the same agent in a 4-hour period". EVEUni says "more than one mission every four hours". The two differ slightly.
  - Destroying ships or structures of a faction.
  - Fighting NPC mining operations (corp loss).
  - Podding a player in an NPC corp.
  - Completing a storyline mission for an enemy faction.
- **Derived standings.** Gaining faction standing also moves related factions, up or down. The change is capped by the standing those factions hold towards each other.
- **Percentage maths.** A gain moves you a percentage of the distance to +10. A loss moves you a percentage of the distance to -10. High standings gain slowly and lose quickly.
- **Rat-kill standing ticks** are 10 minutes, tracked per system (EVEUni).
- **What the window shows.** Per the CCP-3 dev blog on the standings UI:
  - A bar from -10 to +10.
  - A list of every NPC faction, corporation and agent you have met.
  - A history of changes per entity (Neocom, Character Sheet, Interactions, Standings, "Show Transactions").
  - The history shows only total changes, not the percentages (CCP-1).
- **Corporation standings.** A player corporation's standing towards NPCs is the average of its members' standings, ignoring members with "no standing" (EVEUni). Only FW enlistment uses it. Everything else uses personal standing.

## 6. Mission levels today

- **Level**: 1 to 5. It sets the mission difficulty, the standing needed, and the LP and ISK range. L5 is Security-division only, low-sec only. L1 is always available.
- **Division**: Security = combat/encounter missions. Distribution = courier. Mining = mining. R&D = a separate division (research agents: 2 mission types, a trade and a courier, and they give no LP). Division picks which `* Connections` LP skill applies.
- **Quality**: **gone since Incursion 1.5 (2011-05-19).** The patch notes say: "Agent Quality has been removed meaning that all Agents are now +20 in terms of payout and -20 in terms of access." The 20 divisions were cut to 3, and 7 old Connection skills were removed and refunded. The SDE agent record has no quality field (`agentTypeID`, `divisionID`, `isLocator`, `level`). Do not show quality in the UI.

## 7. UNVERIFIED / conflicting

1. **Base or effective in ESI standings.** The ESI spec only says "Return character standings from agents, NPC corporations, and factions", with no `description` on the field. A forum post says "The standings returned by ESI are raw" (a weak source: a forum post). EVEUni (via search snippets, not read first-hand) says EVE Skill Board uses ESI to read base standings. Treat ESI as returning BASE (unmodified) values until someone checks in-game. The check: compare ESI against the in-game standings tab for a character with Connections trained. CCP's own Broker Fee article also says tools should read "unmodified standings".
2. **Whether skills lift an agent's own personal standing.** EVEUni labels the agent thresholds "modified", and CCP-1 says skills apply to "all standing values from NPC entities". The EVEUni Agent page lists only corp and faction as modified. Probably yes, unconfirmed.
3. **Base exactly 0.0.** EVEUni says Connections applies to "positive or 0". CCP-1 and Skills:Social say "above 0.0". It matters only for entities you have touched whose standing is exactly 0.0. "No standing" (never interacted) gets no skill at all.
4. **Level 1 below -2.** CCP-1 text says "All level 1 agents (except storyline) should be available to every pilot", its table says -10, and the EVEUni R&D/COSMOS columns say -2.00 for L1. Treat normal L1 as always available. For R&D/COSMOS L1, EVEUni and CCP disagree.
5. **Reprocessing tax shape.** Only the endpoints are verified (5% at 0, 0% at 6.67). A linear fall `5% * (1 - s/6.67)` is my inference and is not stated by any source. EVEUni Reprocessing claims "Connections V cuts tax by 25%", which fits a linear fall only roughly (about 30% at 0). Whether the tax uses effective or base standing is also unclear: CCP-1 says "modified personal standing", EVEUni says higher of personal or corp.
6. **Docking.** I found **no** CCP source saying low standing blocks docking at an ordinary NPC station. Community posts say ordinary NPC stations dock regardless, apart from the FW enemy-militia restriction. One Japanese wiki claims -5.0 corp standing blocks docking. That is unconfirmed. The only SDE data is the Triglavian row noted above.
7. **LP store.** CCP-1 and EVEUni only say LP is spent at the issuing corporation's store. I found **no** standing requirement for LP store access or offers in any source, and the SDE has no LP offer files in this build (only `lpOfferTables` ids on `npcCorporations`). The claim that offers need standing is UNVERIFIED and probably false.
8. **Time decay.** No source documents passive decay. This is absence of evidence.
9. **Criminal factions beyond the five pirates.** CCP's definition is "factions CONCORD holds at negative standing". Whether Triglavian Collective, Drifters or Rogue Drones count is UNVERIFIED. EVEUni lists the five pirate factions only.
10. **Relist discount per level**: 5 points (CCP-3 item page, Advanced Broker Relations) versus 6 points (EVEUni Trading formula). Not a standing issue.
11. **Decline penalty**: "two missions in 4 hours" (CCP-1) versus "more than one every four hours" (EVEUni). Treat as the same rule, wording differs.
12. **NPC alliances.** Not stated anywhere in prose. The conclusion that they do not exist rests on the SDE/ESI structure (high confidence, but inferred).

## 8. Source URLs

- CCP Standings: https://support.eveonline.com/hc/en-us/articles/203217152-Standings
- CCP Broker Fee and Sales Tax: https://support.eveonline.com/hc/en-us/articles/203218962-Broker-Fee-and-Sales-Tax
- CCP Epic Arc: https://support.eveonline.com/hc/en-us/articles/360009908300-Epic-Arc
- CCP Factional Warfare: https://support.eveonline.com/hc/en-us/articles/203209072-Factional-Warfare
- CCP Loyalty Points: https://support.eveonline.com/hc/en-us/articles/14141831188636-Loyalty-Points
- Incursion 1.5 patch notes (quality removed): https://www.eveonline.com/news/view/patch-notes-for-incursion-1.5-1
- Standings UI dev blog: https://eveonline.com/article/upcoming-changes-to-standings-ui-scanning-and-the-beta-map
- ESI OpenAPI: https://esi.evetech.net/meta/openapi.json (path `/characters/{character_id}/standings`)
- ESI id ranges: https://docs.esi.evetech.net/docs/id_ranges.html
- SDE (JSONL): https://developers.eveonline.com/static-data/tranquility/latest.jsonl (build 3654997)
- EVEUni NPC standings: https://wiki.eveuniversity.org/NPC_standings
- EVEUni Agent: https://wiki.eveuniversity.org/Agent
- EVEUni Skills:Social: https://wiki.eveuniversity.org/Skills:Social
- EVEUni Trading: https://wiki.eveuniversity.org/Trading
- EVEUni Tax: https://wiki.eveuniversity.org/Tax
- EVEUni Reprocessing: https://wiki.eveuniversity.org/Reprocessing
- EVEUni Faction warfare: https://wiki.eveuniversity.org/Faction_warfare
- EVEUni Jump clones: https://wiki.eveuniversity.org/Jump_clones
