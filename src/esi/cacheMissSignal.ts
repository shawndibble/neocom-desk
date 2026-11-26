export type CacheMissReason = 'cold' | 'expired' | 'refresh';

export interface CacheMiss {
  family: string;
  reason: CacheMissReason;
  global: boolean;
}

type CacheMissListener = (miss: CacheMiss) => (() => void) | void;

const listeners = new Set<CacheMissListener>();

export function onCacheMiss(listener: CacheMissListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginCacheMiss(miss: CacheMiss): () => void {
  if (listeners.size === 0) return noop;
  const ends: (() => void)[] = [];
  for (const listener of listeners) {
    try {
      const end = listener(miss);
      if (end) ends.push(end);
    } catch {}
  }
  return () => {
    for (const end of ends) {
      try {
        end();
      } catch {}
    }
  };
}

function noop(): void {}
