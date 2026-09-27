import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveLocationStandings } from './locationStandings';
import { lookupNpcStation } from '@/sde/npcStations';
import { loadPublicCorporationInfo } from '@/features/character/publicInfoData';
import type { CharacterStandingEntry } from '@/engine/market/standings';
import { TRADE_HUBS } from '@/market/hubs';

vi.mock('@/sde/npcStations', () => ({ lookupNpcStation: vi.fn() }));
vi.mock('@/features/character/publicInfoData', () => ({ loadPublicCorporationInfo: vi.fn() }));

const JITA_ID = 60003760;
/** Any NPC station that is not a Trade Hub, so it takes the snapshot path. */
const PERIMETER_STATION_ID = 60000004;
const CALDARI_NAVY_ID = 1000035;
const CALDARI_STATE_FACTION_ID = 500001;

const STANDINGS: CharacterStandingEntry[] = [
  { from_id: CALDARI_NAVY_ID, from_type: 'npc_corp', standing: 5 },
  { from_id: CALDARI_STATE_FACTION_ID, from_type: 'faction', standing: 10 },
];

beforeEach(() => {
  vi.mocked(lookupNpcStation).mockReset();
  vi.mocked(loadPublicCorporationInfo).mockReset();
});

describe('resolveLocationStandings', () => {
  it('returns zero for a known player structure, without a request', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue(null);

    const result = await resolveLocationStandings(1_000_000_000_001, STANDINGS);

    expect(result).toEqual({ factionStanding: 0, corpStanding: 0 });
  });

  it('returns zero when the NPC-station snapshot itself could not be read', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue(undefined);

    const result = await resolveLocationStandings(PERIMETER_STATION_ID, STANDINGS);

    expect(result).toEqual({ factionStanding: 0, corpStanding: 0 });
  });

  it('resolves a Trade Hub from its stored owner, with no request at all', async () => {
    const result = await resolveLocationStandings(JITA_ID, STANDINGS);

    expect(result).toEqual({ factionStanding: 10, corpStanding: 5 });
    expect(lookupNpcStation).not.toHaveBeenCalled();
    expect(loadPublicCorporationInfo).not.toHaveBeenCalled();
  });

  it('stores an owner corporation and faction for every Trade Hub', async () => {
    for (const hub of TRADE_HUBS) {
      const standings: CharacterStandingEntry[] = [
        { from_id: hub.ownerCorporationId, from_type: 'npc_corp', standing: 3 },
        { from_id: hub.ownerFactionId, from_type: 'faction', standing: 7 },
      ];
      expect(await resolveLocationStandings(hub.stationId, standings)).toEqual({
        factionStanding: 7,
        corpStanding: 3,
      });
    }
    expect(loadPublicCorporationInfo).not.toHaveBeenCalled();
  });

  it('resolves faction and corp standing for an NPC station from the snapshot, with no request', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue({
      id: PERIMETER_STATION_ID,
      name: 'Perimeter',
      systemId: 1,
      ownerCorporationId: CALDARI_NAVY_ID,
      ownerFactionId: CALDARI_STATE_FACTION_ID,
    });

    const result = await resolveLocationStandings(PERIMETER_STATION_ID, STANDINGS);

    expect(result).toEqual({ factionStanding: 10, corpStanding: 5 });
    expect(loadPublicCorporationInfo).not.toHaveBeenCalled();
  });

  it('returns zero when the snapshot predates owner fields', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue({
      id: PERIMETER_STATION_ID,
      name: 'Perimeter',
      systemId: 1,
    });

    const result = await resolveLocationStandings(PERIMETER_STATION_ID, STANDINGS);

    expect(result).toEqual({ factionStanding: 0, corpStanding: 0 });
    expect(loadPublicCorporationInfo).not.toHaveBeenCalled();
  });

  it('resolves corp standing alone when the owner has no faction', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue({
      id: PERIMETER_STATION_ID,
      name: 'Perimeter',
      systemId: 1,
      ownerCorporationId: CALDARI_NAVY_ID,
    });

    const result = await resolveLocationStandings(PERIMETER_STATION_ID, STANDINGS);

    expect(result).toEqual({ factionStanding: 0, corpStanding: 5 });
  });
});
