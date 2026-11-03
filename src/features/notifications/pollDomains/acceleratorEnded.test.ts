import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { HOUR_MS } from '@/lib/age';

const detect = vi.hoisted(() => vi.fn());
vi.mock('@/features/accelerator/useAccelerators', () => ({ readDetectedAccelerator: detect }));

import { acceleratorEndedDomain } from './acceleratorEnded';

const CHARACTER = 11;

beforeEach(async () => {
  await db.characterAccelerators.clear();
  detect.mockReset().mockResolvedValue({ bonus: null });
});

describe('acceleratorEndedDomain.load', () => {
  it('reads nothing when neither a typed nor a detected accelerator exists', async () => {
    expect(await acceleratorEndedDomain.load(CHARACTER)).toEqual([]);
  });

  it('reads a running typed accelerator, and drops one that has run out', async () => {
    const expiresAt = Date.now() + 5 * HOUR_MS;
    await db.characterAccelerators.put({
      id: String(CHARACTER),
      characterId: CHARACTER,
      bonus: 12,
      expiresAt,
      updatedAt: 1,
    });
    expect(await acceleratorEndedDomain.load(CHARACTER)).toEqual([
      { kind: 'typed', bonus: 12, expiresAtMs: expiresAt },
    ]);
    await db.characterAccelerators.update(String(CHARACTER), { expiresAt: Date.now() - 1 });
    expect(await acceleratorEndedDomain.load(CHARACTER)).toEqual([]);
  });

  it('adds the accelerator the cached attribute sheet implies, with no expiry', async () => {
    detect.mockResolvedValue({ bonus: 8 });
    expect(await acceleratorEndedDomain.load(CHARACTER)).toEqual([
      { kind: 'detected', bonus: 8, expiresAtMs: 0 },
    ]);
  });

  it('skips the tick when the sheet cannot be read, so the baseline is kept', async () => {
    detect.mockResolvedValue(null);
    expect(await acceleratorEndedDomain.load(CHARACTER)).toBeNull();
  });
});
