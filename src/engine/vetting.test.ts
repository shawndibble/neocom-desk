import { describe, expect, it } from 'vitest';
import {
  VETTING_CHECKS,
  assessVetting,
  type VettingCharacterInput,
  type VettingDealing,
  type VettingInput,
  type VettingParty,
} from './vetting';

const NOW = Date.parse('2026-11-12T16:00:00Z');
const HOSTILE_CORP = 98000001;
const HOME_CORP = 98000002;

const PARTIES: VettingParty[] = [
  { id: 9001, name: 'Corvin Hale', category: 'character', corporationId: HOSTILE_CORP },
  { id: 9002, name: 'Orrin Dask', category: 'character', corporationId: 98000077 },
  { id: 9003, name: 'Random Trader', category: 'character', corporationId: 98000078 },
  { id: HOSTILE_CORP, name: 'Black Kite Syndicate', category: 'corporation' },
];

function character(patch: Partial<VettingCharacterInput> = {}): VettingCharacterInput {
  return {
    characterId: 1,
    name: 'Tamsin Vell',
    corporationId: HOME_CORP,
    birthday: '2019-03-01T00:00:00Z',
    skillPoints: 84_000_000,
    history: [{ corporationId: HOME_CORP, startDate: '2024-01-01T00:00:00Z' }],
    dealings: [],
    skills: [],
    missing: [],
    ...patch,
  };
}

function input(
  characters: VettingCharacterInput[],
  patch: Partial<VettingInput> = {}
): VettingInput {
  return { now: NOW, characters, parties: PARTIES, watchlist: [HOSTILE_CORP], ...patch };
}

const donation = (
  partyId: number,
  amount: number,
  at = '2026-11-09T21:14:00Z'
): VettingDealing => ({
  source: 'wallet',
  at,
  partyId,
  what: 'player_donation',
  amount,
});

function flagOf(result: ReturnType<typeof assessVetting>, check: string) {
  return result.flags.find((flag) => flag.check === check);
}

describe('assessVetting', () => {
  it('reports every check, all clear, for a quiet character', () => {
    const result = assessVetting(input([character()]));
    expect(result.flags).toEqual([]);
    expect(result.checks.map((c) => c.check)).toEqual([...VETTING_CHECKS]);
    expect(result.checks.every((c) => c.state === 'clear')).toBe(true);
  });

  it('flags ISK with a watchlist corporation as critical, with totals and evidence', () => {
    const result = assessVetting(
      input([
        character({
          dealings: [
            donation(9001, 500_000_000),
            donation(9001, 400_000_000, '2026-11-02T19:40:00Z'),
            donation(9001, 300_000_000, '2026-10-24T22:03:00Z'),
            donation(9003, 5_000_000),
          ],
        }),
      ])
    );
    const flag = flagOf(result, 'watchlistIsk');
    expect(flag).toMatchObject({
      severity: 'critical',
      characterIds: [1],
      facts: { received: 1_200_000_000, sent: 0, rows: 3, partyId: 9001 },
      evidenceTotal: 3,
    });
    expect(flag?.evidence[0]).toMatchObject({ partyId: 9001, amount: 500_000_000, characterId: 1 });
    expect(result.checks.find((c) => c.check === 'watchlistIsk')?.state).toBe('flag');
  });

  it('keeps small watchlist ISK at warning', () => {
    const result = assessVetting(input([character({ dealings: [donation(9001, 2_000_000)] })]));
    expect(flagOf(result, 'watchlistIsk')?.severity).toBe('warning');
  });

  it('matches a watchlist entry by the party itself, its corporation or its alliance', () => {
    const parties: VettingParty[] = [
      {
        id: 9100,
        name: 'Ally Pilot',
        category: 'character',
        corporationId: 5,
        allianceId: 99000001,
      },
    ];
    const result = assessVetting(
      input([character({ dealings: [donation(9100, 1_000)] })], {
        parties,
        watchlist: [99000001],
      })
    );
    expect(flagOf(result, 'watchlistIsk')).toBeDefined();
  });

  it('flags contacts, mail and contracts with the watchlist separately', () => {
    const result = assessVetting(
      input([
        character({
          dealings: [
            { source: 'contact', at: null, partyId: HOSTILE_CORP, what: 'contact', standing: 10 },
            { source: 'mail', at: '2026-11-01T00:00:00Z', partyId: 9001, what: 'mail' },
            {
              source: 'contract',
              at: '2026-11-03T00:00:00Z',
              partyId: 9001,
              what: 'item_exchange',
            },
          ],
        }),
      ])
    );
    expect(flagOf(result, 'watchlistContacts')?.severity).toBe('warning');
    expect(flagOf(result, 'watchlistMail')?.evidenceTotal).toBe(1);
    expect(flagOf(result, 'watchlistContracts')?.evidenceTotal).toBe(1);
  });

  it('does not flag a watchlist contact set to a hostile standing', () => {
    const result = assessVetting(
      input([
        character({
          dealings: [
            { source: 'contact', at: null, partyId: HOSTILE_CORP, what: 'contact', standing: -10 },
          ],
        }),
      ])
    );
    expect(flagOf(result, 'watchlistContacts')).toBeUndefined();
  });

  it('flags time in a watchlist corporation: critical when recent, warning when old', () => {
    const recent = assessVetting(
      input([
        character({
          history: [
            { corporationId: HOME_CORP, startDate: '2026-09-01T00:00:00Z' },
            { corporationId: HOSTILE_CORP, startDate: '2026-01-01T00:00:00Z' },
          ],
        }),
      ])
    );
    expect(flagOf(recent, 'watchlistHistory')).toMatchObject({
      severity: 'critical',
      facts: { corporationId: HOSTILE_CORP },
    });
    const old = assessVetting(
      input([
        character({
          history: [
            { corporationId: HOME_CORP, startDate: '2022-01-01T00:00:00Z' },
            { corporationId: HOSTILE_CORP, startDate: '2020-01-01T00:00:00Z' },
          ],
        }),
      ])
    );
    expect(flagOf(old, 'watchlistHistory')?.severity).toBe('warning');
  });

  it('flags corp hopping on player corporations joined in the last year, ignoring NPC corps', () => {
    const history = [
      { corporationId: 98000010, startDate: '2026-10-01T00:00:00Z' },
      { corporationId: 1000125, startDate: '2026-09-20T00:00:00Z' },
      { corporationId: 98000011, startDate: '2026-07-01T00:00:00Z' },
      { corporationId: 1000125, startDate: '2026-06-20T00:00:00Z' },
      { corporationId: 98000012, startDate: '2026-04-01T00:00:00Z' },
      { corporationId: 98000013, startDate: '2026-01-10T00:00:00Z' },
      { corporationId: 1000125, startDate: '2019-03-01T00:00:00Z' },
    ];
    const result = assessVetting(input([character({ history })]));
    expect(flagOf(result, 'corpHopping')).toMatchObject({
      severity: 'warning',
      facts: { joined: 4 },
    });
    const calm = assessVetting(input([character({ history: history.slice(4) })]));
    expect(flagOf(calm, 'corpHopping')).toBeUndefined();
  });

  it('flags a repeat counterparty that was not declared, across characters', () => {
    const second = character({
      characterId: 2,
      name: 'Vell Hauling',
      dealings: [
        { source: 'contract', at: '2026-11-10T18:22:00Z', partyId: 9002, what: 'item_exchange' },
        donation(9002, -250_000_000),
      ],
    });
    const first = character({
      dealings: [donation(9002, 90_000_000), donation(9002, 10_000_000), donation(9002, 1)],
    });
    const result = assessVetting(input([first, second]));
    expect(flagOf(result, 'undeclaredCharacter')).toMatchObject({
      severity: 'warning',
      characterIds: [1, 2],
      facts: { partyId: 9002, rows: 5 },
    });
  });

  it('does not treat a declared character or market trades as undeclared', () => {
    const trades: VettingDealing[] = Array.from({ length: 8 }, () => ({
      source: 'wallet' as const,
      at: '2026-11-01T00:00:00Z',
      partyId: 9003,
      what: 'market_transaction',
      amount: 1,
    }));
    const own = Array.from({ length: 6 }, () => donation(2, 1_000));
    const result = assessVetting(
      input([character({ dealings: [...trades, ...own] }), character({ characterId: 2 })])
    );
    expect(flagOf(result, 'undeclaredCharacter')).toBeUndefined();
  });

  it('flags cyno skills when no declared character flies a capital or black ops ship', () => {
    const cyno = character({ skills: [{ id: 21603, level: 5 }] });
    expect(flagOf(assessVetting(input([cyno])), 'cynoNoCapital')).toMatchObject({
      characterIds: [1],
      facts: { level: 5 },
    });
    const withCapital = character({ characterId: 2, skills: [{ id: 24311, level: 1 }] });
    expect(flagOf(assessVetting(input([cyno, withCapital])), 'cynoNoCapital')).toBeUndefined();
  });

  it('flags an old character with very few skill points', () => {
    const result = assessVetting(
      input([character({ birthday: '2018-01-01T00:00:00Z', skillPoints: 2_000_000 })])
    );
    expect(flagOf(result, 'thinCharacter')).toMatchObject({ characterIds: [1] });
  });

  it('marks a check missing when a character did not share its source, and still flags the rest', () => {
    const result = assessVetting(
      input([
        character({ missing: ['mail', 'skills'], skillPoints: null }),
        character({
          characterId: 2,
          dealings: [{ source: 'mail', at: null, partyId: 9001, what: 'mail' }],
        }),
      ])
    );
    const mail = result.checks.find((c) => c.check === 'watchlistMail');
    expect(mail).toMatchObject({ state: 'flag', missingFor: [1] });
    const cyno = result.checks.find((c) => c.check === 'cynoNoCapital');
    expect(cyno).toMatchObject({ state: 'missing', missingFor: [1] });
    expect(result.checks.find((c) => c.check === 'thinCharacter')?.state).toBe('missing');
  });

  it('caps evidence rows and keeps the true total, newest first', () => {
    const dealings = Array.from({ length: 30 }, (_, i) =>
      donation(9001, 1_000, `2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`)
    );
    const flag = flagOf(assessVetting(input([character({ dealings })])), 'watchlistIsk');
    expect(flag?.evidence).toHaveLength(10);
    expect(flag?.evidenceTotal).toBe(30);
    expect(flag?.evidence[0]?.at).toBe('2026-10-30T00:00:00Z');
  });

  it('orders flags critical first', () => {
    const result = assessVetting(
      input([
        character({
          skills: [{ id: 21603, level: 1 }],
          dealings: [donation(9001, 900_000_000)],
        }),
      ])
    );
    expect(result.flags.map((flag) => flag.severity)).toEqual(['critical', 'warning']);
  });
});
