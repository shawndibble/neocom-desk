import { parseFittingSharePayload } from '@/engine/fittings/fittingSharePayload';
import type { StoredShare } from '@/features/share/shareStore';
import { FittingShareView } from '../FittingShared';

/**
 * A stored fitting share. Signed in, this redirects straight into the editor
 * on the code; a malformed payload reads as an empty code, and so an invalid
 * link. Its own chunk (`SharedLink` loads it on demand): the view carries the
 * dogma engine.
 */
export function FittingSharedView({ share }: { share: StoredShare }) {
  return (
    <FittingShareView
      code={parseFittingSharePayload(share.payload)?.code ?? ''}
      expiresAt={share.expiresAt}
    />
  );
}
