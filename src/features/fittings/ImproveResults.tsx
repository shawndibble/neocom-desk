/**
 * A finished search's rows in their sections (Make flyable, No downside,
 * Trade-offs, never ranked against each other) under the best swap found,
 * and the footer where the ticked set is checked and applied.
 */
import { Fragment, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, SegmentedControl } from '@/components/ui';
import { CRYSTAL_FAMILY_ORES } from '@/engine/fittings/crystalChoice';
import type { ImproveGoal, ImproveOption, RejectedOption } from '@/engine/fittings/improve';
import { optionKey } from '@/engine/fittings/improveKeys';
import { IMPROVE_SORTS } from '@/engine/fittings/improveRows';
import { ImproveBlockedRow } from './ImproveBlockedRow';
import { ImproveCoverOffer } from './ImproveCoverOffer';
import { ImproveFooter } from './ImproveFooter';
import { ImproveMakeover } from './ImproveMakeover';
import { ImproveOptionList } from './ImproveOptionList';
import { ImproveSelectionSummary } from './ImproveSelectionSummary';
import { crystalBasisOf } from './improveCrystalBasis';
import { cautionLines, hintLine } from './improveCommonHints';
import { singleGainsOf } from './improveMakeoverTicks';
import { bestFoundLine } from './improveLeadLine';
import type { ImproveSettings } from './improveSettings';
import { MakeItFitSection } from './MakeItFitSection';
import type { ImproveState } from './useImprove';
import type { ImproveLabels } from './useImproveLabels';
import type { ImproveSelection } from './useImproveSelection';
import type { SelectionCheck } from './useSelectionCheck';
import type { TargetProfile } from '@/engine/fittings/targetProfile';

/** How many overrun fixes get an implant search: each runs the Implant Finder whole. */
const FLYABLE_IMPLANT_FIXES = 3;

interface Props {
  state: Extract<ImproveState, { status: 'done' }>;
  goal: ImproveGoal;
  settings: ImproveSettings;
  labels: ImproveLabels;
  selection: ImproveSelection;
  check: SelectionCheck;
  /** Ticked rows that no list shows: covers added from the footer. */
  tickedCovers: ImproveOption[];
  target?: TargetProfile;
  renderFlyableImplants?: (fix: RejectedOption, label: string) => ReactNode;
  onApply: (options: ImproveOption[]) => void;
  footerTarget?: HTMLElement | null;
}

export function ImproveResults({
  state,
  goal,
  settings,
  labels,
  selection,
  check,
  tickedCovers,
  target,
  renderFlyableImplants,
  onApply,
  footerTarget,
}: Props) {
  const { t } = useTranslation();
  const { result } = state;
  const { chosen, setTicked } = selection;
  const lead = { goal, hold: settings.hold, target };
  const bestFound = bestFoundLine(t, lead, result, state.fitAsIs ?? state.before);
  const makeover = state.makeover;
  const singleGains = useMemo(
    () =>
      makeover
        ? singleGainsOf(makeover.makeover.rows, [...result.noDownside, ...result.tradeOffs])
        : undefined,
    [makeover, result]
  );
  const basisDiffers = crystalBasisOf(state).differs;
  const hintOf = (candidate: { toTypeId: number }) => hintLine(t, state.hints, candidate);
  const list = (options: ImproveOption[], section: string) => (
    <ImproveOptionList
      options={options}
      own={state.before}
      section={section}
      sort={settings.sort}
      labels={labels}
      selection={selection}
      lead={lead}
      hintOf={hintOf}
    />
  );

  return (
    <div className="space-y-4">
      {makeover && (
        <ImproveMakeover
          makeover={makeover.makeover}
          before={state.before}
          ticked={new Set(selection.ticked.keys())}
          onToggle={(keys, checked) =>
            selection.toggleMakeover(
              makeover.options.filter((option) => keys.includes(optionKey(option))),
              checked
            )
          }
          singleGains={singleGains}
          typeName={labels.typeName}
          hintOf={hintOf}
          cautions={cautionLines(t, state.hints)}
          rowCost={(row) =>
            makeover.options.find((option) => option.candidate === row)?.iskDelta ?? null
          }
        />
      )}
      {bestFound && (
        <p className="text-sm" data-testid="improve-best-found">
          <span className="text-text-dim">{t('fittings.improve.bestFound')} </span>
          <span className="font-medium">{bestFound}</span>
          {basisDiffers && (
            <span className="text-text-dim">
              {' '}
              {t('fittings.improve.bestCrystals', {
                ores: (CRYSTAL_FAMILY_ORES[settings.oreFamily] ?? []).join(', '),
              })}
            </span>
          )}
        </p>
      )}
      {result.stopped && (
        <p className="text-text-dim text-xs">
          {t('fittings.improve.partial', { checked: result.checked })}
        </p>
      )}
      <SegmentedControl
        label={t('fittings.improve.sortLabel')}
        options={IMPROVE_SORTS.map((value) => ({
          value,
          label: t(`fittings.improve.sort.${value}`),
        }))}
        value={settings.sort}
        onChange={settings.onSortChange}
        fill
      />
      {(result.makeFlyable.length > 0 || result.flyableBlocked.length > 0) && (
        <MakeItFitSection heading={t('fittings.improve.section.makeFlyable')}>
          {result.makeFlyable.length > 0 && list(result.makeFlyable, 'mf')}
          {renderFlyableImplants &&
            result.flyableOverrun
              .slice(0, FLYABLE_IMPLANT_FIXES)
              .map((fix) => (
                <Fragment key={optionKey(fix)}>
                  {renderFlyableImplants(fix, labels.swapLabel(fix))}
                </Fragment>
              ))}
          {result.flyableBlocked.length > 0 && (
            <ul className="space-y-1">
              {result.flyableBlocked.map((option) => (
                <ImproveBlockedRow
                  key={optionKey(option)}
                  option={option}
                  own={state.before}
                  fitTotal={state.fitTotal}
                  searched={result.flyableOverrun.includes(option)}
                  swapLabel={labels.swapLabel(option)}
                  settings={settings}
                />
              ))}
            </ul>
          )}
        </MakeItFitSection>
      )}
      {result.noDownside.length > 0 && (
        <MakeItFitSection heading={t('fittings.improve.section.noDownside')}>
          {list(result.noDownside, 'nd')}
        </MakeItFitSection>
      )}
      {result.tradeOffs.length > 0 && (
        <MakeItFitSection heading={t('fittings.improve.section.tradeOffs')}>
          {list(result.tradeOffs, 'to')}
        </MakeItFitSection>
      )}
      <ImproveFooter target={footerTarget}>
        {chosen.length > 0 && check.checkable && (
          <ImproveSelectionSummary
            summary={check.summary}
            checked={check.checked}
            iskBudget={settings.iskBudget}
          />
        )}
        {(check.overruns || tickedCovers.length > 0) && (
          <ImproveCoverOffer
            overruns={check.overruns}
            tickedCovers={tickedCovers}
            offered={check.offered}
            foundAny={Boolean(check.covers && check.covers.options.length > 0)}
            setAsFix={check.setAsFix}
            renderFlyableImplants={renderFlyableImplants}
            labels={labels}
            onToggle={selection.toggle}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-text-dim text-xs" data-testid="improve-timing">
            {t('fittings.improve.checked', {
              count: result.checked,
              seconds: (state.elapsedMs / 1000).toFixed(1),
            })}
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={!check.canApply}
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
      </ImproveFooter>
    </div>
  );
}
