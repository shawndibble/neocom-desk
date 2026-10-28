import { describe, it, expect } from 'vitest';
import { BASIC_AGENT_TYPE_ID, bakeAgents, bakeNpcCorporations } from './npcAgents.mjs';

const character = (key, name, corporationID, agent) => ({
  _key: key,
  name: { en: name, de: `${name} (de)` },
  corporationID,
  locationID: 60000000 + key,
  ...(agent ? { agent } : {}),
});
const basic = (level, divisionID, isLocator = false) => ({
  agentTypeID: BASIC_AGENT_TYPE_ID,
  level,
  divisionID,
  isLocator,
});

const DIVISIONS = [
  { _key: 22, internalName: 'Distribution' },
  { _key: 24, internalName: 'Security' },
  // No baked agent works here, so it is not shipped.
  { _key: 18, internalName: 'R&D' },
];

describe('bakeAgents', () => {
  const characters = [
    character(3000002, 'Bela Zuun', 1000003, basic(2, 24, true)),
    character(3000001, 'Antaken Kamola', 1000002, basic(1, 22)),
    character(3000003, 'Cana Rhion', 1000002, basic(4, 24)),
    // Not agents, or agents of a kind this version leaves out.
    character(3000004, 'A CEO', 1000002),
    character(3000005, 'A Research Agent', 1000002, { ...basic(3, 18), agentTypeID: 4 }),
    character(3000006, 'A Storyline Agent', 1000002, { ...basic(3, 24), agentTypeID: 7 }),
  ];

  it('keeps only basic agents, as compact rows ordered by corporation then id', () => {
    expect(bakeAgents(characters, DIVISIONS).agents).toEqual([
      [3000001, 'Antaken Kamola', 1, 22, 1000002, 63000001, 0],
      [3000003, 'Cana Rhion', 4, 24, 1000002, 63000003, 0],
      [3000002, 'Bela Zuun', 2, 24, 1000003, 63000002, 1],
    ]);
  });

  it('names the divisions the kept agents use, and no others', () => {
    expect(bakeAgents(characters, DIVISIONS).divisions).toEqual({
      22: 'Distribution',
      24: 'Security',
    });
  });

  it('skips a basic agent missing its name, level or station rather than writing NaN', () => {
    const broken = [
      { ...character(3000010, 'No Station', 1000002, basic(1, 22)), locationID: undefined },
      { ...character(3000011, '', 1000002, basic(1, 22)) },
      character(3000012, 'No Level', 1000002, { agentTypeID: 2, divisionID: 22 }),
    ];
    expect(bakeAgents(broken, DIVISIONS).agents).toEqual([]);
  });
});

describe('bakeNpcCorporations', () => {
  const corporations = [
    {
      _key: 1000035,
      name: { en: 'Caldari Navy' },
      tickerName: 'CN',
      factionID: 500001,
      stationID: 60003760,
      taxRate: 0.11,
    },
    { _key: 1000002, name: { en: 'CBD Corporation' }, tickerName: 'CBDC', factionID: 500001 },
    // Factionless, no headquarters, no tax.
    { _key: 1000130, name: { en: 'Sisters of EVE' }, tickerName: 'SOE', taxRate: 0 },
    { _key: 1000174, name: { en: 'Polaris Bug Hunters' }, tickerName: 'PBH', deleted: true },
  ];
  const factions = [
    { _key: 500002, name: { en: 'Minmatar Republic' } },
    { _key: 500001, name: { en: 'Caldari State' } },
  ];

  it('bakes each corporation with the optional fields only where it has them, by id', () => {
    expect(bakeNpcCorporations(corporations, factions).corporations).toEqual([
      { id: 1000002, name: 'CBD Corporation', ticker: 'CBDC', factionId: 500001 },
      {
        id: 1000035,
        name: 'Caldari Navy',
        ticker: 'CN',
        factionId: 500001,
        hqStationId: 60003760,
        taxRate: 0.11,
      },
      { id: 1000130, name: 'Sisters of EVE', ticker: 'SOE' },
    ]);
  });

  it('bakes the faction names by id', () => {
    expect(bakeNpcCorporations(corporations, factions).factions).toEqual([
      { id: 500001, name: 'Caldari State' },
      { id: 500002, name: 'Minmatar Republic' },
    ]);
  });
});
