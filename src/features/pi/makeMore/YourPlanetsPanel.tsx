import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, InfoTooltip, Panel } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { PlanetImage } from '../PlanetImage';
import { Gain, SlotNudge } from '../PlanSlotNudge';
import type { PlanView } from '../planView';

/**
 * Each colony at a glance, the "haul between my planets" opt-in and the free
 * planet slots. Below the rebuilds: it is context, not the to-do.
 */
export function YourPlanetsPanel({
  view,
  onFindBest,
  haulBetween,
  onHaulBetween,
}: {
  view: PlanView;
  onFindBest: () => void;
  haulBetween: boolean;
  onHaulBetween: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const optInId = useId();
  return (
    <Panel
      title={t('piPlan.make.planetsTitle')}
      meta={
        <span className="text-[0.6875rem] whitespace-nowrap text-text-dim tabular-nums">
          {t('piPlan.make.planetsCount', {
            used: view.slots.used,
            allowed: Math.max(view.slots.allowed, view.slots.used),
          })}
        </span>
      }
      padded={false}
    >
      {/* auto-fit: the columns stretch to the card, so a few planets never leave blank space. */}
      {/* Dividers are tile borders, not a gap over a bg-line backdrop, so a trailing empty track stays panel-coloured. */}
      <ul className="-mr-px -mb-px grid grid-cols-2 max-sm:[&>li:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
        {view.strips.map((strip) => (
          <li
            key={strip.planetId}
            className="flex min-w-0 flex-col items-center gap-1.5 border-r border-b border-line p-3 text-center sm:flex-row sm:gap-3 sm:text-left"
          >
            <PlanetImage type={strip.planetType} size={48} />
            <div className="min-w-0 flex-1 text-xs">
              <div className="truncate text-sm font-semibold text-text">{strip.name}</div>
              {strip.quickWinGainPerDay !== null && (
                <div className="text-isk-pos">
                  <Gain value={strip.quickWinGainPerDay} />{' '}
                  <span className="text-text-dim">{t('piPlan.make.stripQuickWin')}</span>
                </div>
              )}
              <div className="text-[0.6875rem] font-semibold tracking-widest uppercase">
                {strip.rebuild.kind === 'change' ? (
                  <span className="text-text-dim">
                    {t('piPlan.make.stripRebuild')}{' '}
                    <span className="normal-case">
                      <Gain value={strip.rebuild.gainPerDay} className="tracking-normal" />
                    </span>
                  </span>
                ) : strip.rebuild.kind === 'keep' ? (
                  <span className="text-text-dim">{t('piPlan.make.stripKeep')}</span>
                ) : (
                  <span className="text-text-dim">
                    {t(
                      strip.rebuild.reason === 'link-cost'
                        ? 'piPlan.make.stripNoLinkCost'
                        : 'piPlan.make.stripUnknown'
                    )}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {view.excluded.length > 0 && (
        <p className="border-t border-line px-3 py-2 text-[0.6875rem] text-text-dim">
          {t('piPlan.make.excluded', {
            count: view.excluded.length,
            names: view.excluded
              .map((colony) => colony.name ?? t('pi.planetLabel', { id: colony.planetId }))
              .join(', '),
          })}
        </p>
      )}
      <div className="flex items-center gap-1.5 border-t border-line p-3">
        <label className={cx('flex w-fit cursor-pointer items-start gap-2', tappableRowClassName)}>
          <Checkbox
            className="mt-0.5"
            checked={haulBetween}
            aria-labelledby={`${optInId}-label`}
            aria-describedby={`${optInId}-hint`}
            onChange={(e) => onHaulBetween(e.target.checked)}
          />
          <span id={`${optInId}-label`} className="text-xs text-text">
            {t('piPlan.chains.optIn')}
          </span>
        </label>
        <InfoTooltip
          label={t('piPlan.chains.optInLabel')}
          glyph="info"
          content={t('piPlan.chains.optInHint')}
        />
        <span id={`${optInId}-hint`} className="sr-only">
          {t('piPlan.chains.optInHint')}
        </span>
      </div>
      <SlotNudge slots={view.slots} onFindBest={onFindBest} compact />
    </Panel>
  );
}
