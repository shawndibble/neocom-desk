import { describe, expect, it } from 'vitest';
import type { CharacterStandingEntry } from '@/engine/market/standings';
import { NO_SOCIAL_SKILLS } from '@/engine/standings';
import { buildChain } from './buildChain';

const CALDARI = 500001;
const GURISTAS = 500010;
const CALDARI_NAVY = 1000035;
const GURISTAS_CORP = 1000127;
const AGENT = 3009001;

const STANDINGS: CharacterStandingEntry[] = [
  { from_id: CALDARI, from_type: 'faction', standing: 2 },
  { from_id: CALDARI_NAVY, from_type: 'npc_corp', standing: 5 },
  { from_id: AGENT, from_type: 'agent', standing: -1 },
  { from_id: GURISTAS, from_type: 'faction', standing: 5 },
];
const FACTIONS = new Map([
  [CALDARI_NAVY, CALDARI],
  [GURISTAS_CORP, GURISTAS],
]);
const SKILLS = { connections: 5, criminalConnections: 0, diplomacy: 0 };

describe('buildChain', () => {
  it('for a faction: that faction alone', () => {
    const chain = buildChain({ kind: 'faction', id: CALDARI }, STANDINGS, FACTIONS, SKILLS);
    expect(chain.links.map((l) => [l.kind, l.id, l.base])).toEqual([['faction', CALDARI, 2]]);
    expect(chain.links[0].effective).toBeCloseTo(3.6, 10);
  });

  it('for a corporation: its faction, then it', () => {
    const chain = buildChain(
      { kind: 'corporation', id: CALDARI_NAVY },
      STANDINGS,
      FACTIONS,
      NO_SOCIAL_SKILLS
    );
    expect(chain.links.map((l) => [l.kind, l.id, l.base])).toEqual([
      ['faction', CALDARI, 2],
      ['corporation', CALDARI_NAVY, 5],
    ]);
  });

  it('for an agent: faction, the corporation it was given, then the agent', () => {
    const chain = buildChain(
      { kind: 'agent', id: AGENT, corporationId: CALDARI_NAVY },
      STANDINGS,
      FACTIONS,
      NO_SOCIAL_SKILLS
    );
    expect(chain.links.map((l) => [l.kind, l.id, l.base])).toEqual([
      ['faction', CALDARI, 2],
      ['corporation', CALDARI_NAVY, 5],
      ['agent', AGENT, -1],
    ]);
  });

  it('reads a standing the pilot has no row for as 0, not as a missing link', () => {
    const chain = buildChain(
      { kind: 'agent', id: 999, corporationId: CALDARI_NAVY },
      [],
      FACTIONS,
      SKILLS
    );
    expect(chain.links.map((l) => l.base)).toEqual([0, 0, 0]);
    expect(chain.links.map((l) => l.effective)).toEqual([0, 0, 0]);
  });

  it('leaves the faction link out when the corporation has no known faction', () => {
    const chain = buildChain({ kind: 'corporation', id: 1000130 }, STANDINGS, FACTIONS, SKILLS);
    expect(chain.links.map((l) => l.kind)).toEqual(['corporation']);
    expect(chain.criminal).toBe(false);
  });

  it('is criminal, and uses Criminal Connections, under a pirate faction', () => {
    const chain = buildChain({ kind: 'corporation', id: GURISTAS_CORP }, STANDINGS, FACTIONS, {
      connections: 5,
      criminalConnections: 0,
      diplomacy: 0,
    });
    expect(chain.criminal).toBe(true);
    expect(chain.links[0]).toMatchObject({ kind: 'faction', base: 5, effective: 5 });
  });

  it('is criminal for the pirate faction itself', () => {
    expect(
      buildChain({ kind: 'faction', id: GURISTAS }, STANDINGS, FACTIONS, SKILLS).criminal
    ).toBe(true);
  });
});
