import { useCallback } from 'react';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { jumpsBetween, useJumpBasis } from '@/features/route/jumpBasis';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export type HubJumps =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'known'; jumps: number; preference: RoutePreferenceKind }
  | { status: 'unknown' };

export function useHubJumps(fromSystemId: number | null, toSystemId: number | null): HubJumps {
  const basis = useJumpBasis();
  const key = `${basis.key}|${fromSystemId}|${toSystemId}`;
  const { preference } = basis.rules;
  const count = useCallback(
    () =>
      jumpsBetween(fromSystemId ?? 0, toSystemId ?? 0, basis)
        .then((result): HubJumps =>
          result.kind === 'known'
            ? { status: 'known', jumps: result.jumps, preference }
            : { status: 'unknown' }
        )
        .catch((): HubJumps => ({ status: 'unknown' })),
    [basis, fromSystemId, toSystemId, preference]
  );
  const counted = useKeyedLoad(
    fromSystemId === null || toSystemId === null ? null : key,
    count,
    !basis.hydrated
  );

  if (fromSystemId === null || toSystemId === null) return { status: 'none' };
  return counted.data ?? { status: 'loading' };
}
