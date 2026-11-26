import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NeedsConnection } from '@/components/ui';
import type { CharacterRecord } from '@/db';
import { useCharacters } from '@/features/character/useCharacters';
import {
  useNotificationPromptState,
  useNotificationPermission,
  promptStateAfterAsk,
  shouldShowPermissionExplainer,
  shouldShowAlertsOffer,
  useAlertsOfferSeen,
  useGrantedHere,
} from './permission';
import { webPushSupport } from '@/sync/webPushSupport';
import { enableWebPush } from './webPush';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { beginAlertsLogin } from '@/app/loginFlow';
import { useAlertsNearby } from './alertsGrant';
import { DialogFooter } from '@/components/ui/DialogFooter';

export function NotificationExplainer() {
  const { t } = useTranslation();
  const { value, setValue } = useNotificationPromptState();
  const { permission, refresh } = useNotificationPermission();
  const characters = useCharacters();
  const characterCount = characters.length;
  const newestCharacter = useMemo(
    () =>
      characters.reduce<CharacterRecord | undefined>(
        (newest, c) => (newest === undefined || c.addedAt > newest.addedAt ? c : newest),
        undefined
      ),
    [characters]
  );
  const { value: alertsOfferSeen, setValue: setAlertsOfferSeen } = useAlertsOfferSeen();
  const nearbySupported = useAlertsNearby().supported;
  const grantedHere = useGrantedHere((state) => state.granted);

  const hydrated = useHydratedStore(useNotificationPromptState);
  const offerHydrated = useHydratedStore(useAlertsOfferSeen);

  const installRequired = webPushSupport() === 'requires-install';

  const visible = shouldShowPermissionExplainer({
    hydrated,
    seen: value.seen,
    hasCharacter: characterCount > 0,
    permission,
    installRequired,
  });
  const offering = shouldShowAlertsOffer({
    hydrated: offerHydrated,
    alertsOfferSeen,
    grantedHere,
    permission,
    installRequired,
    characterId: newestCharacter?.characterId ?? null,
  });
  const shown = visible || offering;
  if (!shown) return null;

  const dismiss = () => void setValue({ seen: true, outcome: value.outcome });
  const enable = async () => {
    const { permission: outcome } = await enableWebPush();
    if (outcome === 'granted') {
      refresh();
      useGrantedHere.setState({ granted: true });
    }
    await setValue(promptStateAfterAsk(outcome));
  };
  const declineAlerts = () => void setAlertsOfferSeen(true);
  const acceptAlerts = async () => {
    const characterId = newestCharacter?.characterId;
    if (characterId === undefined) return;
    await setAlertsOfferSeen(true);
    void beginAlertsLogin(characterId).catch(() => setAlertsOfferSeen(false));
  };

  const copy = offering
    ? {
        title: t('notifications.alertsOffer.title'),
        body: t(
          nearbySupported
            ? 'notifications.alertsOffer.bodyNearby'
            : 'notifications.alertsOffer.body',
          {
            name: newestCharacter?.name,
          }
        ),
        dismiss: t('notifications.alertsOffer.dismiss'),
        enable: t('notifications.alertsOffer.enable'),
        onDismiss: declineAlerts,
        onEnable: acceptAlerts,
      }
    : {
        title: t('notifications.prompt.title'),
        body: t(
          installRequired ? 'notifications.prompt.installRequiredBody' : 'notifications.prompt.body'
        ),
        dismiss: t('notifications.prompt.dismiss'),
        enable: installRequired ? null : t('notifications.prompt.enable'),
        onDismiss: dismiss,
        onEnable: enable,
      };
  const enableButton = (
    <Button size="sm" variant="primary" onClick={() => void copy.onEnable()}>
      {copy.enable}
    </Button>
  );

  return (
    <div className="space-y-2 border-b border-line bg-panel-2 px-3.5 py-2.5">
      <p className="font-medium text-text">{copy.title}</p>
      <p className="text-xs text-text-dim">{copy.body}</p>
      <DialogFooter>
        <Button size="sm" onClick={copy.onDismiss}>
          {copy.dismiss}
        </Button>
        {copy.enable &&
          (offering ? <NeedsConnection>{enableButton}</NeedsConnection> : enableButton)}
      </DialogFooter>
    </div>
  );
}
