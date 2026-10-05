/**
 * The Goal Planner's inputs: what the pilot wants (Goals), what they have
 * (Colonies) and how they operate (Assumptions). Goals lead on a phone, the
 * other two fold into collapsible panels after the results there; on a
 * pointer all three sit in a rail beside the results.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Link } from 'react-router-dom';
import {
  Button,
  Checkbox,
  CollapsiblePanel,
  IconButton,
  InfoTooltip,
  Panel,
  RegionSelect,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  type ControlSize,
} from '@/components/ui';
import { inlineLinkClassName, tappableRowClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { Goal } from '@/engine/pi/goalTypes';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import type { PiCadence } from './cadencePref';
import { customsRatePercent, customsSourceText } from './customsRate';
import { ASSUMED_UNKNOWN_CUSTOMS, type PlannerColonyRow } from './goalPlannerModel';
import { DEFAULT_GOAL_PER_DAY } from './goalsParam';
import type { ProductOption } from './products';
import { SectionLabel, TierChip } from './DirectiveRow';
import { CadenceRow, PercentInput } from './piControls';
import { parseDecimal } from './goalPlannerFormat';

/** How long typing pauses before a units box re-plans. */
const COMMIT_DEBOUNCE_MS = 300;

/**
 * A units box. Text, not `type="number"`, so a comma decimal reads (and the
 * browser never swallows what it cannot parse); committed on Enter, on blur,
 * or once typing pauses — never per digit, since each commit re-plans.
 */
function UnitsBox({
  value,
  onCommit,
  label,
  size,
  className = 'w-20',
  min = 0,
  describedBy,
  id,
}: {
  id?: string;
  value: number;
  onCommit: (value: number) => void;
  label: string;
  size: ControlSize;
  className?: string;
  min?: number;
  describedBy?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const errorId = useId();
  useEffect(() => () => clearTimeout(timer.current), []);

  const settle = (raw: string) => {
    clearTimeout(timer.current);
    const next = parseDecimal(raw);
    const ok = next !== null && next >= min;
    setInvalid(raw.trim() !== '' && !ok);
    if (ok && next !== value) onCommit(next);
  };

  return (
    <span className="inline-flex flex-col">
      <TextInput
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        size={size}
        aria-label={label}
        aria-describedby={
          [describedBy, invalid ? errorId : undefined].filter(Boolean).join(' ') || undefined
        }
        aria-invalid={invalid || undefined}
        className={`${className} text-right tabular-nums ${invalid ? 'border-danger' : ''}`}
        value={text ?? String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          setText(raw);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => settle(raw), COMMIT_DEBOUNCE_MS);
        }}
        onBlur={(event) => {
          settle(event.target.value);
          setText(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') settle(event.currentTarget.value);
        }}
      />
      {invalid && (
        <span id={errorId} className="mt-0.5 text-[0.6875rem] text-danger">
          {t('piPlan.numberInvalid')}
        </span>
      )}
    </span>
  );
}

function excludedText(row: PlannerColonyRow, t: TFunction): string | null {
  switch (row.excluded) {
    case 'no-detail':
      return t('piPlan.colonyExcludedNoDetail');
    case 'no-planet-type':
      return t('piPlan.colonyExcludedNoPlanetType');
    case 'no-link-cost':
      return t('piPlan.colonyExcludedNoLinkCost');
    case null:
      return null;
  }
}

// --- Goals ---------------------------------------------------------------

export function GoalsSection({
  goals,
  products,
  onGoalsChange,
  hubId,
  size,
}: {
  goals: readonly Goal[];
  products: readonly ProductOption[];
  onGoalsChange: (goals: Goal[]) => void;
  hubId: TradeHub['id'];
  size: ControlSize;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const byId = new Map(products.map((product) => [product.typeId, product]));
  const shown = goals.filter((goal) => byId.has(goal.typeId));
  const options = products
    .filter((product) => !goals.some((goal) => goal.typeId === product.typeId))
    .map((product) => ({
      id: product.typeId,
      name: t('piPlan.productOption', { name: product.name, tier: product.tier }),
    }));

  return (
    <Panel
      title={t('piPlan.goalsTitle')}
      meta={<span className="text-[0.6875rem] text-text-dim">{t('piPlan.goalsUnit')}</span>}
    >
      <p id={hintId} className="mb-2 text-xs text-text-dim">
        {shown.length === 0 ? t('piPlan.goalsEmpty') : t('piPlan.goalsHint')}
      </p>
      {shown.length > 0 && (
        <ul className="mb-3 space-y-2" aria-label={t('piPlan.goalsTitle')}>
          {shown.map((goal) => {
            const product = byId.get(goal.typeId)!;
            return (
              <li key={goal.typeId} className="flex items-center gap-2">
                <TierChip tier={product.tier} />
                <span className="min-w-0 flex-1 truncate text-sm text-text">
                  <ItemContextMenu typeId={goal.typeId} itemName={product.name}>
                    <MarketItemLink typeId={goal.typeId} hubId={hubId}>
                      {product.name}
                    </MarketItemLink>
                  </ItemContextMenu>
                </span>
                <UnitsBox
                  value={goal.unitsPerDay}
                  size={size}
                  label={t('piPlan.goalRateLabel', { name: product.name })}
                  describedBy={hintId}
                  onCommit={(unitsPerDay) =>
                    onGoalsChange(
                      goals.map((g) => (g.typeId === goal.typeId ? { ...g, unitsPerDay } : g))
                    )
                  }
                />
                <span className="text-[0.6875rem] text-text-dim">{t('piPlan.perDayUnit')}</span>
                <IconButton
                  icon={<Icon.Close />}
                  label={t('piPlan.goalRemove', { name: product.name })}
                  size="row"
                  onClick={() => onGoalsChange(goals.filter((g) => g.typeId !== goal.typeId))}
                />
              </li>
            );
          })}
        </ul>
      )}
      <RegionSelect
        options={options}
        value={null}
        onChange={(typeId) => {
          if (typeId !== null) {
            onGoalsChange([...goals, { typeId, unitsPerDay: DEFAULT_GOAL_PER_DAY }]);
          }
        }}
        placeholder={t('piPlan.goalAdd')}
        searchPlaceholder={t('piPlan.goalSearch')}
        noResultsLabel={t('piPlan.goalNoResults')}
        aria-label={t('piPlan.goalAdd')}
        size={size}
        className="w-full"
      />
    </Panel>
  );
}

// --- Colonies ------------------------------------------------------------

function ColonyRow({
  row,
  name,
  systemName,
  size,
  onToggle,
  onCustomsChange,
}: {
  row: PlannerColonyRow;
  name: string;
  systemName: string;
  size: ControlSize;
  onToggle: (enabled: boolean) => void;
  onCustomsChange: (percent: number | null) => void;
}) {
  const { t } = useTranslation();
  const excluded = excludedText(row, t);
  const inputId = useId();
  const noteId = useId();
  const assumedPercent = customsRatePercent(ASSUMED_UNKNOWN_CUSTOMS);
  const customsLabel = t('piPlan.colonyCustomsLabel', {
    label: t('piPlan.colonyCustoms'),
    name,
    system: systemName,
  });
  return (
    <li className="space-y-1 border-b border-line pb-2 last:border-b-0 last:pb-0">
      <label className={`flex items-center gap-2 ${tappableRowClassName}`}>
        <Checkbox
          checked={row.enabled}
          disabled={excluded !== null}
          onChange={(event) => onToggle(event.target.checked)}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-text">{name}</span>
          <span className="block text-[0.6875rem] text-text-dim">
            {t('piPlan.colonyFacts', {
              type: t(`pi.planetType.${row.planetType}`),
              level: row.upgradeLevel,
              system: systemName,
            })}
          </span>
        </span>
      </label>
      {excluded ? (
        <p className="flex items-start gap-1.5 pl-6 text-[0.6875rem] text-text-dim">
          <Icon.Info aria-hidden="true" size={Icon.ICON_SIZE.sm} className="mt-px shrink-0" />
          {excluded}
        </p>
      ) : (
        <div className="space-y-1 pl-6">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <label htmlFor={inputId} className="text-xs text-text-dim">
              {t('piPlan.colonyCustoms')}
            </label>
            <PercentInput
              id={inputId}
              commitOn="blur"
              size={size}
              value={row.taxAssumed ? null : customsRatePercent(row.taxRate)}
              placeholder={row.taxAssumed ? String(assumedPercent) : undefined}
              aria-label={customsLabel}
              aria-describedby={noteId}
              onCommit={(percent) => onCustomsChange(percent)}
            />
            <span className="text-[0.6875rem] text-text-dim">%</span>
            <InfoTooltip
              label={t('common.aboutLabel', { label: customsLabel })}
              content={
                row.taxOverridden
                  ? t('piPlan.colonyCustomsOverridden')
                  : customsSourceText(row.taxSource, t)
              }
            />
            {row.taxOverridden && (
              <Button variant="ghost" size="sm" onClick={() => onCustomsChange(null)}>
                {t('piPlan.colonyCustomsReset')}
              </Button>
            )}
          </div>
          <p id={noteId} className="text-[0.6875rem] text-text-dim">
            {row.taxAssumed ? (
              <span className="inline-flex flex-wrap items-center gap-1 text-warning">
                <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                {t('piPlan.colonyCustomsAssumed', { percent: assumedPercent })}
                <button
                  type="button"
                  className={inlineLinkClassName}
                  onClick={() => document.getElementById(inputId)?.focus()}
                >
                  {t('piPlan.colonyCustomsSetIt')}
                </button>
              </span>
            ) : (
              t('piPlan.colonyCustomsSystemWide', { system: systemName })
            )}
          </p>
        </div>
      )}
    </li>
  );
}

export function ColoniesSection({
  rows,
  planetName,
  systemName,
  size,
  expanded,
  onToggleExpanded,
  onToggle,
  onCustomsChange,
}: {
  rows: readonly PlannerColonyRow[];
  planetName: (planetId: number) => string;
  systemName: (systemId: number) => string;
  size: ControlSize;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggle: (planetId: number, enabled: boolean) => void;
  onCustomsChange: (systemId: number, percent: number | null) => void;
}) {
  const { t } = useTranslation();
  const enabled = rows.filter((row) => row.enabled).length;
  return (
    <CollapsiblePanel
      title={t('piPlan.coloniesTitle')}
      meta={
        <span className="text-[0.6875rem] text-text-dim tabular-nums">
          {t('piPlan.coloniesCount', { enabled, total: rows.length })}
        </span>
      }
      expanded={expanded}
      onToggle={onToggleExpanded}
      labels={{ show: t('piPlan.coloniesShow'), hide: t('piPlan.coloniesHide') }}
    >
      {rows.length === 0 ? (
        <p className="text-xs text-text-dim">
          {t('piPlan.coloniesNone')}{' '}
          <Link className={inlineLinkClassName} to="/planetary-industry/advisor">
            {t('piPlan.openAdvisor')}
          </Link>
        </p>
      ) : (
        <ul className="space-y-2" aria-label={t('piPlan.coloniesListLabel')}>
          {rows.map((row) => (
            <ColonyRow
              key={row.planetId}
              row={row}
              name={planetName(row.planetId)}
              systemName={systemName(row.systemId)}
              size={size}
              onToggle={(next) => onToggle(row.planetId, next)}
              onCustomsChange={(percent) => onCustomsChange(row.systemId, percent)}
            />
          ))}
        </ul>
      )}
    </CollapsiblePanel>
  );
}

// --- Assumptions ---------------------------------------------------------

export interface AssumptionsProps {
  hubId: TradeHub['id'];
  onHubChange: (hubId: TradeHub['id']) => void;
  buyP1: boolean;
  onBuyP1Change: (buy: boolean) => void;
  fallbackRate: number;
  onFallbackRateChange: (rate: number) => void;
  /** Whether any colony's rate leans on the fallback — the field shows only then. */
  fallbackInUse: boolean;
  maxP0Types: 1 | 2;
  onMaxP0TypesChange: (value: 1 | 2) => void;
  cadence: PiCadence;
  onCadenceChange: (cadence: PiCadence) => void;
  size: ControlSize;
  expanded: boolean;
  onToggleExpanded: () => void;
}

function Hint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-[0.6875rem] text-text-dim">
      {children}
    </p>
  );
}

export function AssumptionsSection(props: AssumptionsProps) {
  const { t } = useTranslation();
  const hubId = useId();
  const hubHint = useId();
  const buyHint = useId();
  const rateId = useId();
  const rateHint = useId();
  const typesHint = useId();
  const cadenceHint = useId();
  return (
    <CollapsiblePanel
      title={t('piPlan.assumptionsTitle')}
      expanded={props.expanded}
      onToggle={props.onToggleExpanded}
      labels={{ show: t('piPlan.assumptionsShow'), hide: t('piPlan.assumptionsHide') }}
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={hubId} className="block">
            <SectionLabel>{t('piPlan.hub')}</SectionLabel>
          </label>
          <Select
            value={props.hubId}
            onValueChange={(id) => props.onHubChange(id as TradeHub['id'])}
          >
            <SelectTrigger
              id={hubId}
              size={props.size}
              aria-describedby={hubHint}
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TRADE_HUBS.map((hub) => (
                <SelectItem key={hub.id} value={hub.id}>
                  {hub.systemName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Hint id={hubHint}>{t('piPlan.hubHint')}</Hint>
        </div>

        <div className="space-y-1">
          <label className={`flex items-center gap-2 text-xs text-text ${tappableRowClassName}`}>
            <Checkbox
              checked={props.buyP1}
              aria-describedby={buyHint}
              onChange={(event) => props.onBuyP1Change(event.target.checked)}
            />
            {t('piPlan.buyP1')}
          </label>
          <Hint id={buyHint}>{t('piPlan.buyP1Hint')}</Hint>
        </div>

        <div className="space-y-1">
          <SegmentedControl
            label={t('piPlan.maxP0Types')}
            options={[
              { value: '1', label: t('piPlan.maxP0TypesOne') },
              { value: '2', label: t('piPlan.maxP0TypesTwo') },
            ]}
            value={String(props.maxP0Types) as '1' | '2'}
            onChange={(value) => props.onMaxP0TypesChange(value === '1' ? 1 : 2)}
            size={props.size}
            describedBy={typesHint}
            fill
          />
          <Hint id={typesHint}>{t('piPlan.maxP0TypesHint')}</Hint>
        </div>

        <div className="space-y-2">
          <CadenceRow
            label={t('piAdvisor.cadenceRestartLabel')}
            hint={t('piAdvisor.cadenceRestartHint')}
            value={props.cadence.restartDays}
            size={props.size}
            describedBy={cadenceHint}
            onChange={(restartDays) => props.onCadenceChange({ ...props.cadence, restartDays })}
          />
          <CadenceRow
            label={t('piAdvisor.cadenceHaulLabel')}
            hint={t('piAdvisor.cadenceHaulHint')}
            value={props.cadence.haulDays}
            size={props.size}
            describedBy={cadenceHint}
            onChange={(haulDays) => props.onCadenceChange({ ...props.cadence, haulDays })}
          />
          <Hint id={cadenceHint}>{t('piPlan.cadenceHint')}</Hint>
        </div>

        {props.fallbackInUse && (
          <div className="space-y-1">
            <label htmlFor={rateId} className="block">
              <SectionLabel>{t('piPlan.fallbackRate')}</SectionLabel>
            </label>
            <UnitsBox
              id={rateId}
              value={props.fallbackRate}
              size={props.size}
              label={t('piPlan.fallbackRate')}
              className="w-full"
              min={1}
              describedBy={rateHint}
              onCommit={(value) => {
                if (value > 0) props.onFallbackRateChange(value);
              }}
            />
            <Hint id={rateHint}>{t('piPlan.fallbackRateInUse')}</Hint>
          </div>
        )}
      </div>
    </CollapsiblePanel>
  );
}
