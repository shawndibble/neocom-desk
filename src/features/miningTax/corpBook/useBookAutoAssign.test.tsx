import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { MoonMiningTaxRow } from '../snapshot';
import type { CorpBookView } from './corpBookView';
import { useBookAutoAssign } from './useBookAutoAssign';

const applyMock = vi.hoisted(() => ({ applyBookAutoAssign: vi.fn() }));
vi.mock('./bookAutoAssign', () => applyMock);

const CHAR = 7;
const CORP = 98000001;
const SYSTEM = 30001;
const today = new Date().toISOString().slice(0, 10);

const view = {
  books: [
    {
      corpName: 'Moon Corp',
      loaded: {
        corporationId: CORP,
        characterIds: [CHAR],
        memberCharacterIds: [CHAR],
        startDate: '2026-01-01',
        graceHours: 0.5,
        rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-01-01' }],
        miners: [],
        observed: [
          {
            characterId: CHAR,
            recordedCorporationId: CORP,
            structureId: 1,
            date: today,
            solarSystemId: SYSTEM,
            oreLines: [],
          },
        ],
        hubId: 'jita',
      },
    },
  ],
} as unknown as CorpBookView;

const row = (assigned: boolean): MoonMiningTaxRow => ({
  characterId: CHAR,
  characterName: 'Miner',
  entry: {
    characterId: CHAR,
    date: today,
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: 45490, quantity: 100 }],
  },
  assignments: assigned
    ? [
        {
          id: 'a1',
          characterId: CHAR,
          date: today,
          solarSystemId: SYSTEM,
          payeeId: 'someone',
          oreLines: [{ typeId: 45490, quantity: 100 }],
          taxPct: 5,
          estimatedValue: 1,
          taxOwed: 1,
          status: 'outstanding',
          updatedAt: 1,
        },
      ]
    : [],
  unassignedOreLines: assigned ? [] : [{ typeId: 45490, quantity: 100 }],
});

beforeEach(() => {
  vi.clearAllMocks();
  applyMock.applyBookAutoAssign.mockResolvedValue({ ready: true, created: [{ id: 'x' }] });
});

describe('useBookAutoAssign', () => {
  it('applies the auto-assign once and refreshes the ledger', async () => {
    const onAssigned = vi.fn();
    const rows = [row(false)];
    const { rerender } = renderHook(() => useBookAutoAssign(view, rows, [], onAssigned));
    await waitFor(() => expect(onAssigned).toHaveBeenCalledTimes(1));
    rerender();
    expect(applyMock.applyBookAutoAssign).toHaveBeenCalledTimes(1);
    expect(applyMock.applyBookAutoAssign.mock.calls[0]?.[1]).toEqual([rows[0]!.entry]);
  });

  it('does nothing when every entry is already assigned', () => {
    renderHook(() => useBookAutoAssign(view, [row(true)], [], vi.fn()));
    expect(applyMock.applyBookAutoAssign).not.toHaveBeenCalled();
  });

  it('waits for the books', () => {
    renderHook(() => useBookAutoAssign(null, [row(false)], [], vi.fn()));
    expect(applyMock.applyBookAutoAssign).not.toHaveBeenCalled();
  });
});
