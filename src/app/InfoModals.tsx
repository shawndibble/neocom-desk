import { lazy, Suspense } from 'react';
import { EntityInfoRoute } from '@/features/entities';
import { ItemInfoModal } from '@/features/entities/ItemInfoModal';
import { PlaceInfoModal } from '@/features/entities/PlaceInfoModal';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import * as routeChunks from './routeChunks';

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
