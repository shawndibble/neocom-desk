import { useCallback, useEffect, useRef, useState } from 'react';

export interface LazyRowCacheLoadOptions {
  sticky?: boolean;
}

export interface LazyRowCache<K, V> {
  byKey: ReadonlyMap<K, V>;
  loadingKeys: ReadonlySet<K>;
  failedKeys: ReadonlySet<K>;
  load: (key: K, fetchValue: () => Promise<V>, options?: LazyRowCacheLoadOptions) => Promise<void>;
  reset: (key: K) => void;
}

export function useLazyRowCache<K, V>(): LazyRowCache<K, V> {
  const [byKey, setByKey] = useState<ReadonlyMap<K, V>>(() => new Map());
  const [loadingKeys, setLoadingKeys] = useState<ReadonlySet<K>>(() => new Set());
  const [failedKeys, setFailedKeys] = useState<ReadonlySet<K>>(() => new Set());

  const attemptedRef = useRef<Set<K>>(new Set());

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    (key: K, fetchValue: () => Promise<V>, options?: LazyRowCacheLoadOptions): Promise<void> => {
      const sticky = options?.sticky ?? false;
      if (attemptedRef.current.has(key)) return Promise.resolve();
      attemptedRef.current.add(key);
      setLoadingKeys((prev) => new Set(prev).add(key));
      setFailedKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return fetchValue()
        .then((value) => {
          if (!mountedRef.current) return;
          setByKey((prev) => new Map(prev).set(key, value));
        })
        .catch(() => {
          if (!sticky) attemptedRef.current.delete(key);
          if (mountedRef.current) setFailedKeys((prev) => new Set(prev).add(key));
        })
        .finally(() => {
          if (!mountedRef.current) return;
          setLoadingKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        });
    },
    []
  );

  const reset = useCallback((key: K) => {
    attemptedRef.current.delete(key);
    setFailedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  return { byKey, loadingKeys, failedKeys, load, reset };
}
