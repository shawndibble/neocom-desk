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
