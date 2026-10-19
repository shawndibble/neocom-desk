/**
 * The app-wide Place Info for `?info=place-<id>` (a region, station or
 * structure), mounted once in `App.tsx` like `ItemInfoModal`: any place name
 * can link to it (`PlaceLink`) without its page owning a host. The dialog's
 * chunk loads on first open.
 */
import { Suspense } from 'react';
import { lazyNamed } from '@/app/lazyNamed';
import { usePlaceInfoModalStore } from '@/stores/placeInfoModal';

const PlaceInfoDialog = lazyNamed(() => import('./PlaceInfoDialog'), 'PlaceInfoDialog');

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
