/**
 * Lifecycle for a corp-owned read that is *opt-in per page* (issue #298).
 *
 * `useRouteSnapshot` is the wrong shape here for one reason: it loads on mount.
 * The corp side of Wallet and Industry is behind a switch most visits never
 * flip, and a corp endpoint is both rate-limited and role-gated — so nothing
 * may be fetched until the user actually asks for it. That is what `key ===
 * null` means below: no load, no spinner, no request.
 *
 * The key is also the identity of the load. It carries every input the load
 * closes over — the Character, the corporation, and anything else the caller
 * varies (the wallet division) — so a change resets the snapshot rather than
 * letting a previous corporation's or division's rows sit under a new label.
 * `load` itself is held in a latest-ref, exactly as `useRouteSnapshot` holds
 * its own: an inline arrow must not re-fire the effect every render.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { invalidateFreshness } from '@/esi/cache';

export interface CorpSnapshot<T> {
  /** The current key's result, or null while loading, failed, or disabled. */
  data: T | null;
  /** False while disabled (`key === null`) — there is nothing being waited on. */
  loading: boolean;
  /** Manual refreshes for the current key; 0 on its first load. */
  refreshCount: number;
  refresh: () => void;
}

interface Lifecycle {
  key: string | null;
  epoch: number;
  refreshCount: number;
}

export function useCorpSnapshot<T>(key: string | null, load: () => Promise<T>): CorpSnapshot<T> {
  const [lifecycle, setLifecycle] = useState<Lifecycle>({ key, epoch: 0, refreshCount: 0 });
  const [snapshot, setSnapshot] = useState<{ epoch: number; data: T | null } | null>(null);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  // Adjusting state during render, React's documented way to reset on a
  // changed input — the same idiom `useRouteSnapshot` uses for a character
  // switch. An effect would show one frame of the previous key's data.
  if (lifecycle.key !== key) {
    setLifecycle({ key, epoch: lifecycle.epoch + 1, refreshCount: 0 });
  }

  const { key: activeKey, epoch } = lifecycle;
  useEffect(() => {
    if (activeKey === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await loadRef.current();
        if (!cancelled) setSnapshot({ epoch, data });
      } catch {
        // Stamping the failure is what clears `loading`; the corp data modules
        // already swallow offline into a null result, so this is only reached
        // by something genuinely unexpected and the view's empty state is the
        // honest answer for it.
        if (!cancelled) setSnapshot({ epoch, data: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeKey, epoch]);

  const current = snapshot?.epoch === epoch ? snapshot : null;

  return {
    data: current?.data ?? null,
    loading: activeKey !== null && current === null,
    refreshCount: lifecycle.refreshCount,
    refresh: useCallback(() => {
      // Same contract as `useRouteSnapshot.refresh`: a manual refresh must
      // reach ESI rather than take a freshness-window hit from this page's own
      // last load.
      invalidateFreshness();
      setLifecycle((state) => ({
        ...state,
        epoch: state.epoch + 1,
        refreshCount: state.refreshCount + 1,
      }));
    }, []),
  };
}
