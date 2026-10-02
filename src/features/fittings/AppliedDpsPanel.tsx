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
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { kmValue } from './rangeText';
import { Facts, HeatFigure, StatField, StatFields, StatNote } from './StatFacts';
import { STAT_FIELD_WIDTH } from './statKit';
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
    <StatField label={label}>
      <Select
        value={overlay.selectedId ?? NO_OVERLAY}
        onValueChange={(value) => overlay.select(value === NO_OVERLAY ? null : value)}
      >
        <SelectTrigger aria-label={label} size="sm" className={STAT_FIELD_WIDTH}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_OVERLAY}>{t('fittings.appliedDps.overlayNone')}</SelectItem>
          <SelectSeparator />
          {(
            [
              ['saved', t('fittings.myFittings.title')],
              ['inGame', t('fittings.start.tabInGame')],
            ] as const
          ).map(
            ([source, heading]) =>
              overlay.options[source].length > 0 && (
                <SelectGroup key={source}>
                  <SelectLabel>{heading}</SelectLabel>
                  {overlay.options[source].map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )
          )}
        </SelectContent>
      </Select>
    </StatField>
  );
}

/** The applied-DPS inputs, with the unheated ones beside them under "Overheat all". */
interface AppliedFigures {
  applied: AppliedDpsInputs;
  unheated: AppliedFigures | null;
}

export function AppliedDpsPanel({
  applied,
  unheatedApplied = null,
  chargelessWeaponCount,
  targetProfiles,
  overlay,
}: {
  applied: AppliedDpsInputs;
  /** Under "Overheat all", the same inputs unheated — the summary reads heated only where heat changed it. */
  unheatedApplied?: AppliedDpsInputs | null;
  /** Active turrets/launchers with no charge loaded — why `applied.weapons` may be empty. */
  chargelessWeaponCount: number;
  targetProfiles: TargetProfiles;
  /** Absent where there's no Character to have saved Fittings (the Fitting Share Code view). */
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
  const figures: AppliedFigures = {
    applied,
    unheated: unheatedApplied ? { applied: unheatedApplied, unheated: null } : null,
  };
  const maxRange = graphMaxRange(overlayResult ? [applied, overlayResult.applied] : [applied]);
  // Each side at its own best range, as the summary would read it; worked out
  // once per input set rather than on every render (and every HeatFigure pass).
  const summaries = useMemo(() => {
    const read = (inputs: AppliedDpsInputs) => {
      const atRange = bestRange(appliedDpsVsRange(inputs, target, maxRange));
      return {
        raw: rawDps(inputs).toFixed(1),
        applied: t('fittings.appliedDps.appliedValue', {
          value: appliedDps(inputs, target, atRange).toFixed(1),
          km: kmValue(atRange),
        }),
      };
    };
    const byInputs = new Map<AppliedDpsInputs, { raw: string; applied: string }>([
      [applied, read(applied)],
    ]);
    if (unheatedApplied) byInputs.set(unheatedApplied, read(unheatedApplied));
    return byInputs;
  }, [applied, unheatedApplied, target, maxRange, t]);
  const summary =
    (part: 'raw' | 'applied') =>
    ({ applied: inputs }: AppliedFigures) =>
      summaries.get(inputs)?.[part] ?? '';

  return (
    <div className="space-y-3">
      <StatFields>
        <TargetProfilePicker targetProfiles={targetProfiles} field />
        {overlay && overlay.options.saved.length + overlay.options.inGame.length > 0 && (
          <OverlayPicker overlay={overlay} />
        )}
      </StatFields>
      {hasWeapons ? (
        <>
          <Facts
            items={[
              {
                label: t('fittings.appliedDps.raw'),
                value: <HeatFigure stats={figures} format={summary('raw')} />,
              },
              {
                label: t('fittings.appliedDps.applied'),
                value: <HeatFigure stats={figures} format={summary('applied')} />,
              },
            ]}
          />
          <Suspense fallback={<StatNote>{t('fittings.appliedDps.loading')}</StatNote>}>
            <AppliedDpsChart
              range={graphs.range}
              speed={graphs.speed}
              speedAtRange={graphs.atRange}
              overlayName={overlayResult?.name}
            />
          </Suspense>
          <StatNote>{t('fittings.appliedDps.assumptions')}</StatNote>
        </>
      ) : chargelessWeaponCount > 0 ? (
        <StatNote>{t('fittings.stats.offenseNoCharge', { count: chargelessWeaponCount })}</StatNote>
      ) : (
        <StatNote>{t('fittings.appliedDps.noWeapons')}</StatNote>
      )}
    </div>
  );
}
