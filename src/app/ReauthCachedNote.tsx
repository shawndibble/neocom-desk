import { useTranslation } from 'react-i18next';
import type { EsiEndpointId } from '@/esi/registry';
import { GrantBanner } from './GrantNote';

interface ReauthCachedNoteProps {
  characterId: number;
  endpoints: readonly EsiEndpointId[];
  className?: string;
}

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
      />
    </div>
  );
}
