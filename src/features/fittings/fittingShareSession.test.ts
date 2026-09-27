import { describe, expect, it } from 'vitest';
import { resolveCoalesce, resolveShareCodeChange } from './fittingShareSession';
import type { Fitting } from '@/engine/fittings/types';

const FITTING = { name: 'Kite' } as Fitting;
const OTHER_FITTING = { name: 'Other' } as Fitting;

describe('resolveShareCodeChange', () => {
  it('a pasted link / Back-Forward (own write does not match the new code) resets everything', () => {
    const decision = resolveShareCodeChange({
      ownWrite: { code: 'old-code', fitting: null },
      pendingOpen: null,
      shareCode: 'new-code',
    });
    expect(decision).toEqual({ isDifferentFitting: true, resetSavedId: true, adopted: null });
  });

  it('no own write at all (first mount, or a pasted link) resets everything', () => {
    const decision = resolveShareCodeChange({
      ownWrite: null,
      pendingOpen: null,
      shareCode: 'new-code',
    });
    expect(decision).toEqual({ isDifferentFitting: true, resetSavedId: true, adopted: null });
  });

  it('opening a saved Fitting (pending matches the new code) keeps savedId', () => {
    const decision = resolveShareCodeChange({
      ownWrite: null,
      pendingOpen: { code: 'new-code', name: 'Saved One' },
      shareCode: 'new-code',
    });
    expect(decision).toEqual({ isDifferentFitting: true, resetSavedId: false, adopted: null });
  });

  it('an edit whose own write matches the code adopts the edited Fitting without decoding, keeping savedId', () => {
    const decision = resolveShareCodeChange({
      ownWrite: { code: 'new-code', fitting: FITTING },
      pendingOpen: null,
      shareCode: 'new-code',
    });
    expect(decision).toEqual({ isDifferentFitting: false, resetSavedId: false, adopted: FITTING });
  });

  it("an own write whose code matches but carries no fitting (a Load's own paste) decodes, keeping savedId, but still resets basisOverride", () => {
    const decision = resolveShareCodeChange({
      ownWrite: { code: 'new-code', fitting: null },
      pendingOpen: null,
      shareCode: 'new-code',
    });
    expect(decision).toEqual({ isDifferentFitting: false, resetSavedId: false, adopted: null });
  });

  it('adopts only the own write matching the CURRENT code, never a stale one', () => {
    const decision = resolveShareCodeChange({
      ownWrite: { code: 'old-code', fitting: OTHER_FITTING },
      pendingOpen: null,
      shareCode: 'new-code',
    });
    expect(decision.adopted).toBeNull();
  });
});

describe('resolveCoalesce', () => {
  const MS = 1000;

  it('no coalesceKey never coalesces, and clears the run', () => {
    const result = resolveCoalesce({ key: 'drones', at: 1000 }, undefined, 1000 + 1, MS);
    expect(result).toEqual({ coalesce: false, next: null });
  });

  it('no prior write never coalesces, but starts a run when a key is given', () => {
    const result = resolveCoalesce(null, 'drones', 1000, MS);
    expect(result).toEqual({ coalesce: false, next: { key: 'drones', at: 1000 } });
  });

  it('a different key never coalesces, and starts a new run under the new key', () => {
    const result = resolveCoalesce({ key: 'drones', at: 1000 }, 'implants', 1500, MS);
    expect(result).toEqual({ coalesce: false, next: { key: 'implants', at: 1500 } });
  });

  it('the same key within the window coalesces, and refreshes the run', () => {
    const result = resolveCoalesce({ key: 'drones', at: 1000 }, 'drones', 1500, MS);
    expect(result).toEqual({ coalesce: true, next: { key: 'drones', at: 1500 } });
  });

  it('the same key at exactly the window edge does not coalesce', () => {
    const result = resolveCoalesce({ key: 'drones', at: 1000 }, 'drones', 2000, MS);
    expect(result).toEqual({ coalesce: false, next: { key: 'drones', at: 2000 } });
  });

  it('the same key outside the window does not coalesce', () => {
    const result = resolveCoalesce({ key: 'drones', at: 1000 }, 'drones', 2001, MS);
    expect(result).toEqual({ coalesce: false, next: { key: 'drones', at: 2001 } });
  });
});
