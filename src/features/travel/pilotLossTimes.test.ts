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

  it('is null when any loss has no body, no time or an unreadable one: the losses cannot be told', () => {
    expect(lossTimesMs([entry('loss', 'none')])).toBeNull();
    expect(lossTimesMs([entry('loss', null)])).toBeNull();
    expect(lossTimesMs([entry('loss', 'not a date')])).toBeNull();
    expect(lossTimesMs([entry('loss', '2026-10-05T00:00:00Z'), entry('loss', 'none')])).toBeNull();
  });

  it('does not mind a kill with no body, which is not a loss', () => {
    expect(lossTimesMs([entry('kill', 'none'), entry('loss', '2026-10-05T00:00:00Z')])).toEqual([
      Date.parse('2026-10-05T00:00:00Z'),
    ]);
  });

  it('is empty for an empty list', () => {
    expect(lossTimesMs([])).toEqual([]);
  });
});
