import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The state behind a My sharing tab: what the Community and this device hold
 * now (`loaded`), and changes to it that run one after another.
 *
 * - Only the newest load may write: one for another Community, or one a
 *   failed change asked for later, never gets overwritten by an older answer.
 * - `run` starts each change from the state the one before left. A failure
 *   shows `failedKey` as the notice and reloads the truth instead of guessing
 *   how to undo.
 */
export function useSerialShareState<Loaded>(fetchAll: () => Promise<Loaded>, failedKey: string) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const latest = useRef<Loaded | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const loads = useRef(0);

  const apply = useCallback((next: Loaded) => {
    latest.current = next;
    setLoaded(next);
  }, []);

  const settle = useCallback(
    (mine: number, next: Loaded | null) => {
      if (mine !== loads.current) return;
      if (next !== null) apply(next);
      setLoadFailed(next === null);
    },
    [apply]
  );

  useEffect(() => {
    const mine = ++loads.current;
    fetchAll().then(
      (next) => settle(mine, next),
      () => settle(mine, null)
    );
  }, [fetchAll, settle]);

  const reload = useCallback(async () => {
    const mine = ++loads.current;
    settle(mine, await fetchAll().catch(() => null));
  }, [fetchAll, settle]);

  const run = useCallback(
    (change: (current: Loaded) => Promise<Loaded>): Promise<void> => {
      setNotice(null);
      queue.current = queue.current.then(async () => {
        const current = latest.current;
        if (current === null) return;
        try {
          apply(await change(current));
        } catch {
          setNotice(t(failedKey));
          await reload();
        }
      });
      return queue.current;
    },
    [apply, reload, t, failedKey]
  );

  return { loaded, loadFailed, notice, setNotice, run, reload };
}
