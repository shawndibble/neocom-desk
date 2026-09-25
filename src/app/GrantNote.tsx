import { useTranslation } from 'react-i18next';
import { ReauthBanner } from '@/components/ui';
import type { EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginGrant } from './grantAction';
import { useCharacterLacksEndpoints } from './useGrantedScopes';

interface GrantCopy {
  /** Already translated; prefixed with `characterName` when one is given. */
  title: string;
  hint: string;
  actionLabel: string;
}

interface GrantBannerProps extends GrantCopy {
  /** Whose grant the action extends — the Character whose data needs it. */
  characterId: number;
  /** Names that Character in the title, where several banners can stack. */
  characterName?: string;
  /** What the data needs; mapped to the Permission(s) the Grant asks for. */
  endpoints: readonly EsiEndpointId[];
  variant?: 'primary' | 'ghost';
  soleAction?: boolean;
}

/**
 * A re-login banner the caller has already decided to show — typically on a
 * load that came back `needsReauth` — whose action grants `endpoints`'
 * Permission for `characterId` (`beginGrant`). The caller only says which
 * Character and which endpoints; the "{Character} — …" title and the
 * endpoints → Permission mapping live here.
 */
export function GrantBanner({
  characterId,
  characterName,
  endpoints,
  title,
  ...banner
}: GrantBannerProps) {
  const { t } = useTranslation();
  return (
    <ReauthBanner
      {...banner}
      title={characterName ? t('reauth.titleFor', { character: characterName, title }) : title}
      onLogin={() => void beginGrant(characterId, endpoints)}
    />
  );
}

interface GrantNoteProps extends GrantCopy {
  endpoints: readonly EsiEndpointId[];
  /**
   * Whose stored grant decides it, and whom the Grant is for. The active
   * Character when omitted — safe either way, since the check and the Grant
   * always share the one id.
   */
  characterId?: number;
  characterName?: string;
  className?: string;
}

/**
 * The inline "Grant note" for a figure that degrades to a documented
 * assumption when `characterId`'s stored grant lacks `endpoints` (issue
 * #1526): renders a `GrantBanner` only once that grant is known and missing,
 * so it never flashes on a cold load and disappears live once granted.
 * Callers only decide whether the figure is on screen at all.
 */
export function GrantNote({ characterId, className, ...banner }: GrantNoteProps) {
  const activeCharacterId = useActiveCharacter((state) =>
    state.hydrated ? state.activeCharacterId : null
  );
  const id = characterId ?? activeCharacterId;
  const lacks = useCharacterLacksEndpoints(id, banner.endpoints);
  if (id === null || !lacks) return null;
  return (
    <div className={className}>
      <GrantBanner variant="ghost" characterId={id} {...banner} />
    </div>
  );
}
