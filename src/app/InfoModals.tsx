import { lazy, Suspense } from 'react';
import { EntityInfoRoute } from '@/features/entities';
import { ItemInfoModal } from '@/features/entities/ItemInfoModal';
import { PlaceInfoModal } from '@/features/entities/PlaceInfoModal';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import * as routeChunks from './routeChunks';

// Info modals load on first open (each renders nothing without a request), so
// their tabs, skill plan and price code stay out of the boot chunk.
const LazyPublicInfoModal = lazy(() =>
  routeChunks
    .guarded(() => import('@/components/PublicInfoModal'))
    .then((m) => ({
      default: m.PublicInfoModal,
    }))
);
const LazySkillDetailModal = lazy(() =>
  routeChunks
    .guarded(() => import('@/components/SkillDetailModal'))
    .then((m) => ({
      default: m.SkillDetailModal,
    }))
);

function PublicInfoModal() {
  const open = usePublicInfoModalStore((state) => state.request !== null);
  return open ? (
    <Suspense fallback={null}>
      <LazyPublicInfoModal />
    </Suspense>
  ) : null;
}

function SkillDetailModal() {
  const open = useSkillDetailModalStore((state) => state.request !== null);
  return open ? (
    <Suspense fallback={null}>
      <LazySkillDetailModal />
    </Suspense>
  ) : null;
}

/**
 * The info modals `App` mounts beside its routes, inside the router: the
 * `?info=` URL's entity route and the public, skill, item and place modals.
 */
export function InfoModals() {
  return (
    <>
      <EntityInfoRoute />
      <PublicInfoModal />
      <SkillDetailModal />
      <ItemInfoModal />
      <PlaceInfoModal />
    </>
  );
}
