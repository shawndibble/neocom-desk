import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, LiveStatus, LogoMark, Spinner } from '@/components/ui';
import { recoverFromStalledBoot } from './bootRecovery';
import {
  BOOT_TIP_DELAY_MS,
  BOOT_TIP_ROTATE_MS,
  getBootTip,
  nextBootTip,
  type BootTipKey,
} from './bootTips';
import { reportBootStallOnce, reportBootStallResolved, type BootGate } from './bootStallReport';

export const BOOT_STALL_MS = 10_000;

export function BootScreen({ gate }: { gate?: BootGate }) {
  const { t } = useTranslation();
  const [stalled, setStalled] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const recoveringRef = useRef(false);
  const [tip, setTip] = useState<BootTipKey | null>(null);

  useEffect(() => {
    const show = setTimeout(() => setTip(getBootTip()), BOOT_TIP_DELAY_MS);
    const rotate = setInterval(
      () => setTip((current) => nextBootTip(current ?? getBootTip())),
      BOOT_TIP_ROTATE_MS
    );
    return () => {
      clearTimeout(show);
      clearInterval(rotate);
    };
  }, []);

  useEffect(() => {
    if (gate === undefined) return;
    const timer = setTimeout(() => {
      setStalled(true);
      reportBootStallOnce(BOOT_STALL_MS, gate);
    }, BOOT_STALL_MS);
    return () => {
      clearTimeout(timer);
      reportBootStallResolved(recoveringRef.current);
    };
  }, [gate]);

  return (
    <main className="safe-inset flex min-h-dvh [--safe-x:1.5rem] [--safe-y:1.5rem] flex-col items-center justify-center gap-3 bg-bg text-center text-text">
      <LogoMark className="size-10" />
      <h1 className="text-sm font-semibold tracking-widest uppercase">{t('app.name')}</h1>
      <Spinner label={t('common.loading')} />
      <p className="text-xs text-text-dim">{t('common.loadingEllipsis')}</p>
      <p aria-hidden="true" className="min-h-8 max-w-prose text-xs text-text-dim">
        {tip === null ? null : t(tip)}
      </p>
      <LiveStatus data-testid="boot-stall-status">
        {stalled ? t('boot.stalledHint') : null}
      </LiveStatus>
      {stalled && (
        <>
          <p aria-hidden="true" className="max-w-prose text-xs text-text-dim">
            {t('boot.stalledHint')}
          </p>
          <Button
            size="sm"
            loading={recovering}
            onClick={() => {
              recoveringRef.current = true;
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
