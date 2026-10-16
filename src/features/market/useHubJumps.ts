/**
 * Jumps between a Hauling lane's two Trade Hubs, by the user's
 * route preference — what the trip rail's profit per jump divides by. Null
 * system ids (an Any hub end) give `none`: each row has its own lane then.
 *
 * Counted on the app's jump basis (`jumpBasis.ts`), so the number is the one
 * Route Safety draws; `loading` until that basis is read and the count lands.
 */
import { useEffect, useState } from 'react';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { jumpsBetween, useJumpBasis } from '@/features/route/jumpBasis';

export type HubJumps =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'known'; jumps: number; preference: RoutePreferenceKind }
  | { status: 'unknown' };

export function useHubJumps(fromSystemId: number | null, toSystemId: number | null): HubJumps {
  const basis = useJumpBasis();
  // Tagged with the basis and lane it counted, so a stale count never shows.
  const [counted, setCounted] = useState<{ key: string; jumps: HubJumps } | null>(null);
  const key = `${basis.key}|${fromSystemId}|${toSystemId}`;

  useEffect(() => {
    if (!basis.hydrated || fromSystemId === null || toSystemId === null) return;
    let cancelled = false;
    const { preference } = basis.rules;
    void jumpsBetween(fromSystemId, toSystemId, basis)
      .then((result): HubJumps =>
        result.kind === 'known'
          ? { status: 'known', jumps: result.jumps, preference }
          : { status: 'unknown' }
      )
      .catch((): HubJumps => ({ status: 'unknown' }))
      .then((jumps) => {
        if (!cancelled) setCounted({ key, jumps });
      });
    return () => {
      cancelled = true;
    };
  }, [basis, fromSystemId, toSystemId, key]);

  if (fromSystemId === null || toSystemId === null) return { status: 'none' };
  if (!basis.hydrated || counted?.key !== key) return { status: 'loading' };
  return counted.jumps;
}
