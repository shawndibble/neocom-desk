import { useTranslation } from 'react-i18next';
import { GrantNote } from '@/app/GrantNote';
import type { EsiEndpointId } from '@/esi/registry';

const STANDINGS_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterStandings'];

interface AssumesBaseStandingsNoteProps {
  /** Which figure is degraded, in the surface's own words. */
  hint: string;
  /** Whose standings price the figure; the active Character when omitted. */
  characterId?: number;
  /** Prefixed onto the title where several characters' notes can stack. */
  characterName?: string;
  className?: string;
}

/**
 * The inline "assumes base standings" note (issues #1526, #1589): a broker fee
 * priced without the Character details Permission silently falls back to 0
 * standing (`features/character/standings.ts`), so the figure says so and
 * offers the grant. A `GrantNote` — callers only decide whether a fee figure
 * is on screen at all.
 */
export function AssumesBaseStandingsNote(props: AssumesBaseStandingsNoteProps) {
  const { t } = useTranslation();
  return (
    <GrantNote
      {...props}
      endpoints={STANDINGS_ENDPOINTS}
      title={t('reauth.standingsAssumedTitle')}
      actionLabel={t('reauth.standingsAssumedAction')}
    />
  );
}
