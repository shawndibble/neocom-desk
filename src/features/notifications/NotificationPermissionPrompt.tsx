import { useMemo, useRef, useState } from 'react';
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
import { useOnboardingBannerSlot } from '@/app/onboardingBannerSlot';
import { useHasLeftFirstScreen } from './firstScreen';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useStickyClearance } from '@/lib/useStickyClearance';
import { beginAlertsLogin } from '@/app/loginFlow';
import { useAlertsNearby } from './alertsGrant';

/**
 * The one-time notification explainer (issue #171). Mounted in `Layout`, so it
 * only ever appears behind `RequireCharacter` — never over `/login` or the
 * `/callback` spinner, even though a character row exists by the time that
 * spinner is up. It also waits for the player to leave that first screen
 * (issue #1788, `firstScreen.ts`) so it never competes with the very first
 * thing a new player looks at.
 *
 * Shown once ever per device (Install Prompt precedent, GLOSSARY.md round 20):
 * Enable makes the single real `Notification.requestPermission()` call, "Not
 * now" makes none at all, and either answer suppresses it permanently — a
 * denied grant can never be re-requested from JS anyway, and Settings owns the
 * second chance for the "Not now" case.
 *
 * Step two (ADR 0020, issue #3758): when Enable ends in a grant, the same
 * banner offers Alerts when closed for the Character just signed in. It is
 * never requested inside the permission step itself, and
 */
export function NotificationPermissionPrompt() {
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
  const hasLeftFirstScreen = useHasLeftFirstScreen();

  const visible = shouldShowPermissionExplainer({
    hydrated,
    seen: value.seen,
    hasCharacter: characterCount > 0,
    permission,
    installRequired,
    hasLeftFirstScreen,
  });
  // Eligibility above is unchanged; this only decides whether the shared
  // bottom slot is this banner's to use right now (issue #1124).
  const offering = shouldShowAlertsOffer({
    hydrated: offerHydrated,
    alertsOfferSeen,
    grantedHere,
    permission,
    installRequired,
    characterId: newestCharacter?.characterId ?? null,
  });
  const hasSlot = useOnboardingBannerSlot('notifications', visible || offering);
  const bannerRef = useRef<HTMLDivElement>(null);
  // Both, not just the slot: registration happens in an effect, so the store
  // still says "eligible" for the one commit after `visible` goes false.
  const shown = (visible || offering) && hasSlot;
  useStickyClearance(bannerRef, 'onboarding-banner', { enabled: shown });
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
        // What EVE will ask for: the location too once the server takes it (ADR 0027).
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
      ref={bannerRef}
      role="alert"
      data-testid="onboarding-banner"
      // Shares one bottom slot with the other onboarding banners, so it can
      // sit directly above the phone tab bar rather than stacked clear of
      // them (issue #1124) — only one of the three is ever mounted at once.
      className="fixed inset-x-4 bottom-16 z-50 space-y-2 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:bottom-16 md:left-auto md:max-w-sm"
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
