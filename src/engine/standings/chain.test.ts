import { describe, it, expect } from 'vitest';
import { CRIMINAL_FACTION_IDS, isCriminalFaction, standingChain } from './chain';
import { NO_SOCIAL_SKILLS } from './effectiveStanding';

const SKILLS = { connections: 5, criminalConnections: 3, diplomacy: 2 };
const CALDARI = 500001;
const GURISTAS = 500010;

describe('CRIMINAL_FACTION_IDS', () => {
  it('is the five pirate factions (ids verified against live ESI /universe/factions)', () => {
    expect([...CRIMINAL_FACTION_IDS].sort()).toEqual([500010, 500011, 500012, 500019, 500020]);
  });
});

describe('isCriminalFaction', () => {
  it.each([
    [GURISTAS, true],
    [500011, true], // Angel Cartel
    [500012, true], // Blood Raider Covenant
    [500019, true], // Sansha's Nation
    [500020, true], // Serpentis
    [CALDARI, false],
    [500026, false], // Triglavian Collective: UNVERIFIED, not counted
    [null, false],
  ])('%s -> %s', (factionId, expected) => {
    expect(isCriminalFaction(factionId)).toBe(expected);
  });
});

describe('standingChain', () => {
  it('lifts each link by the skill that fits its sign, in the order given', () => {
    const chain = standingChain(
      [
        { kind: 'faction', id: CALDARI, base: 5 },
        { kind: 'corporation', id: 1000035, base: -3 },
        { kind: 'agent', id: 3009001, base: 0 },
      ],
      CALDARI,
      SKILLS
    );
    expect(chain.criminal).toBe(false);
    expect(chain.links.map((l) => [l.kind, l.id, l.base])).toEqual([
      ['faction', CALDARI, 5],
      ['corporation', 1000035, -3],
      ['agent', 3009001, 0],
    ]);
    expect(chain.links[0].effective).toBeCloseTo(6, 10); // Connections V
    expect(chain.links[1].effective).toBeCloseTo(-3 + 13 * 0.08, 10); // Diplomacy II
    expect(chain.links[2].effective).toBe(0);
  });

  it('marks the whole chain criminal when the faction is, and uses Criminal Connections', () => {
    const chain = standingChain([{ kind: 'corporation', id: 1000127, base: 5 }], GURISTAS, SKILLS);
    expect(chain.criminal).toBe(true);
    expect(chain.links[0].effective).toBeCloseTo(5 + 5 * 0.12, 10);
  });

  it('is lawful when the faction is unknown', () => {
    const chain = standingChain([{ kind: 'corporation', id: 1, base: 5 }], null, SKILLS);
    expect(chain.criminal).toBe(false);
    expect(chain.links[0].effective).toBeCloseTo(6, 10);
  });

  it('keeps base equal to effective without skills', () => {
    const chain = standingChain(
      [{ kind: 'faction', id: CALDARI, base: 2.5 }],
      CALDARI,
      NO_SOCIAL_SKILLS
    );
    expect(chain.links[0]).toMatchObject({ base: 2.5, effective: 2.5 });
  });

  it('has no links for no entities', () => {
    expect(standingChain([], null, SKILLS).links).toEqual([]);
  });
});
