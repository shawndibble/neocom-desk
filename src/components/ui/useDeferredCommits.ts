import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** Most deferred commits held at once; the oldest commits when one more arrives. */
export const DEFERRED_COMMIT_CAP = 3;

export interface DeferredCommit {
  /** What the write targets; also the row to hide while it is pending. */
  id: string;
  /** What the Undo toast says. */
  message: string;
  /** The real write, run when the toast ends without Undo. */
  commit: () => void | Promise<void>;
}

/**
 * Deferred-commit Undo: the caller hides a row and raises a toast now, and the
 * real write runs only when the toast ends. `undo` cancels it. Anything still
 * pending commits at once when the page hides or leaves, so a delete is never
 * lost; a committing id stays in `hiddenIds` until its write settles, so the
 * row can't flash back between the toast and the write.
 */
export function useDeferredCommits() {
  const [items, setItems] = useState<readonly DeferredCommit[]>([]);
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set());
  const itemsRef = useRef(items);

  const run = useCallback(async (item: DeferredCommit) => {
    setSettling((prev) => new Set(prev).add(item.id));
    try {
      await item.commit();
    } catch {
      // A failed write leaves the row in place: it reappears when `settling` clears.
    } finally {
      setSettling((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, []);

  const commit = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      itemsRef.current = itemsRef.current.filter((i) => i.id !== id);
      setItems(itemsRef.current);
      void run(item);
    },
    [run]
  );

  const commitAll = useCallback(() => {
    const pending = itemsRef.current;
    itemsRef.current = [];
    setItems([]);
    for (const item of pending) void run(item);
  }, [run]);

  const defer = useCallback(
    (item: DeferredCommit) => {
      if (itemsRef.current.some((i) => i.id === item.id)) return;
      const next = [...itemsRef.current, item];
      const pushedOut = next.slice(0, Math.max(0, next.length - DEFERRED_COMMIT_CAP));
      itemsRef.current = next.slice(pushedOut.length);
      setItems(itemsRef.current);
      for (const old of pushedOut) void run(old);
    },
    [run]
  );

  const undo = useCallback((id: string) => {
    itemsRef.current = itemsRef.current.filter((i) => i.id !== id);
    setItems(itemsRef.current);
  }, []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') commitAll();
    };
    window.addEventListener('pagehide', commitAll);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', commitAll);
      document.removeEventListener('visibilitychange', onHide);
      commitAll();
    };
  }, [commitAll]);

  const hiddenIds = useMemo(
    () => new Set([...items.map((i) => i.id), ...settling]),
    [items, settling]
  );

  return { items, hiddenIds, defer, undo, commit };
}
