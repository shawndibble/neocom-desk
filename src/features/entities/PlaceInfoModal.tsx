/**
 * The app-wide Place Info for `?info=place-<id>` (a region, station or
 * structure), mounted once in `App.tsx` like `ItemInfoModal`: any place name
 * can link to it (`PlaceLink`) without its page owning a host. The dialog's
 * chunk loads on first open.
 */
import { lazy, Suspense } from 'react';
import { guarded } from '@/app/routeChunks';
import { usePlaceInfoModalStore } from '@/stores/placeInfoModal';

const PlaceInfoDialog = lazy(() =>
  guarded(() => import('./PlaceInfoDialog')).then((module) => ({
    default: module.PlaceInfoDialog,
  }))
);

export function PlaceInfoModal() {
  const request = usePlaceInfoModalStore((state) => state.request);
  const close = usePlaceInfoModalStore((state) => state.close);
  if (!request) return null;
  return (
    <Suspense fallback={null}>
      <PlaceInfoDialog key={request.id} id={request.id} onClose={close} />
    </Suspense>
  );
}
