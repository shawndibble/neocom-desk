import { describe, it, expect } from 'vitest';
import { resolveOwnerStandings, type CharacterStandingEntry } from './standings';

describe('resolveOwnerStandings', () => {
  it('returns 0/0 for a player structure (null owner corporation)', () => {
    const standings: CharacterStandingEntry[] = [
      { from_id: 1000003, from_type: 'npc_corp', standing: 8 },
    ];
    expect(resolveOwnerStandings(null, null, standings)).toEqual({
      factionStanding: 0,
      corpStanding: 0,
    });
  });

  it('resolves corp standing only when the owner has no faction', () => {
    const standings: CharacterStandingEntry[] = [
      { from_id: 1000003, from_type: 'npc_corp', standing: 6.5 },
    ];
    expect(resolveOwnerStandings(1000003, null, standings)).toEqual({
      factionStanding: 0,
      corpStanding: 6.5,
    });
  });

  it('resolves both faction and corp standing when both are known', () => {
    const standings: CharacterStandingEntry[] = [
      { from_id: 1000003, from_type: 'npc_corp', standing: 5 },
      { from_id: 500001, from_type: 'faction', standing: 10 },
    ];
    expect(resolveOwnerStandings(1000003, 500001, standings)).toEqual({
      factionStanding: 10,
      corpStanding: 5,
    });
  });

  it('resolves negative standings', () => {
    const standings: CharacterStandingEntry[] = [
      { from_id: 1000003, from_type: 'npc_corp', standing: -8 },
      { from_id: 500001, from_type: 'faction', standing: -10 },
    ];
    expect(resolveOwnerStandings(1000003, 500001, standings)).toEqual({
      factionStanding: -10,
      corpStanding: -8,
    });
  });

  it('defaults to 0 for an owner/faction id absent from the fetched standings', () => {
    expect(resolveOwnerStandings(1000003, 500001, [])).toEqual({
      factionStanding: 0,
      corpStanding: 0,
    });
  });

  it('matches by from_id alone, ignoring from_type, since EVE id ranges never overlap', () => {
    const standings: CharacterStandingEntry[] = [
      // Mismatched on purpose: an id that is really a corp id, tagged as
      // 'faction' here. If matching ever started filtering on from_type,
      // this would wrongly read as 0 instead of the real corp standing.
      { from_id: 1000003, from_type: 'faction', standing: 4 },
    ];
    expect(resolveOwnerStandings(1000003, null, standings)).toEqual({
      factionStanding: 0,
      corpStanding: 4,
    });
  });
});
