import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useRef } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { Button, LiveStatus, NeedsConnection } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
import { scopesForGroup } from '@/esi/scopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useOnboardingBannerSlot } from '@/app/onboardingBannerSlot';
import { useStickyClearance } from '@/lib/useStickyClearance';
import { useCorpAccess } from './useCorpAccess';
import { corpRoleLabel } from './roles';
import {
  isGrantPromptDismissed,
  useGrantPromptDismissals,
  withGrantPromptDismissed,
} from './grantPromptDismissal';

const CORP_GROUP_SCOPES = scopesForGroup('corp');

export function CorpGrantPrompt() {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const access = useCorpAccess();
  const dismissals = useGrantPromptDismissals((state) => state.value);
  const hydrated = useHydratedStore(useGrantPromptDismissals);
  const setDismissals = useGrantPromptDismissals((state) => state.setValue);
  const corporationName = usePublicInfo(
    (state) => (activeCharacterId === null ? null : state.byCharacterId[activeCharacterId]) ?? null
  )?.corporationName;

  const eligible =
    hydrated &&
    activeCharacterId !== null &&
    access.state === 'roles-without-grant' &&
    !isGrantPromptDismissed(dismissals, activeCharacterId, CORP_GROUP_SCOPES);
  const hasSlot = useOnboardingBannerSlot('corp-grant', eligible);
  const bannerRef = useRef<HTMLDivElement>(null);
  const shown = eligible && hasSlot;
  useStickyClearance(bannerRef, 'onboarding-banner', { enabled: shown });
  if (!shown) return null;
  if (activeCharacterId === null || access.state !== 'roles-without-grant') return null;

  const remember = () =>
    setDismissals(withGrantPromptDismissed(dismissals, activeCharacterId, CORP_GROUP_SCOPES));

  const grant = async () => {
    await remember();
    await beginEveLogin({ characterId: activeCharacterId, groups: ['corp'] });
  };

  return (
    <div
      ref={bannerRef}
      aria-label={t('corp.grantPromptTitle')}
      data-testid="onboarding-banner"
      className="motion-rise fixed inset-x-4 bottom-16 z-50 max-w-sm space-y-2 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:bottom-28 md:left-auto"
    >
      <LiveStatus>{t('corp.grantPromptTitle')}</LiveStatus>
      <p className={eyebrowClassName}>{t('corp.grantPromptTitle')}</p>
      <p>
        {t('corp.grantPromptBody', {
          roles: access.roles.map(corpRoleLabel).join(', '),
          corporation: corporationName ?? t('corp.grantPromptUnnamedCorporation'),
        })}
      </p>
      <p className="text-xs text-text-dim">{t('corp.grantPromptHint')}</p>
      <div className="flex gap-2">
        <NeedsConnection>
          <Button size="sm" variant="primary" onClick={() => void grant()}>
            {t('corp.grantPromptGrant')}
          </Button>
        </NeedsConnection>
        <Button size="sm" onClick={() => void remember()}>
          {t('corp.grantPromptDismiss')}
        </Button>
      </div>
    </div>
  );
}
