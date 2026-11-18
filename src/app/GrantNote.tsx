import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ReauthBanner } from '@/components/ui';
import { db } from '@/db';
import { PERMISSIONS, type EsiEndpointId } from '@/esi/registry';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { beginGrant } from './grantAction';
import { missingPermissions } from './missingPermissions';
import { useReauthSlot, type SlotView } from './reauthSlots';
import { useCharacterLacksEndpoints } from './useGrantedScopes';
import { loadGrantedScopes } from './grantedScopes';

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
  /**
   * A note on a figure that only assumes something, not data that cannot load:
   * it shows on its own and never joins, speaks for, or silences the page's
   * re-login banners (`reauthSlots`).
   */
  standalone?: boolean;
}

/**
 * The Character's name and which Permissions its stored grant lacks for
 * `endpoints`; `undefined` until read. Only the scope list leaves the query,
 * never the token (ADR 0001).
 */
function useGrantGap(characterId: number, endpoints: readonly EsiEndpointId[]) {
  const endpointsKey = endpoints.join(',');
  return useLiveQuery(async () => {
    const [character, scopes] = await Promise.all([
      db.characters.get(characterId),
      loadGrantedScopes(characterId),
    ]);
    return {
      characterId,
      name: character?.name,
      missing: missingPermissions(endpoints, [...scopes]),
    };
    // Keyed by value: callers may rebuild the array every render.
  }, [characterId, endpointsKey]);
}

/**
 * The one re-login banner a page shows for a Character. It says who and what,
 * briefly: "Kestrel Vane: grant Wallet, Assets" when the stored grant lacks a
 * Permission (naming each), else "Kestrel Vane: log in again" (the grant was
 * refused or lapsed). Several on one page (Overview widgets, a page's panels)
 * collapse into the weightiest: it speaks, and its one login asks for every
 * Permission the others needed (`reauthSlots`); the rest say in one line that
 * the page's prompt covers them.
 */
export function GrantBanner(props: GrantBannerProps) {
  return props.standalone ? (
    <GrantBannerView
      {...props}
      slot={{ primary: true, endpoints: props.endpoints, shared: false }}
    />
  ) : (
    <SlottedGrantBanner {...props} />
  );
}

function SlottedGrantBanner(props: GrantBannerProps) {
  const slot = useReauthSlot(props.characterId, props.compact ? 'note' : 'banner', props.endpoints);
  return <GrantBannerView {...props} slot={slot} />;
}

function GrantBannerView({
  characterId,
  characterName,
  endpoints,
  title,
  variant,
  soleAction,
  compact,
  slot,
}: GrantBannerProps & { slot: SlotView }) {
  const { t } = useTranslation();
  const gap = useGrantGap(characterId, slot.primary ? slot.endpoints : endpoints);
  // Held back until read, so the wrong one of the two never flashes.
  if (gap?.characterId !== characterId) return null;
  const character = characterName ?? gap.name ?? t('reauth.unknownCharacter');
  if (!slot.primary) {
    // Never an empty panel: one line saying the page's prompt covers it.
    return <p className="text-xs text-text-dim">{t('reauth.coveredTitle', { character })}</p>;
  }
  const permissions = gap.missing.map((group) => t(PERMISSIONS[group].labelKey)).join(', ');
  const missing = gap.missing.length > 0;
  // The panel's own context, unless this banner speaks for others too; else why, for a login.
  const hint = title && !slot.shared ? title : missing ? undefined : t('reauth.refusedHint');
  return (
    <ReauthBanner
      title={
        missing
          ? t('reauth.missingTitle', { character, permissions })
          : t('reauth.loginTitle', { character })
      }
      {...(hint ? { hint } : {})}
      actionLabel={missing ? t('reauth.grantAction') : t('reauth.loginAction')}
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
      <GrantBanner variant="ghost" characterId={id} standalone {...banner} />
    </div>
  );
}
