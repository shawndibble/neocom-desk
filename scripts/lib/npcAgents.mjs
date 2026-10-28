// Pure bake behind build-sde.mjs's `agents.json` and `npcCorporations.json`:
// the NPC agents a pilot can talk to, and the NPC corporations and factions
// they belong to. ESI has no agent list, no agent level, division or station,
// and omits `faction_id` (and the headquarters) for NPC corporations, so the
// Contacts standings view reads them from here.
//
// Both come from CCP's own JSONL export (`npcCharacters`, `npcCorporations`,
// `npcCorporationDivisions`, `factions`): `npcCharacters` carries the agent
// record and the English name on one row, so there is no join to get wrong
// (Fuzzwork's `agtAgents.csv` agrees on every field but has no names), and
// `npcCorporations` is the only source with the headquarters station.
// Takes already-parsed records (`parseJsonl`), so this is testable with small
// hand-made fixtures.

import { factionNames } from './certifiedPlans.mjs';

// agtAgentTypes: 2 BasicAgent, the ordinary level 1-5 mission agent. The
// storyline, faction warfare, epic arc, research, career, CONCORD, event,
// tutorial, Aura and heraldry agents have their own access rules and are left
// out of this first version.
export const BASIC_AGENT_TYPE_ID = 2;

const isId = (value) => Number.isInteger(value) && value > 0;

/**
 * `npcCharacters` + `npcCorporationDivisions` records -> `{ divisions, agents }`.
 *
 * `agents` are `[id, name, level, divisionId, corporationId, stationId,
 * isLocator]` rows (isLocator as 0 or 1), ordered by corporation then id: the
 * UI asks for a corporation's agents, and neighbouring rows share most of their
 * numbers, which gzip exploits. `divisions` maps divisionID to its name, for
 * the divisions the baked agents use.
 */
export function bakeAgents(npcCharacters, divisionRecords) {
  const agents = [];
  for (const character of npcCharacters) {
    const { agent } = character;
    if (agent?.agentTypeID !== BASIC_AGENT_TYPE_ID) continue;
    const name = character.name?.en;
    if (
      !isId(character._key) ||
      typeof name !== 'string' ||
      name === '' ||
      !Number.isInteger(agent.level) ||
      agent.level < 1 ||
      agent.level > 5 ||
      !isId(agent.divisionID) ||
      !isId(character.corporationID) ||
      !isId(character.locationID)
    ) {
      continue;
    }
    agents.push([
      character._key,
      name,
      agent.level,
      agent.divisionID,
      character.corporationID,
      character.locationID,
      agent.isLocator ? 1 : 0,
    ]);
  }
  agents.sort((a, b) => a[4] - b[4] || a[0] - b[0]);
  const used = new Set(agents.map((row) => row[3]));
  const divisions = {};
  for (const record of divisionRecords) {
    if (used.has(record._key) && typeof record.internalName === 'string') {
      divisions[record._key] = record.internalName;
    }
  }
  return { divisions, agents };
}

/**
 * `npcCorporations` + `factions` records -> `{ factions, corporations }`, both
 * ordered by id. A corporation keeps `factionId`, `hqStationId` and `taxRate`
 * only when it has one (a key is left off rather than written as null or 0, the
 * convention of the other baked snapshots); corporations CCP marks deleted are
 * left out.
 */
export function bakeNpcCorporations(corporationRecords, factionRecords) {
  const corporations = [];
  for (const record of corporationRecords) {
    const name = record.name?.en;
    if (
      record.deleted ||
      !isId(record._key) ||
      typeof name !== 'string' ||
      name === '' ||
      typeof record.tickerName !== 'string'
    ) {
      continue;
    }
    const corporation = { id: record._key, name, ticker: record.tickerName };
    if (isId(record.factionID)) corporation.factionId = record.factionID;
    if (isId(record.stationID)) corporation.hqStationId = record.stationID;
    if (typeof record.taxRate === 'number' && record.taxRate > 0) {
      corporation.taxRate = record.taxRate;
    }
    corporations.push(corporation);
  }
  corporations.sort((a, b) => a.id - b.id);
  const factions = [...factionNames(factionRecords)]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.id - b.id);
  return { factions, corporations };
}
