/**
 * Improve's drawer body (scope decision `20261024-171917`): the Improve Goal
 * chips (a goal the fit cannot score is a disabled chip with its reason),
 * the goal's Guardrails as one plain line, then the search — progress with
 * Cancel, "Show best so far" after 10 s — and its results in two sections,
 * No downside and Trade-offs, never ranked against each other. Ticked rows
 * are applied together as one unsaved edit.
 */
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  FilterChip,
  IskAmount,
  IskInput,
  ProgressBar,
  SegmentedControl,
  Spinner,
} from '@/components/ui';
import { TANK_GOALS } from '@/engine/fittings/improveGroups';
import { Collapse } from '@/components/ui/Collapse';
import { textActionClassName } from '@/components/ui/textActionClassName';
import {
  bestScore,
  COMBAT_GOALS,
  DEFENSE_CHOICES,
  goalAvailability,
  IMPROVE_MODES,
  IMPROVE_REACHES,
  type DefenseChoice,
  type ImproveGoal,
  type ImproveMode,
  type ImproveReach,
  type ImproveOption,
  type ImproveResult,
  type RejectedOption,
} from '@/engine/fittings/improve';
import type { Resource } from '@/engine/fittings/makeItFit';
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

const moveKey = (candidate: ImproveOption['candidate']): string =>
  `${candidate.fromTypeId ?? 'empty'}-${candidate.toTypeId}-${candidate.at[0].slot}${candidate.at[0].slotIndex}` +
  (candidate.pairedWith ? `+${moveKey(candidate.pairedWith)}` : '');

const optionKey = (option: ImproveOption) => moveKey(option.candidate);

/** Every slot a suggestion changes, its paired downgrade's included: two ticked rows never share one. */
function slotsOf(candidate: ImproveOption['candidate']): string[] {
  const own = candidate.at.map((at) => `${at.slot}${at.slotIndex}`);
  return candidate.pairedWith ? [...own, ...slotsOf(candidate.pairedWith)] : own;
}

/** What the drawer asks of a search beyond the goal; the hook that owns the state passes it whole. */
export interface ImproveSettings {
  reach: ImproveReach;
  onReachChange: (reach: ImproveReach) => void;
  mode: ImproveMode;
  onModeChange: (mode: ImproveMode) => void;
  /** Total budget (planning) or extra-spend cap (refitting) in ISK; null is no limit. */
  spendCap: number | null;
  onSpendCapChange: (cap: number | null) => void;
  defense: DefenseChoice;
  onDefenseChange: (defense: DefenseChoice) => void;
  includeRigs: boolean;
  onIncludeRigsChange: (on: boolean) => void;
  includeOfficer: boolean;
  onIncludeOfficerChange: (on: boolean) => void;
}

interface Props {
  goal: ImproveGoal;
  onGoalChange: (goal: ImproveGoal) => void;
  search: ImproveSearch;
  catalogue: FittingCatalogue | null;
  onApply: (options: ImproveOption[]) => void;
  settings: ImproveSettings;
  /** Opens Make it fit on that budget, from "Fix this first". */
  onFixFirst: (resource: Resource) => void;
  /** Train and Implants, which cost the fit nothing and sit above the swaps; none for an over-budget fit. */
  freeSections?: ReactNode;
}

export function ImprovePanel({
  goal,
  onGoalChange,
  search,
  catalogue,
  onApply,
  settings,
  onFixFirst,
  freeSections,
}: Props) {
  const { t } = useTranslation();
  const moreId = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  // Ticked rows, by key; at most one per fitted module (ticking another variation of it unticks the first).
  // Ticks belong to the result they were made in: a new search (a goal
  // change, an edit to the fit) starts with none.
  const [ticks, setTicks] = useState<{
    result: ImproveResult | null;
    byModule: ReadonlyMap<string, ImproveOption>;
  }>({ result: null, byModule: new Map() });
  const { state, before } = search;
  const result = state.status === 'done' ? state.result : null;
  const ticked = ticks.result === result ? ticks.byModule : new Map<string, ImproveOption>();
  const setTicked = (byModule: ReadonlyMap<string, ImproveOption>) =>
    setTicks({ result, byModule });
  const name = (typeId: number) => catalogueTypeName(catalogue, typeId);

  const moveLabel = (candidate: ImproveOption['candidate']) =>
    candidate.fromTypeId === null
      ? t('fittings.improve.fill', { count: candidate.at.length, to: name(candidate.toTypeId) })
      : t('fittings.improve.swap', {
          count: candidate.at.length,
          from: name(candidate.fromTypeId),
          to: name(candidate.toTypeId),
        });
  const swapLabel = (option: ImproveOption) =>
    option.candidate.pairedWith
      ? t('fittings.improve.pair', {
          add: moveLabel({ ...option.candidate, pairedWith: undefined }),
          downgrade: moveLabel(option.candidate.pairedWith),
        })
      : moveLabel(option.candidate);

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
    const key = optionKey(option);
    if (next.has(key)) next.delete(key);
    else {
      const taken = new Set(slotsOf(option.candidate));
      for (const [other, ticked] of next)
        if (slotsOf(ticked.candidate).some((slot) => taken.has(slot))) next.delete(other);
      next.set(key, option);
    }
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
                  checked={ticked.has(optionKey(option))}
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
                  {option.destroysRigs && (
                    <span className="text-warning block text-xs">
                      {t('fittings.improve.destroysRig')}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  }

  const chosen = [...ticked.values()];

  // A fit that doesn't fit has nothing to improve yet: hand over to Make it fit (`20261019-144736`).
  if (state.status === 'overBudget')
    return (
      <MakeItFitSection heading={t('fittings.improve.section.fixFirst')}>
        <p className="text-sm">{t('fittings.improve.fixFirst')}</p>
        <div className="flex flex-wrap gap-3 text-sm">
          {state.resources.map((resource) => (
            <button
              key={resource}
              type="button"
              className={textActionClassName()}
              onClick={() => onFixFirst(resource)}
            >
              {t(`fittings.makeItFit.fix.${resource}`)}
            </button>
          ))}
        </div>
      </MakeItFitSection>
    );

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

      <div className="space-y-3">
        <SegmentedControl
          label={t('fittings.improve.reachLabel')}
          options={IMPROVE_REACHES.map((value) => ({
            value,
            label: t(`fittings.improve.reach.${value}`),
          }))}
          value={settings.reach}
          onChange={settings.onReachChange}
          fill
        />
        <p className="text-text-dim text-xs">{t(`fittings.improve.reachHint.${settings.reach}`)}</p>
        <SegmentedControl
          label={t('fittings.improve.modeLabel')}
          options={IMPROVE_MODES.map((value) => ({
            value,
            label: t(`fittings.improve.mode.${value}`),
          }))}
          value={settings.mode}
          onChange={settings.onModeChange}
          fill
        />
        <label className="block space-y-1 text-sm">
          <span>{t(`fittings.improve.cap.${settings.mode}`)}</span>
          <IskInput
            value={settings.spendCap === null ? '' : String(settings.spendCap)}
            onChange={(value) => settings.onSpendCapChange(value === '' ? null : Number(value))}
          />
        </label>
        <SegmentedControl
          label={t('fittings.improve.defenseLabel')}
          options={DEFENSE_CHOICES.map((value) => ({
            value,
            label: t(`fittings.improve.defense.${value}`),
          }))}
          value={settings.defense}
          onChange={settings.onDefenseChange}
          fill
        />
        {!TANK_GOALS.has(goal) && (
          <p className="text-text-dim text-xs">{t('fittings.improve.defenseHint')}</p>
        )}
        <div>
          <button
            type="button"
            className={textActionClassName()}
            aria-expanded={moreOpen}
            aria-controls={moreId}
            onClick={() => setMoreOpen((open) => !open)}
          >
            {t('fittings.improve.moreLabel')}
          </button>
          <Collapse open={moreOpen} id={moreId} className="pt-2">
            <div className="space-y-1">
              <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                <Checkbox
                  checked={settings.includeRigs}
                  onChange={(event) => settings.onIncludeRigsChange(event.target.checked)}
                />
                {t('fittings.improve.includeRigs')}
              </label>
              <label className={cx('flex items-center gap-2 text-sm', tappableRowClassName)}>
                <Checkbox
                  checked={settings.includeOfficer}
                  onChange={(event) => settings.onIncludeOfficerChange(event.target.checked)}
                />
                {t('fittings.improve.includeOfficer')}
              </label>
            </div>
          </Collapse>
        </div>
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

      {freeSections}

      {state.status === 'done' && state.sides && (
        <p className="text-sm" data-testid="improve-sides">
          {(['shield', 'armor'] as const)
            .map((side) => {
              const score = bestScore(state.sides![side]);
              return t('fittings.improve.sideResult', {
                side: t(`fittings.improve.defense.${side}`),
                result:
                  score === null
                    ? t('fittings.improve.sideNone')
                    : t('fittings.improve.sideGain', { percent: Math.round(score * 100) }),
              });
            })
            .join(' · ')}
        </p>
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
            <p className="text-text-dim text-xs">{t(`fittings.improve.widen.${settings.reach}`)}</p>
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
