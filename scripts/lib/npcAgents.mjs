import { factionNames } from './certifiedPlans.mjs';

export const BASIC_AGENT_TYPE_ID = 2;

const isId = (value) => Number.isInteger(value) && value > 0;

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
