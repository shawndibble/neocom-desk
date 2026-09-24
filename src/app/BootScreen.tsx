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
 * These gates wait on Dexie with nothing behind them to catch a read that
 * never resolves, so the screen carries its own escape hatch
 * (`bootRecovery.ts`).
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
      {/* Mounted empty from the start so the hint is *announced* when it
          lands: a live region inserted together with its text (or revealed
          from display:none with it) is not reliably read out, and the
          spinner's own status never changes. `sr-only` is absolutely
          positioned, so it takes no flex gap while empty; the visible copy
          below is aria-hidden so the hint is not read twice. */}
      <p role="status" data-testid="boot-stall-status" className="sr-only">
        {stalled ? t('boot.stalledHint') : null}
      </p>
      {stalled && (
        <>
          <p aria-hidden="true" className="max-w-prose text-xs text-text-dim">
            {t('boot.stalledHint')}
          </p>
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
