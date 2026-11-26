import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { RouteSafetyRow } from '@/engine/route/routeSafety';
import type { TheraConnection } from '@/engine/route/theraConnections';
import { formatAge } from '@/lib/age';
import { writeToClipboard } from '@/lib/clipboard';
import { formatCountdown } from '@/lib/duration';
import { MassNote } from './MassNote';
import { routeSystemName } from './routeSystemName';

export interface HoleStep {
  from: RouteSafetyRow;
  to: RouteSafetyRow;
  hole: TheraConnection;
}

const COPIED_MS = 1500;

function Dot() {
  return (
    <span aria-hidden="true" className="text-text-faint">
      ·
    </span>
  );
}

export function HoleStepLine({
  step,
  fetchedAt,
  now,
}: {
  step: HoleStep;
  fetchedAt: Date | null;
  now: number;
}) {
  const { t } = useTranslation();
  const signatureRef = useRef<HTMLSpanElement>(null);
  const [copied, setCopied] = useState(false);
  const { from, to, hole } = step;
  const goingIn = from.systemId === hole.exitSystemId;
  const signature = goingIn ? hole.exitSignature : hole.hubSignature;
  const warpSystem = routeSystemName(from);
  const shownSignature = signature ?? t('travel.holes.unknownSignature');
  const size = hole.maxShipSize ? t(`travel.thera.size.${hole.maxShipSize}`) : null;
  const life = t('travel.thera.lifeLeft', {
    time: formatCountdown(Math.max(0, hole.expiresAt - now) / 1000),
  });

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    if (signature === null) return;
    try {
      await writeToClipboard(signature);
      setCopied(true);
    } catch {
      const node = signatureRef.current;
      if (node) window.getSelection()?.selectAllChildren(node);
    }
  }

  const names = { signature: shownSignature, system: warpSystem };
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xs border border-dashed border-line-bright px-2 py-1 sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l-2">
      <Icon.WormholeHop size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      <span className="hidden font-semibold sm:inline">{t('travel.holes.wormhole')}</span>
      <span className="hidden sm:inline">
        <Dot />
      </span>
      <span className="hidden sm:inline">
        {t('travel.holes.ends', { from: routeSystemName(from), to: routeSystemName(to) })}
      </span>
      <span className="hidden sm:inline">
        <Dot />
      </span>
      <span>
        <Trans
          i18nKey="travel.holes.warpTo"
          values={{ signature: shownSignature, system: warpSystem }}
          components={{
            sig: <span ref={signatureRef} className="font-mono tabular-nums select-all" />,
          }}
        />
      </span>
      {hole.wormholeType && (
        <>
          <span className="hidden sm:inline">
            <Dot />
          </span>
          <span className="hidden sm:inline">{hole.wormholeType}</span>
        </>
      )}
      {size && (
        <>
          <Dot />
          <span className="hidden sm:inline">{t('travel.holes.fits', { size })}</span>
          <span className="sm:hidden">{size}</span>
        </>
      )}
      <Dot />
      <span className="tabular-nums">{life}</span>
      {fetchedAt && (
        <>
          <span className="hidden sm:inline">
            <Dot />
          </span>
          <span className="hidden text-text-dim sm:inline">
            {t('travel.holes.source', { age: formatAge(now - fetchedAt.getTime(), t) })}
          </span>
        </>
      )}
      <Tooltip content={signature === null ? t('travel.holes.copyNoSignature') : null}>
        <Button
          size="sm"
          aria-disabled={signature === null || undefined}
          onClick={() => void copy()}
          aria-label={
            copied ? t('travel.holes.copiedLabel', names) : t('travel.holes.copyLabel', names)
          }
        >
          {copied ? (
            <Icon.Done size={Icon.ICON_SIZE.sm} />
          ) : (
            <Icon.CopyToClipboard size={Icon.ICON_SIZE.sm} />
          )}
          {copied ? (
            t('travel.holes.copied')
          ) : (
            <>
              <span className="hidden sm:inline">
                {t('travel.holes.copy', { signature: shownSignature })}
              </span>
              <span className="sm:hidden">{t('travel.holes.copyShort')}</span>
            </>
          )}
        </Button>
      </Tooltip>
      <MassNote hole={hole} />
    </div>
  );
}
