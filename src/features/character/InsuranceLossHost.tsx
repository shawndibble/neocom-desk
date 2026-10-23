/** Renders the insurance-payout loss modal for the Wallet journal; mounted once beside the table. */
import { lazy, Suspense } from 'react';
import { guarded } from '@/app/routeChunks';
import { useInsuranceLossModalStore } from '@/stores/insuranceLossModal';

const LazyInsuranceLossModal = lazy(() =>
  guarded(() => import('./InsuranceLossModal')).then((m) => ({ default: m.InsuranceLossModal }))
);

export function InsuranceLossHost() {
  const request = useInsuranceLossModalStore((state) => state.request);
  const close = useInsuranceLossModalStore((state) => state.close);
  if (request === null) return null;
  return (
    <Suspense fallback={null}>
      <LazyInsuranceLossModal
        key={`${request.characterId}-${request.payoutDate}`}
        payoutDate={request.payoutDate}
        characterId={request.characterId}
        onClose={close}
      />
    </Suspense>
  );
}
