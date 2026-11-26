import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import type { EsiEndpointId } from '@/esi/registry';

const IMPLANTS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterImplants'];

interface ImplantsAssumedNoteProps {
  hint: string;
  characterId?: number;
}

export function ImplantsAssumedNote(props: ImplantsAssumedNoteProps) {
  const { t } = useTranslation();
  return (
    <GrantNote {...props} endpoints={IMPLANTS_ENDPOINTS} title={t('reauth.implantsAssumedTitle')} />
  );
}
