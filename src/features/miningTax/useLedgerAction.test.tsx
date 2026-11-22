import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import i18n from '@/i18n';
import type { LedgerActionResult } from './ledgerActions';
import { useLedgerAction } from './useLedgerAction';

const ok: LedgerActionResult = { ok: true, value: undefined };
const stale: LedgerActionResult = { ok: false, reason: 'already-assigned', cause: null };
const failed: LedgerActionResult = { ok: false, reason: 'save-failed', cause: new Error('x') };

describe('useLedgerAction', () => {
  it('calls onDone on success, with no error showing', async () => {
    const { result } = renderHook(() => useLedgerAction());
    const onDone = vi.fn();
    await act(() => result.current.run(async () => ok, onDone));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });

  it('treats a stale view like done — the reload shows what exists', async () => {
    const { result } = renderHook(() => useLedgerAction());
    const onDone = vi.fn();
    await act(() => result.current.run(async () => stale, onDone));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });

  it('shows the save-failed message and stays put on any other failure, clearing it on the next try', async () => {
    const { result } = renderHook(() => useLedgerAction());
    const onDone = vi.fn();
    await act(() => result.current.run(async () => failed, onDone));
    expect(onDone).not.toHaveBeenCalled();
    expect(result.current.error).toBe(i18n.t('miningTax.saveFailed'));

    await act(() => result.current.run(async () => ok, onDone));
    expect(result.current.error).toBeNull();
  });

  it('is pending while the action runs', async () => {
    const { result } = renderHook(() => useLedgerAction());
    let finish!: (r: LedgerActionResult) => void;
    let running!: Promise<unknown>;
    act(() => {
      running = result.current.run(
        () => new Promise<LedgerActionResult>((resolve) => (finish = resolve))
      );
    });
    expect(result.current.pending).toBe(true);
    await act(async () => {
      finish(ok);
      await running;
    });
    expect(result.current.pending).toBe(false);
  });
});
