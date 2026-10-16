import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';
import type { HaulingScanTarget } from './haulingScanRun';

const scanHaulingLane = vi.fn();
vi.mock('./haulingScanRun', () => ({
  scanHaulingLane: (...a: unknown[]) => scanHaulingLane(...a),
}));

const { useHaulingScan } = await import('./useHaulingScan');

const FROM = TRADE_HUBS.find((h) => h.id === 'amarr')!;
const TO = TRADE_HUBS.find((h) => h.id === 'jita')!;

beforeEach(() => {
  scanHaulingLane.mockReset();
  scanHaulingLane.mockResolvedValue({ rows: [], scanned: 0, examinedTypeIds: [], fetchedAt: 0 });
});

describe('useHaulingScan', () => {
  it('scans with Max price, and scans again when it changes', async () => {
    const { rerender } = renderHook(
      ({ max }: { max: number | null }) => useHaulingScan(FROM, TO, 11, 'list', true, max),
      { initialProps: { max: 500 as number | null } }
    );
    await waitFor(() => expect(scanHaulingLane).toHaveBeenCalledTimes(1));
    expect((scanHaulingLane.mock.calls[0]![0] as HaulingScanTarget).maxUnitPrice).toBe(500);

    rerender({ max: null });
    await waitFor(() => expect(scanHaulingLane).toHaveBeenCalledTimes(2));
    expect((scanHaulingLane.mock.calls[1]![0] as HaulingScanTarget).maxUnitPrice).toBeNull();
  });
});
