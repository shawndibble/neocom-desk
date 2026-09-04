import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui';
import { db } from '@/db';
import {
  useNotificationPromptState,
  useNotificationPermission,
  promptStateAfterAsk,
  shouldShowPermissionExplainer,
} from './permission';
import { webPushSupport } from '@/sync/deviceRegistration';
import { enableWebPush } from './webPush';

/**
 * The one-time notification explainer (issue #171). Mounted in `Layout`, so it
 * only ever appears behind `RequireCharacter` — never over `/login` or the
 * `/callback` spinner, even though a character row exists by the time that
 * spinner is up.
 *
 * Shown once ever per device (Install Prompt precedent, CONTEXT.md round 20):
 * Enable makes the single real `Notification.requestPermission()` call, "Not
 * now" makes none at all, and either answer suppresses it permanently — a
 * denied grant can never be re-requested from JS anyway, and Settings owns the
 * second chance for the "Not now" case.
 */
export function NotificationPermissionPrompt() {
  const { t } = useTranslation();
  const { value, hydrated, hydrate, setValue } = useNotificationPromptState();
  const { permission } = useNotificationPermission();
  const characterCount = useLiveQuery(() => db.characters.count());

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const visible = shouldShowPermissionExplainer({
    hydrated,
    seen: value.seen,
    hasCharacter: (characterCount ?? 0) > 0,
    permission,
  });
  if (!visible) return null;

  // iOS delivers Web Push only to an installed PWA — requesting permission
  // here would either do nothing or grant a permission that can never
  // deliver anything, so this state skips the browser prompt and explains
  // why instead (issue #356 AC1).
  const installRequired = webPushSupport() === 'requires-install';

  const dismiss = () => void setValue({ seen: true, outcome: value.outcome });
  const enable = async () => {
    const { permission: outcome } = await enableWebPush();
    await setValue(promptStateAfterAsk(outcome));
  };

  return (
    <div
      role="alert"
      // Sits above InstallPrompt's own fixed banner rather than on top of it —
      // a first login can plausibly surface both at once.
      className="fixed inset-x-4 bottom-28 z-50 space-y-2 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:bottom-16 md:left-auto md:max-w-sm"
    >
      <p className="font-medium text-text">{t('notifications.prompt.title')}</p>
      <p className="text-xs text-text-dim">
        {t(
          installRequired ? 'notifications.prompt.installRequiredBody' : 'notifications.prompt.body'
        )}
      </p>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={dismiss}>
          {t('notifications.prompt.dismiss')}
        </Button>
        {!installRequired && (
          <Button size="sm" variant="primary" onClick={() => void enable()}>
            {t('notifications.prompt.enable')}
          </Button>
        )}
      </div>
    </div>
  );
}
