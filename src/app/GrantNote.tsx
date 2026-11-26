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
  characterId: number;
  characterName?: string;
  endpoints: readonly EsiEndpointId[];
  title?: string;
  variant?: 'primary' | 'ghost';
  soleAction?: boolean;
  compact?: boolean;
  standalone?: boolean;
}

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
  }, [characterId, endpointsKey]);
}

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
  if (gap?.characterId !== characterId) return null;
  const character = characterName ?? gap.name ?? t('reauth.unknownCharacter');
  if (!slot.primary) {
    return <p className="text-xs text-text-dim">{t('reauth.coveredTitle', { character })}</p>;
  }
  const permissions = gap.missing.map((group) => t(PERMISSIONS[group].labelKey)).join(', ');
  const missing = gap.missing.length > 0;
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
  characterId?: number;
  characterName?: string;
  title?: string;
  className?: string;
  compact?: boolean;
}

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
