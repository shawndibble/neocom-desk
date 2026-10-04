/**
 * One jump through a Thera / Turnur hole on a Route Safety route (issue
 * #2476), drawn between its two systems: "⤳ Wormhole · Kihtaled → Thera ·
 * Warp to EPK-530 in Kihtaled · Q063 · fits Medium · 11h 17m left ·
 * EVE-Scout, 1m ago", and Copy for the signature. A phone card keeps what a
 * pilot needs in space: where to warp, size, life left and Copy.
 *
 * The signature is the one on the side being flown from — the exit's going
 * in, the hub's coming out. Conditions, never verdicts (decision
 * `20260912-172628`): size, life and age, never a judgement of the hole.
 */
import { useEffect, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { RouteSafetyRow } from '@/engine/route/routeSafety';
import type { TheraConnection } from '@/engine/route/theraConnections';
import { formatAge } from '@/lib/age';
import { writeToClipboard } from '@/lib/clipboard';
import { formatCountdown } from '@/lib/duration';
import { routeSystemName } from './routeSystemName';

/** A jump through a hole, between the two route systems it joins. */
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
      // No clipboard (permission, insecure context): select the signature so
      // the pilot can copy it by hand.
      const node = signatureRef.current;
      if (node) window.getSelection()?.selectAllChildren(node);
    }
  }

  const names = { signature: shownSignature, system: warpSystem };
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xs border border-dashed border-line-bright px-2 py-1 sm:rounded-none sm:border-y-0 sm:border-r-0 sm:border-l-2">
      <span aria-hidden="true">⤳</span>
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
      <Button
        size="sm"
        disabled={signature === null}
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
    </div>
  );
}
