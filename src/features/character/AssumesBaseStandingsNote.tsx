import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import type { EsiEndpointId } from '@/esi/registry';

const STANDINGS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterStandings'];

interface AssumesBaseStandingsNoteProps {
  hint: string;
  characterId?: number;
  characterName?: string;
  className?: string;
}

export function AssumesBaseStandingsNote(props: AssumesBaseStandingsNoteProps) {
  const { t } = useTranslation();
  return (
    <GrantNote
      {...props}
      endpoints={STANDINGS_ENDPOINTS}
      title={t('reauth.standingsAssumedTitle')}
    />
  );
}
