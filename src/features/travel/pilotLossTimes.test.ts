import { describe, expect, it } from 'vitest';
import type { KillmailDetail, PilotKillmail } from '@/lib/zkillboard';
import { lossTimesMs } from './pilotLossTimes';

const party = { characterId: null, corporationId: null, shipTypeId: null };

function entry(side: PilotKillmail['side'], time: string | null | 'none'): PilotKillmail {
  const detail: KillmailDetail | null =
    time === 'none'
      ? null
      : {
          time,
          systemId: null,
          victim: {} as KillmailDetail['victim'],
          victimParty: party,
          finalBlow: null,
        };
  return { killmailId: 1, hash: 'h', side, value: null, detail } as PilotKillmail;
}

describe('lossTimesMs', () => {
  it('reads the date of each loss and ignores kills', () => {
    const list = [
      entry('loss', '2026-10-05T00:00:00Z'),
      entry('kill', '2026-10-06T00:00:00Z'),
      entry('loss', '2026-09-01T12:00:00Z'),
    ];
    expect(lossTimesMs(list)).toEqual([
      Date.parse('2026-10-05T00:00:00Z'),
      Date.parse('2026-09-01T12:00:00Z'),
    ]);
  });

  it('leaves out a loss with no body, no time or an unreadable one', () => {
    expect(
      lossTimesMs([entry('loss', 'none'), entry('loss', null), entry('loss', 'not a date')])
    ).toEqual([]);
  });

  it('is empty for an empty list', () => {
    expect(lossTimesMs([])).toEqual([]);
  });
});
