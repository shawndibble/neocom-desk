import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ReauthBanner } from '@/components/ui';
import { db } from '@/db';
import { PERMISSIONS, type EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginGrant } from './grantAction';
import { missingPermissions } from './missingPermissions';
import { useReauthSlot } from './reauthSlots';
import { useCharacterLacksEndpoints } from './useGrantedScopes';

interface GrantBannerProps {
  /** Whose grant the action extends — the Character whose data needs it. */
  characterId: number;
  /** The Character's name, when the caller already has it; read from the device otherwise. */
  characterName?: string;
  /** What the data needs; mapped to the Permission(s) the Grant asks for. */
  endpoints: readonly EsiEndpointId[];
  /** One short line on what is affected ("Skills", "Broker fees assume 0 standings"). */
  title?: string;
  variant?: 'primary' | 'ghost';
  soleAction?: boolean;
  /** The one-line form for a note beside saved data (`ReauthBanner`'s `compact`). */
  compact?: boolean;
}

/**
 * The Character's name and which Permissions its stored grant lacks for
 * `endpoints`; `undefined` until read. Only the scope list leaves the query,
 * never the token (ADR 0001).
 */
function useGrantGap(characterId: number, endpoints: readonly EsiEndpointId[]) {
  const endpointsKey = endpoints.join(',');
  return useLiveQuery(async () => {
    const [character, token] = await Promise.all([
      db.characters.get(characterId),
      db.tokens.get(characterId),
    ]);
    return {
      characterId,
      name: character?.name,
      missing: missingPermissions(endpoints, token?.scopes ?? []),
    };
    // Keyed by value: callers may rebuild the array every render.
  }, [characterId, endpointsKey]);
}

/**
 * The one re-login banner a page shows for a Character. It says who and what,
 * briefly: "Kestrel Vane: grant Wallet, Assets" when the stored grant lacks a
 * Permission (naming each), else "Kestrel Vane: log in again" (the grant was
 * refused or lapsed). Several on one page (Overview widgets, a page's panels)
 * collapse into the first: it speaks, and its one login asks for every
 * Permission the others needed (`reauthSlots`).
 */
export function GrantBanner({
  characterId,
  characterName,
  endpoints,
  title,
  variant,
  soleAction,
  compact,
}: GrantBannerProps) {
  const { t } = useTranslation();
  const slot = useReauthSlot(characterId, endpoints);
  const gap = useGrantGap(characterId, slot.primary ? slot.endpoints : endpoints);
  // Held back until read, so the wrong one of the two never flashes.
  if (!slot.primary || gap?.characterId !== characterId) return null;
  const character = characterName ?? gap.name ?? t('reauth.unknownCharacter');
  const permissions = gap.missing.map((group) => t(PERMISSIONS[group].labelKey)).join(', ');
  return (
    <ReauthBanner
      title={
        gap.missing.length > 0
          ? t('reauth.missingTitle', { character, permissions })
          : t('reauth.loginTitle', { character })
      }
      // A banner speaking for others too would put its own panel's context on theirs.
      {...(title && !slot.shared ? { hint: title } : {})}
      actionLabel={gap.missing.length > 0 ? t('reauth.grantAction') : t('reauth.loginAction')}
      onLogin={() => void beginGrant(characterId, slot.endpoints)}
      {...(variant ? { variant } : {})}
      {...(soleAction ? { soleAction } : {})}
      {...(compact ? { compact } : {})}
    />
  );
}

interface GrantNoteProps {
  endpoints: readonly EsiEndpointId[];
  /**
   * Whose stored grant decides it, and whom the Grant is for. The active
   * Character when omitted — safe either way, since the check and the Grant
   * always share the one id.
   */
  characterId?: number;
  characterName?: string;
  /** One short line on what is affected. */
  title?: string;
  className?: string;
  /** The one-line form (`ReauthBanner`'s `compact`). */
  compact?: boolean;
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
