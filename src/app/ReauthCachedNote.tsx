import { useTranslation } from 'react-i18next';
import type { EsiEndpointId } from '@/esi/registry';
import { GrantBanner } from './GrantNote';

interface ReauthCachedNoteProps {
  /** Whose grant lapsed; the Character the saved data belongs to. */
  characterId: number;
  /** What the data needs; mapped to the Permission(s) the re-login asks for. */
  endpoints: readonly EsiEndpointId[];
  className?: string;
}

/**
 * The small inline "sign in again" note for a view that has saved data *and* a
 * genuine lapsed grant (a revoked or expired one, `needsReauth`). The view
 * renders its data and this beside it; it never swaps the data for the full
 * `ReauthBanner`, which stays for the case with nothing saved to show. Offline
 * with an expired token is not this case: that is a network failure and reads
 * as cached data (`esi/cache.ts`).
 */
export function ReauthCachedNote({ characterId, endpoints, className }: ReauthCachedNoteProps) {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <GrantBanner
        compact
        variant="ghost"
        characterId={characterId}
        endpoints={endpoints}
        title={t('reauth.cachedTitle')}
        hint={t('reauth.cachedHint')}
        actionLabel={t('reauth.cachedAction')}
      />
    </div>
  );
}
