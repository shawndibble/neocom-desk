import { parseFittingSharePayload } from '@/engine/fittings/fittingSharePayload';
import type { StoredShare } from '@/features/share/shareStore';
import { FittingShareView } from '../FittingShared';

export function FittingSharedView({ share }: { share: StoredShare }) {
  return (
    <FittingShareView
      code={parseFittingSharePayload(share.payload)?.code ?? ''}
      expiresAt={share.expiresAt}
    />
  );
}
