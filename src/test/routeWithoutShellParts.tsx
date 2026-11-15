import { lazy, Suspense, useEffect } from 'react';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { subscribeToEsiAuthFailures } from '@/stores/authFailure';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useNumberFormat } from '@/lib/numberFormat';
import { useTimeFormat } from '@/lib/timeFormat';

// The pieces of App.tsx that `renderRouteWithoutShell` (routeWithoutShell.tsx)
// mounts beside a route. A file of its own so each file exports only components
// or only helpers (react-refresh).

const LazyPublicInfoModal = lazy(() =>
  import('@/components/PublicInfoModal').then((m) => ({ default: m.PublicInfoModal }))
);

export function PublicInfoModal() {
  const open = usePublicInfoModalStore((state) => state.request !== null);
  return open ? (
    <Suspense fallback={null}>
      <LazyPublicInfoModal />
    </Suspense>
  ) : null;
}

/** The slice of App's `AppEffects` a page reads: the active Character and the format stores. */
export function RouteEffects() {
  const hydrate = useActiveCharacter((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  useEffect(() => subscribeToEsiAuthFailures(), []);
  useHydratedStore(useTimeFormat);
  useHydratedStore(useNumberFormat);
  return null;
}
