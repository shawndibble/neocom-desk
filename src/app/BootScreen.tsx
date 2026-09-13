import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LogoMark, Spinner } from '@/components/ui';
import { recoverFromStalledBoot } from './bootRecovery';
import { reportBootStallOnce } from './bootStallReport';

/**
 * How long a boot may sit unresolved before the screen offers a way out.
 * Generously past a cold start on a slow phone — this is not a progress hint,
 * it is the point where "still loading" has become "stuck".
 */
export const BOOT_STALL_MS = 10_000;

/**
 * Full-page "still working out where you are". Shared by `Root`,
 * `RequireCharacter` and `Login` so no gate is tempted to treat "not loaded
 * yet" as "logged out".
 *
 * Both gates wait on Dexie, and a blocked IndexedDB upgrade leaves that read
 * pending rather than rejecting, so this screen — alone among the app's waits
 * — needs its own escape hatch (`bootRecovery.ts`).
 */
export function BootScreen() {
  const { t } = useTranslation();
  const [stalled, setStalled] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setStalled(true);
      reportBootStallOnce(BOOT_STALL_MS);
    }, BOOT_STALL_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg p-6 text-center text-text">
      <LogoMark className="size-10" />
      <h1 className="text-sm font-semibold tracking-widest uppercase">{t('app.name')}</h1>
      <Spinner label={t('common.loading')} />
      <p className="text-xs text-text-dim">{t('common.loadingEllipsis')}</p>
      {stalled && (
        <>
          <p className="max-w-prose text-xs text-text-dim">{t('boot.stalledHint')}</p>
          {/* Disabled once tapped: recovery waits on the service worker before
              it reloads, and that pause is silent — otherwise it reads as a
              dead button and invites a second tap, which starts a second flow. */}
          <Button
            size="sm"
            disabled={recovering}
            onClick={() => {
              setRecovering(true);
              void recoverFromStalledBoot();
            }}
          >
            {t(recovering ? 'boot.stalledPending' : 'boot.stalledAction')}
          </Button>
        </>
      )}
    </main>
  );
}
