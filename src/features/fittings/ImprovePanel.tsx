/**
 * Improve's drawer body (scope decision `20261024-171917`): the Improve Goal
 * chips (a goal the fit cannot score is a disabled chip with its reason),
 * the goal's Guardrails as one plain line, then the search — progress with
 * Cancel, "Show best so far" after 10 s — and its results in two sections,
 * No downside and Trade-offs, never ranked against each other. Ticked rows
 * are applied together as one unsaved edit.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, FilterChip, IskAmount, ProgressBar, Spinner } from '@/components/ui';
import {
  COMBAT_GOALS,
  goalAvailability,
  type ImproveGoal,
  type ImproveOption,
  type ImproveResult,
  type RejectedOption,
} from '@/engine/fittings/improve';
import type { FittingStats } from '@/engine/fittings/types';
import { diffFittingStats } from '@/engine/fittings/variationDelta';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { changeLabel } from './fittingVariationsCsv';
import { MakeItFitSection } from './MakeItFitSection';
import { catalogueTypeName, type FittingCatalogue } from './useFittingCatalogue';
import type { ImproveSearch } from './useImprove';

/** How many stat changes a row spells out before counting the rest. */
const CHANGES_SHOWN = 4;

const isResource = (key: string) => /^(cpu|powergrid|calibration)/.test(key);

const optionKey = (option: ImproveOption) =>
  `${option.candidate.fromTypeId}-${option.candidate.toTypeId}`;

interface Props {
  goal: ImproveGoal;
  onGoalChange: (goal: ImproveGoal) => void;
  search: ImproveSearch;
  catalogue: FittingCatalogue | null;
  onApply: (options: ImproveOption[]) => void;
}

export function ImprovePanel({ goal, onGoalChange, search, catalogue, onApply }: Props) {
  const { t } = useTranslation();
  // Ticked rows, by key; at most one per fitted module (ticking another variation of it unticks the first).
  // Ticks belong to the result they were made in: a new search (a goal
  // change, an edit to the fit) starts with none.
  const [ticks, setTicks] = useState<{
    result: ImproveResult | null;
    byModule: ReadonlyMap<number, ImproveOption>;
  }>({ result: null, byModule: new Map() });
  const { state, before } = search;
  const result = state.status === 'done' ? state.result : null;
  const ticked = ticks.result === result ? ticks.byModule : new Map<number, ImproveOption>();
  const setTicked = (byModule: ReadonlyMap<number, ImproveOption>) =>
    setTicks({ result, byModule });
  const name = (typeId: number) => catalogueTypeName(catalogue, typeId);

  const swapLabel = (option: ImproveOption) =>
    t('fittings.improve.swap', {
      count: option.candidate.at.length,
      from: name(option.candidate.fromTypeId),
      to: name(option.candidate.toTypeId),
    });

  function changeLine(option: ImproveOption | RejectedOption, own: FittingStats): string {
    // What the swap does first; the CPU, powergrid and calibration it takes after.
    const changes = [...diffFittingStats(own, option.after).changes].sort(
      (a, b) => Number(isResource(a.key)) - Number(isResource(b.key))
    );
    const shown = changes.slice(0, CHANGES_SHOWN).map((change) => changeLabel(change, t));
    const rest = changes.length - shown.length;
    if (rest > 0) shown.push(t('fittings.makeItFit.otherStats', { count: rest }));
    return shown.length > 0 ? shown.join(', ') : t('fittings.variations.noChanges');
  }

  function isk(option: ImproveOption) {
    if (option.iskDelta === null)
      return <span className="text-text-dim">{t('fittings.improve.noPrice')}</span>;
    return option.iskDelta < 0 ? (
      <span className="text-success">
        {t('fittings.makeItFit.saves')} <IskAmount value={-option.iskDelta} />
      </span>
    ) : (
      <span>
        {t('fittings.makeItFit.costs')} <IskAmount value={option.iskDelta} />
      </span>
    );
  }

  function toggle(option: ImproveOption) {
    const next = new Map(ticked);
    const from = option.candidate.fromTypeId;
    if (next.get(from) === option) next.delete(from);
    else next.set(from, option);
    setTicked(next);
  }

  function rows(options: ImproveOption[], own: FittingStats) {
    return (
      <ul className="space-y-1">
        {options.map((option) => {
          const id = `improve-${optionKey(option)}`;
          return (
            <li key={optionKey(option)} className="border-line rounded-xs border p-2 text-sm">
              <label
                htmlFor={id}
                className={cx('flex cursor-pointer items-start gap-2', tappableRowClassName)}
              >
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={ticked.get(option.candidate.fromTypeId) === option}
                  onChange={() => toggle(option)}
                />
                <span className="min-w-0">
                  <span className="block font-medium">{swapLabel(option)}</span>
                  <span className="text-text-dim block text-xs">{changeLine(option, own)}</span>
                  {option.downsides.length > 0 && (
                    <span className="text-warning block text-xs">
                      {t('fittings.improve.givesUp', {
                        stats: option.downsides
                          .map((metric) => t(`fittings.whatToTrain.sort.${metric}`))
                          .join(', '),
                      })}
                    </span>
                  )}
                  <span className="block text-xs">{isk(option)}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  const chosen = [...ticked.values()];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div
          role="group"
          aria-label={t('fittings.improve.goalLabel')}
          className="flex flex-wrap gap-2"
        >
          {COMBAT_GOALS.map((id) => {
            const availability = before ? goalAvailability(id, before) : { available: true };
            const reason =
              'reason' in availability
                ? t(`fittings.improve.unavailable.${availability.reason}`)
                : undefined;
            return (
              <FilterChip
                key={id}
                label={t(`fittings.improve.goal.${id}`)}
                selected={goal === id}
                disabled={!availability.available}
                {...(reason ? { tooltip: reason } : {})}
                onToggle={() => {
                  if (goal === id) return;
                  setTicked(new Map());
                  onGoalChange(id);
                }}
              />
            );
          })}
        </div>
        <p className="text-text-dim text-xs">
          {t(
            goal === 'cheaper'
              ? 'fittings.improve.guardrail.cheaper'
              : 'fittings.improve.guardrail.combat'
          )}
        </p>
      </div>

      {state.status === 'searching' && (
        <div className="space-y-2">
          <p className="text-text-dim flex items-center gap-2 text-sm">
            <Spinner />
            {t('fittings.improve.checking', { checked: state.checked, total: state.total })}
          </p>
          <ProgressBar
            label={t('fittings.improve.progressLabel')}
            value={state.total > 0 ? state.checked : null}
            max={Math.max(1, state.total)}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={search.cancel}>
              {t('fittings.improve.cancel')}
            </Button>
            {state.slow && (
              <Button size="sm" onClick={search.showBestSoFar}>
                {t('fittings.improve.bestSoFar')}
              </Button>
            )}
          </div>
        </div>
      )}

      {state.status === 'cancelled' && (
        <div className="space-y-2">
          <p className="text-text-dim text-sm">{t('fittings.improve.cancelled')}</p>
          <Button size="sm" onClick={search.restart}>
            {t('fittings.improve.searchAgain')}
          </Button>
        </div>
      )}

      {state.status === 'failed' && (
        <p className="text-danger text-sm">{t('fittings.improve.failed')}</p>
      )}

      {state.status === 'done' &&
        (state.result.noDownside.length === 0 && state.result.tradeOffs.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm">{t(`fittings.improve.nothing.${goal}`)}</p>
            {state.result.stopped && (
              <div className="space-y-2">
                <p className="text-text-dim text-xs">
                  {t('fittings.improve.partial', { checked: state.result.checked })}
                </p>
                <Button size="sm" onClick={search.restart}>
                  {t('fittings.improve.searchAgain')}
                </Button>
              </div>
            )}
            {state.result.rejected.length > 0 && (
              <MakeItFitSection heading={t('fittings.improve.closest')}>
                <ul className="space-y-1">
                  {state.result.rejected.map((option) => (
                    <li
                      key={optionKey(option)}
                      className="border-line rounded-xs border p-2 text-sm"
                    >
                      <p className="font-medium">{swapLabel(option)}</p>
                      <p className="text-text-dim text-xs">{changeLine(option, state.before)}</p>
                      <p className="text-warning text-xs">
                        {t(`fittings.improve.broke.${option.guardrail}`)}
                      </p>
                    </li>
                  ))}
                </ul>
              </MakeItFitSection>
            )}
            <p className="text-text-dim text-xs">{t('fittings.improve.widen')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {state.result.stopped && (
              <p className="text-text-dim text-xs">
                {t('fittings.improve.partial', { checked: state.result.checked })}
              </p>
            )}
            {state.result.noDownside.length > 0 && (
              <MakeItFitSection heading={t('fittings.improve.section.noDownside')}>
                {rows(state.result.noDownside, state.before)}
              </MakeItFitSection>
            )}
            {state.result.tradeOffs.length > 0 && (
              <MakeItFitSection heading={t('fittings.improve.section.tradeOffs')}>
                {rows(state.result.tradeOffs, state.before)}
              </MakeItFitSection>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-text-dim text-xs" data-testid="improve-timing">
                {t('fittings.improve.checked', {
                  count: state.result.checked,
                  seconds: (state.elapsedMs / 1000).toFixed(1),
                })}
              </p>
              <Button
                variant="primary"
                size="sm"
                disabled={chosen.length === 0}
                onClick={() => {
                  onApply(chosen);
                  setTicked(new Map());
                }}
              >
                {chosen.length === 0
                  ? t('fittings.improve.apply')
                  : t('fittings.improve.applyCount', { count: chosen.length })}
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
