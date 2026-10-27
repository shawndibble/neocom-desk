import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import type { EsiEndpointId } from '@/esi/registry';

const IMPLANTS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterImplants'];

interface ImplantsAssumedNoteProps {
  /** Names the figure that was computed without implants, and what granting fixes. */
  hint: string;
  /** Whose grant decides it — the active Character when omitted. */
  characterId?: number;
}

/**
 * The inline "assumes no implants" note for a figure that silently fell back
 * to an empty implant set because its Character never granted Character
 * details (issues #1526, #1588). A `GrantNote` — the caller decides whether
 * the figure is on screen and implant-sensitive.
 */
export function ImplantsAssumedNote(props: ImplantsAssumedNoteProps) {
  const { t } = useTranslation();
  return (
    <GrantNote
      {...props}
      endpoints={IMPLANTS_ENDPOINTS}
      title={t('reauth.implantsAssumedTitle')}
      actionLabel={t('reauth.implantsAssumedAction')}
    />
  );
}
