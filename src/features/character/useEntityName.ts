/**
 * One entity's name (a faction, a corp, a pilot) through `resolveNames`, for a
 * component that needs a single name it was handed an id for. Null until it
 * resolves, and for an id that never does — the caller prints `#id` itself.
 */
import { useEffect, useState } from 'react';
import { resolveNames } from './names';

export function useEntityName(id: number | undefined): string | null {
  const [resolved, setResolved] = useState<{ id: number; name: string | null } | null>(null);
  useEffect(() => {
    if (id === undefined) return;
    let cancelled = false;
    void resolveNames([id])
      .then((names) => {
        if (!cancelled) setResolved({ id, name: names.get(id) ?? null });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);
  return resolved !== null && resolved.id === id ? resolved.name : null;
}
