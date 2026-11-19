import { describe, expect, it } from 'vitest';
import { parseKillInvolvements, type KillInvolvement } from '@/lib/zkillboard';
import { killInteractions } from './killSource';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}|${Object.values(opts).join(',')}` : key;
const OTHER = 500;
const ME = 1;
const ALT = 2;

const inv = (over: Partial<KillInvolvement>): KillInvolvement => ({
  killmailId: 77,
  timeMs: 1_700_000_000_000,
  value: 212_000_000,
  victimCharacterId: null,
  attackerCharacterIds: [],
  ...over,
});

describe('parseKillInvolvements', () => {
  it('reads victim, attackers, value and time; drops unreadable entries', () => {
    const rows = parseKillInvolvements([
      {
        killmail_id: 5,
        killmail_time: '2026-03-01T12:00:00Z',
        victim: { character_id: 9 },
        attackers: [{ character_id: 3 }, { corporation_id: 4 }],
        zkb: { totalValue: 10 },
      },
      { killmail_id: 6 },
      'junk',
    ]);
    expect(rows).toEqual([
      {
        killmailId: 5,
        timeMs: Date.parse('2026-03-01T12:00:00Z'),
        value: 10,
        victimCharacterId: 9,
        attackerCharacterIds: [3],
      },
    ]);
    expect(parseKillInvolvements({})).toEqual([]);
  });
});

describe('killInteractions', () => {
  it('they killed you: the other pilot attacked a viewer Character', () => {
    const [row] = killInteractions(
      { kills: [inv({ victimCharacterId: ALT, attackerCharacterIds: [OTHER] })], losses: [] },
      OTHER,
      [ME, ALT],
      t
    );
    expect(row).toMatchObject({
      id: 'kill-77',
      kind: 'kill',
      type: 'interactions.type.theyKilledYou',
      tone: 'danger',
      characterId: ALT,
      to: 'https://zkillboard.com/kill/77/',
      at: 1_700_000_000_000,
    });
    expect(row.isk).toBeUndefined();
    expect(row.detail).toContain('212');
  });

  it("you killed: a viewer Character was an attacker on the other pilot's loss", () => {
    const [row] = killInteractions(
      { kills: [], losses: [inv({ victimCharacterId: OTHER, attackerCharacterIds: [3, ME] })] },
      OTHER,
      [ME],
      t
    );
    expect(row).toMatchObject({
      type: 'interactions.type.youKilled',
      tone: 'success',
      characterId: ME,
    });
  });

  it('same side: both attacked a third party', () => {
    const [row] = killInteractions(
      { kills: [inv({ victimCharacterId: 8, attackerCharacterIds: [OTHER, ME] })], losses: [] },
      OTHER,
      [ME],
      t
    );
    expect(row).toMatchObject({ type: 'interactions.type.sameSide', tone: 'neutral' });
  });

  it('ignores killmails with no viewer Character and handles a missing value', () => {
    const rows = killInteractions(
      {
        kills: [
          inv({ killmailId: 1, victimCharacterId: 8, attackerCharacterIds: [OTHER] }),
          inv({ killmailId: 2, value: null, victimCharacterId: ME, attackerCharacterIds: [OTHER] }),
        ],
        losses: [],
      },
      OTHER,
      [ME],
      t
    );
    expect(rows.map((r) => r.id)).toEqual(['kill-2']);
  });
});
