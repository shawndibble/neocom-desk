import { beforeEach, describe, expect, it, vi } from 'vitest';

const status = vi.hoisted(() => vi.fn());
vi.mock('./srpMemberBackend', () => ({ srpMemberBackend: () => ({ status }) }));

import {
  isPlayerCorporation,
  probeSrp,
  readSrpProbe,
  recordSrpProbe,
  SRP_PROBE_FAILURE_BACKOFF_MS,
  SRP_PROBE_TTL_MS,
  srpProbeBackingOff,
  subscribeSrpProbe,
} from './srpNavProbe';

const CORP = 98000001;
beforeEach(() => {
  localStorage.clear();
  status.mockReset();
});

describe('isPlayerCorporation', () => {
  it('is false for an NPC corporation, which can never run SRP', () => {
    expect(isPlayerCorporation(1000125)).toBe(false);
    expect(isPlayerCorporation(CORP)).toBe(true);
  });
});

describe('the cached answer', () => {
  it('is unknown before anything is recorded', () => {
    expect(readSrpProbe(7, CORP, 1000)).toBeNull();
  });
  it('is fresh within the TTL and stale (still readable) after it', () => {
    recordSrpProbe(7, CORP, true, 1000);
    expect(readSrpProbe(7, CORP, 1000 + SRP_PROBE_TTL_MS - 1)).toEqual({ on: true, fresh: true });
    expect(readSrpProbe(7, CORP, 1000 + SRP_PROBE_TTL_MS + 1)).toEqual({ on: true, fresh: false });
  });
  it('is per Character and corporation', () => {
    recordSrpProbe(7, CORP, true, 1000);
    expect(readSrpProbe(8, CORP, 1000)).toBeNull();
    expect(readSrpProbe(7, CORP + 1, 1000)).toBeNull();
  });
});

describe('probeSrp', () => {
  it('asks the server once for concurrent callers and records the answer', async () => {
    status.mockResolvedValue({ corporationId: CORP, enabled: true });
    const [a, b] = await Promise.all([probeSrp(7, CORP), probeSrp(7, CORP)]);
    expect([a, b]).toEqual([true, true]);
    expect(status).toHaveBeenCalledTimes(1);
    expect(readSrpProbe(7, CORP, Date.now())?.on).toBe(true);
  });
  it('keeps the last answer when the read fails, and says unknown when there was none', async () => {
    status.mockRejectedValue(new Error('offline'));
    expect(await probeSrp(7, CORP)).toBeNull();
    recordSrpProbe(7, CORP, true, 1);
    expect(await probeSrp(7, CORP)).toBe(true);
  });
});

describe('probe backoff', () => {
  it('skips the server for a while after a failure, then asks again', async () => {
    status.mockRejectedValue(new Error('offline'));
    await probeSrp(7, CORP);
    await probeSrp(7, CORP);
    await probeSrp(7, CORP);
    expect(status).toHaveBeenCalledTimes(1);
    expect(srpProbeBackingOff(7, CORP, Date.now())).toBe(true);
    expect(srpProbeBackingOff(7, CORP, Date.now() + SRP_PROBE_FAILURE_BACKOFF_MS + 1)).toBe(false);
  });
  it('is per Character and corporation, and a recorded answer clears it', async () => {
    status.mockRejectedValue(new Error('offline'));
    await probeSrp(7, CORP);
    expect(srpProbeBackingOff(8, CORP, Date.now())).toBe(false);
    recordSrpProbe(7, CORP, true);
    expect(srpProbeBackingOff(7, CORP, Date.now())).toBe(false);
  });
});

describe('subscribers', () => {
  it('hear a recorded answer', () => {
    const listener = vi.fn();
    const off = subscribeSrpProbe(listener);
    recordSrpProbe(7, CORP, false);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});
