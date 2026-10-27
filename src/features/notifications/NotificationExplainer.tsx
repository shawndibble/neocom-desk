import { useMemo, useState } from 'react';
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
} from './permission';
import { webPushSupport } from '@/sync/webPushSupport';
import { enableWebPush } from './webPush';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { beginAlertsLogin } from '@/app/loginFlow';
import { useAlertsNearby } from './alertsGrant';

/**
 * The one-time notification explainer (issue #171), drawn at the top of the
 * alerts panel the first time the bell is opened. Opening the bell is the
 * moment the player shows they want alerts, so nothing interrupts them before
 * it: no bottom banner, and nothing on the first screen.
 *
 * Shown once ever per device (Install Prompt precedent, GLOSSARY.md round 20):
 * Enable makes the single real `Notification.requestPermission()` call, "Not
 * now" makes none at all, and either answer suppresses it permanently — a
 * denied grant can never be re-requested from JS anyway. Settings'
 * Device pop-ups checkbox asks too, and also ends this explainer.
 *
 * Step two (ADR 0020, issue #3758): when Enable ends in a grant, the same
 * block offers Alerts when closed for the Character just signed in. It is
 * never requested inside the permission step itself.
 */
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
  // True only after this banner's own Enable ended in a grant, so the offer
  // never reaches someone who saw the explainer on an earlier visit.
  const [grantedHere, setGrantedHere] = useState(false);

  const hydrated = useHydratedStore(useNotificationPromptState);
  const offerHydrated = useHydratedStore(useAlertsOfferSeen);

  // iOS delivers Web Push only to an installed PWA — requesting permission
  // here would either do nothing or grant a permission that can never
  // deliver anything, so this state skips the browser prompt and explains
  // why instead (issue #356 AC1). Notification is undefined on a
  // non-installed iOS Safari tab, so `permission` alone would read
  // 'unsupported' and hide the explainer entirely without this.
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
    // Before the prompt state is saved: that save ends the explainer, and the
    // offer must already be eligible so the slot never frees up in between.
    if (outcome === 'granted') {
      refresh();
      setGrantedHere(true);
    }
    await setValue(promptStateAfterAsk(outcome));
  };
  const declineAlerts = () => void setAlertsOfferSeen(true);
  const acceptAlerts = async () => {
    const characterId = newestCharacter?.characterId;
    if (characterId === undefined) return;
    await setAlertsOfferSeen(true);
    // A start that fails (offline) puts the offer back rather than losing it.
    void beginAlertsLogin(characterId).catch(() => setAlertsOfferSeen(false));
  };

  const copy = offering
    ? {
        title: t('notifications.alertsOffer.title'),
        // What EVE will ask for: the location too once the server takes it (ADR 0028).
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
    <div
      role="region"
      aria-label={copy.title}
      className="space-y-2 border-b border-line bg-panel-2 px-3.5 py-2.5"
    >
      <p className="font-medium text-text">{copy.title}</p>
      <p className="text-xs text-text-dim">{copy.body}</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={copy.onDismiss}>
          {copy.dismiss}
        </Button>
        {copy.enable &&
          // The Alerts offer starts a login (needs a connection); the plain push explainer does not.
          (offering ? <NeedsConnection>{enableButton}</NeedsConnection> : enableButton)}
      </div>
    </div>
  );
}
