import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui';
import { db } from '@/db';
import {
  useNotificationPromptState,
  useNotificationPermission,
  requestNotificationPermission,
  shouldShowPermissionExplainer,
} from './permission';

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

  const enable = async () => {
    const outcome = await requestNotificationPermission();
    await setValue({ seen: true, outcome: outcome === 'unsupported' ? null : outcome });
  };

  return (
    <div
      role="alert"
      aria-label={t('notifications.prompt.title')}
      // Sits above InstallPrompt's own fixed banner rather than on top of it —
      // a first login can plausibly surface both at once.
      className="fixed inset-x-4 bottom-28 z-50 space-y-2 rounded-xs border border-line-bright bg-panel-2 px-3 py-2 text-sm shadow-lg md:bottom-16 md:left-auto md:max-w-sm"
    >
      <p className="font-medium text-text">{t('notifications.prompt.title')}</p>
      <p className="text-xs text-text-dim">{t('notifications.prompt.body')}</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={() => void setValue({ seen: true, outcome: value.outcome })}>
          {t('notifications.prompt.dismiss')}
        </Button>
        <Button size="sm" variant="primary" onClick={() => void enable()}>
          {t('notifications.prompt.enable')}
        </Button>
      </div>
    </div>
  );
}
