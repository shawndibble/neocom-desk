/**
 * The Applied DPS stats section (issue #1546): the Target Profile picker, an
 * optional second Fitting to overlay, the raw-vs-applied summary, and the
 * lazily loaded graphs. Raw DPS never moves with the profile; applied does.
 */
import { lazy, Suspense, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import {
  appliedDps,
  appliedDpsVsRange,
  appliedDpsVsSpeed,
  bestRange,
  graphMaxRange,
  graphMaxSpeed,
  rawDps,
  type AppliedDpsInputs,
  type AppliedDpsPoint,
} from '@/engine/fittings/appliedDps';
import type { AppliedDpsRow } from './AppliedDpsChart';
import { TargetProfilePicker } from './TargetProfilePicker';
import type { TargetProfiles } from './targetProfiles';
import type { OverlayFitting } from './useOverlayFitting';

const AppliedDpsChart = lazy(() => import('./AppliedDpsChart'));

const NO_OVERLAY = 'none';

function rows(primary: AppliedDpsPoint[], overlay: AppliedDpsPoint[] | null): AppliedDpsRow[] {
  return primary.map((point, i) => ({
    x: point.x,
    primary: point.dps,
    ...(overlay ? { overlay: overlay[i]?.dps ?? 0 } : {}),
  }));
}

function OverlayPicker({ overlay }: { overlay: OverlayFitting }) {
  const { t } = useTranslation();
  const label = t('fittings.appliedDps.overlayLabel');
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-text-dim">{label}</span>
      <Select
        value={overlay.selectedId ?? NO_OVERLAY}
        onValueChange={(value) => overlay.select(value === NO_OVERLAY ? null : value)}
      >
        <SelectTrigger aria-label={label} className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_OVERLAY}>{t('fittings.appliedDps.overlayNone')}</SelectItem>
          <SelectSeparator />
          {overlay.options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AppliedDpsPanel({
  applied,
  chargelessWeaponCount,
  targetProfiles,
  overlay,
}: {
  applied: AppliedDpsInputs;
  /** Active turrets/launchers with no charge loaded — why `applied.weapons` may be empty. */
  chargelessWeaponCount: number;
  targetProfiles: TargetProfiles;
  /** Absent where there's no Character to have saved Fittings (the Share Link view). */
  overlay?: OverlayFitting;
}) {
  const { t } = useTranslation();
  const target = targetProfiles.selected;
  const overlayResult = overlay?.result ?? null;

  const graphs = useMemo(() => {
    const maxRange = graphMaxRange(overlayResult ? [applied, overlayResult.applied] : [applied]);
    const primaryRange = appliedDpsVsRange(applied, target, maxRange);
    const atRange = bestRange(primaryRange);
    const maxSpeed = graphMaxSpeed(target);
    const overlayRange = overlayResult
      ? appliedDpsVsRange(overlayResult.applied, target, maxRange)
      : null;
    const overlaySpeed = overlayResult
      ? appliedDpsVsSpeed(overlayResult.applied, target, atRange, maxSpeed)
      : null;
    return {
      atRange,
      range: rows(primaryRange, overlayRange),
      speed: rows(appliedDpsVsSpeed(applied, target, atRange, maxSpeed), overlaySpeed),
    };
  }, [applied, target, overlayResult]);

  const hasWeapons = applied.weapons.length > 0;

  return (
    <div className="space-y-2">
      <TargetProfilePicker targetProfiles={targetProfiles} />
      {overlay && overlay.options.length > 0 && <OverlayPicker overlay={overlay} />}
      {hasWeapons ? (
        <>
          <p className="text-xs">
            {t('fittings.appliedDps.summary', {
              raw: rawDps(applied).toFixed(1),
              applied: appliedDps(applied, target, graphs.atRange).toFixed(1),
              km: (graphs.atRange / 1000).toFixed(1),
            })}
          </p>
          <p className="text-xs text-text-dim">{t('fittings.appliedDps.assumptions')}</p>
          <Suspense
            fallback={<p className="text-xs text-text-dim">{t('fittings.appliedDps.loading')}</p>}
          >
            <AppliedDpsChart
              range={graphs.range}
              speed={graphs.speed}
              speedAtRange={graphs.atRange}
              overlayName={overlayResult?.name}
            />
          </Suspense>
        </>
      ) : chargelessWeaponCount > 0 ? (
        <p className="text-xs text-text-dim">
          {t('fittings.appliedDps.noCharge', { count: chargelessWeaponCount })}
        </p>
      ) : (
        <p className="text-xs text-text-dim">{t('fittings.appliedDps.noWeapons')}</p>
      )}
    </div>
  );
}
