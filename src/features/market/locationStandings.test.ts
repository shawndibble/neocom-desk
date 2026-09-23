import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveLocationStandings } from './locationStandings';
import { lookupNpcStation } from '@/sde/npcStations';
import { loadStationOwner } from '@/features/character/stations';
import { loadPublicCorporationInfo } from '@/features/character/publicInfoData';
import type { CharacterStandingEntry } from '@/engine/market/standings';

vi.mock('@/sde/npcStations', () => ({ lookupNpcStation: vi.fn() }));
vi.mock('@/features/character/stations', () => ({ loadStationOwner: vi.fn() }));
vi.mock('@/features/character/publicInfoData', () => ({ loadPublicCorporationInfo: vi.fn() }));

const JITA_ID = 60003760;
const CALDARI_NAVY_ID = 1000035;
const CALDARI_STATE_FACTION_ID = 500001;

const STANDINGS: CharacterStandingEntry[] = [
  { from_id: CALDARI_NAVY_ID, from_type: 'npc_corp', standing: 5 },
  { from_id: CALDARI_STATE_FACTION_ID, from_type: 'faction', standing: 10 },
];

beforeEach(() => {
  vi.mocked(lookupNpcStation).mockReset();
  vi.mocked(loadStationOwner).mockReset();
  vi.mocked(loadPublicCorporationInfo).mockReset();
});

describe('resolveLocationStandings', () => {
  it('returns zero for a known player structure, without resolving an owner', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue(null);

    const result = await resolveLocationStandings(1_000_000_000_001, STANDINGS);

    expect(result).toEqual({ factionStanding: 0, corpStanding: 0 });
    expect(loadStationOwner).not.toHaveBeenCalled();
  });

  it('returns zero when the NPC-station snapshot itself could not be read', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue(undefined);

    const result = await resolveLocationStandings(JITA_ID, STANDINGS);

    expect(result).toEqual({ factionStanding: 0, corpStanding: 0 });
    expect(loadStationOwner).not.toHaveBeenCalled();
  });

  it('resolves faction and corp standing for an NPC station via its owner corporation', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue({ id: JITA_ID, name: 'Jita IV', systemId: 1 });
    vi.mocked(loadStationOwner).mockResolvedValue(CALDARI_NAVY_ID);
    vi.mocked(loadPublicCorporationInfo).mockResolvedValue({
      corporation_id: CALDARI_NAVY_ID,
      name: 'Caldari Navy',
      ticker: 'CN',
      ceo_id: 1,
      creator_id: 1,
      member_count: 1,
      tax_rate: 0,
      faction_id: CALDARI_STATE_FACTION_ID,
      ceoName: null,
    });

    const result = await resolveLocationStandings(JITA_ID, STANDINGS);

    expect(result).toEqual({ factionStanding: 10, corpStanding: 5 });
  });

  it('returns zero when the station owner cannot be resolved', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue({ id: JITA_ID, name: 'Jita IV', systemId: 1 });
    vi.mocked(loadStationOwner).mockResolvedValue(null);

    const result = await resolveLocationStandings(JITA_ID, STANDINGS);

    expect(result).toEqual({ factionStanding: 0, corpStanding: 0 });
    expect(loadPublicCorporationInfo).not.toHaveBeenCalled();
  });

  it('resolves corp standing alone when the owner has no faction', async () => {
    vi.mocked(lookupNpcStation).mockResolvedValue({ id: JITA_ID, name: 'Jita IV', systemId: 1 });
    vi.mocked(loadStationOwner).mockResolvedValue(CALDARI_NAVY_ID);
    vi.mocked(loadPublicCorporationInfo).mockResolvedValue({
      corporation_id: CALDARI_NAVY_ID,
      name: 'Caldari Navy',
      ticker: 'CN',
      ceo_id: 1,
      creator_id: 1,
      member_count: 1,
      tax_rate: 0,
      ceoName: null,
    });

    const result = await resolveLocationStandings(JITA_ID, STANDINGS);

    expect(result).toEqual({ factionStanding: 0, corpStanding: 5 });
  });
});
