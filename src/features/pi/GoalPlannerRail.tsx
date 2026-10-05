/**
 * The Goal Planner's inputs: what the pilot wants (Goals), what they have
 * (Colonies) and how they operate (Assumptions). A rail beside the results on
 * a pointer, stacked above them on a phone — DOM order, so the phone reads
 * the inputs first, as the old Plan tab did.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Button,
  Checkbox,
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
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { TFunction } from 'i18next';
import type { Goal } from '@/engine/pi/goalTypes';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { PI_CADENCE_DAYS, type PiCadence, type PiCadenceDays } from './cadencePref';
import { customsRatePercent, type CustomsRateSource } from './customsRate';
import type { PlannerColonyRow } from './goalPlannerModel';
import type { ProductOption } from './products';
import { TierChip } from './TierChip';

function parseNonNegative(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * A number box that holds what is typed while it has focus. Rendering the
 * parsed value straight back made decimals unreachable — "12." parses to 12
 * and React restores "12" — the reason the Advisor's customs box holds its
 * text the same way.
 */
function NumberBox({
  value,
  onCommit,
  label,
  className = 'w-20',
  min = 0,
  step,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
  label: string;
  className?: string;
  min?: number;
  step?: number;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <TextInput
      type="number"
      inputMode="decimal"
      size="sm"
      min={min}
      step={step}
      aria-label={label}
      className={`${className} text-right tabular-nums`}
      value={text ?? (value === null ? '' : String(value))}
      onFocus={() => setText(value === null ? '' : String(value))}
      onBlur={() => setText(null)}
      onChange={(event) => {
        setText(event.target.value);
        onCommit(parseNonNegative(event.target.value));
      }}
    />
  );
}

/** A labelled control. The hint sits outside the `<label>` so it is not folded into the name. */
function RailField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="block space-y-1">
        <span className="block text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {label}
        </span>
        {children}
      </label>
      {hint && <p className="text-[0.6875rem] text-text-dim">{hint}</p>}
    </div>
  );
}

function customsSourceText(source: CustomsRateSource, t: TFunction): string {
  switch (source.kind) {
    case 'highsec-skill':
      return t('piAdvisor.customsRateSource.highsec-skill', { level: source.level });
    case 'highsec-unknown-skill':
      return t('piAdvisor.customsRateSource.highsec-unknown-skill');
    case 'player-poco':
      return t('piAdvisor.customsRateSource.player-poco', {
        space: t(`common.spaceOption.${source.space}`),
      });
  }
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

function GoalRow({
  goal,
  name,
  tier,
  onRateChange,
  onRemove,
}: {
  goal: Goal;
  name: string;
  tier: number;
  onRateChange: (unitsPerDay: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-center gap-2">
      <TierChip tier={tier} />
      <span className="min-w-0 flex-1 truncate text-sm text-text">{name}</span>
      <NumberBox
        value={goal.unitsPerDay}
        label={t('piPlan.goalRateLabel', { name })}
        onCommit={(value) => onRateChange(value ?? 0)}
      />
      <span className="text-[0.6875rem] text-text-dim">{t('piPlan.perDayUnit')}</span>
      <IconButton
        icon={<Icon.Close />}
        label={t('piPlan.goalRemove', { name })}
        size="sm"
        onClick={onRemove}
      />
    </li>
  );
}

export function GoalsSection({
  goals,
  products,
  onGoalsChange,
}: {
  goals: readonly Goal[];
  products: readonly ProductOption[];
  onGoalsChange: (goals: Goal[]) => void;
}) {
  const { t } = useTranslation();
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
      {shown.length === 0 ? (
        <p className="mb-2 text-xs text-text-dim">{t('piPlan.goalsEmpty')}</p>
      ) : (
        <ul className="mb-3 space-y-2" aria-label={t('piPlan.goalsTitle')}>
          {shown.map((goal) => {
            const product = byId.get(goal.typeId)!;
            return (
              <GoalRow
                key={goal.typeId}
                goal={goal}
                name={product.name}
                tier={product.tier}
                onRateChange={(unitsPerDay) =>
                  onGoalsChange(
                    goals.map((g) => (g.typeId === goal.typeId ? { ...g, unitsPerDay } : g))
                  )
                }
                onRemove={() => onGoalsChange(goals.filter((g) => g.typeId !== goal.typeId))}
              />
            );
          })}
        </ul>
      )}
      <RegionSelect
        options={options}
        value={null}
        onChange={(typeId) => {
          if (typeId !== null) onGoalsChange([...goals, { typeId, unitsPerDay: 10 }]);
        }}
        placeholder={t('piPlan.goalAdd')}
        searchPlaceholder={t('piPlan.goalSearch')}
        noResultsLabel={t('piPlan.goalNoResults')}
        aria-label={t('piPlan.goalAdd')}
        size="sm"
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
  onToggle,
  onCustomsChange,
}: {
  row: PlannerColonyRow;
  name: string;
  systemName: string;
  onToggle: (enabled: boolean) => void;
  onCustomsChange: (percent: number | null) => void;
}) {
  const { t } = useTranslation();
  const excluded = excludedText(row, t);
  const percent = customsRatePercent(row.taxRate);
  return (
    <li className="space-y-1.5 border-b border-line pb-2.5 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-2">
        <Checkbox
          className="mt-0.5"
          checked={row.enabled}
          disabled={excluded !== null}
          onChange={(event) => onToggle(event.target.checked)}
          aria-label={t('piPlan.colonyToggle', { name })}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-text">{name}</div>
          <div className="text-[0.6875rem] text-text-dim">
            {t('piPlan.colonyFacts', {
              type: t(`pi.planetType.${row.planetType}`),
              level: row.upgradeLevel,
              system: systemName,
            })}
          </div>
        </div>
      </div>
      {excluded ? (
        <p className="flex items-start gap-1.5 pl-6 text-[0.6875rem] text-text-dim">
          <Icon.Info aria-hidden="true" size={Icon.ICON_SIZE.sm} className="mt-px shrink-0" />
          {excluded}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
          <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('piPlan.colonyCustoms')}
          </span>
          <NumberBox
            value={percent}
            className="w-16"
            step={0.5}
            label={t('piPlan.colonyCustomsLabel', { system: systemName })}
            onCommit={(value) => {
              if (value !== null && value <= 100) onCustomsChange(value);
            }}
          />
          <span className="text-[0.6875rem] text-text-dim">%</span>
          <InfoTooltip
            label={t('common.aboutLabel', {
              label: t('piPlan.colonyCustomsLabel', { system: systemName }),
            })}
            content={`${
              row.taxOverridden
                ? t('piPlan.colonyCustomsOverridden')
                : customsSourceText(row.taxSource, t)
            } ${t('piPlan.colonyCustomsSystemWide', { system: systemName })}`}
          />
          {row.taxOverridden && (
            <Button variant="ghost" size="sm" onClick={() => onCustomsChange(null)}>
              {t('piPlan.colonyCustomsReset')}
            </Button>
          )}
          {row.rateUnknown && (
            <span className="inline-flex items-center gap-1 text-[0.6875rem] text-warning">
              <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
              {t('piPlan.colonyCustomsUnknown')}
            </span>
          )}
        </div>
      )}
    </li>
  );
}

export function ColoniesSection({
  rows,
  planetName,
  systemName,
  onToggle,
  onCustomsChange,
}: {
  rows: readonly PlannerColonyRow[];
  planetName: (planetId: number) => string;
  systemName: (systemId: number) => string;
  onToggle: (planetId: number, enabled: boolean) => void;
  onCustomsChange: (systemId: number, percent: number | null) => void;
}) {
  const { t } = useTranslation();
  const enabled = rows.filter((row) => row.enabled).length;
  return (
    <Panel
      title={t('piPlan.coloniesTitle')}
      meta={
        <span className="text-[0.6875rem] text-text-dim tabular-nums">
          {t('piPlan.coloniesCount', { enabled, total: rows.length })}
        </span>
      }
    >
      {rows.length === 0 ? (
        <p className="text-xs text-text-dim">
          {t('piPlan.coloniesNone')}{' '}
          <Link className="text-accent hover:underline" to="/planetary-industry/advisor">
            {t('piPlan.openAdvisor')}
          </Link>
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <ColonyRow
              key={row.planetId}
              row={row}
              name={planetName(row.planetId)}
              systemName={systemName(row.systemId)}
              onToggle={(next) => onToggle(row.planetId, next)}
              onCustomsChange={(percent) => onCustomsChange(row.systemId, percent)}
            />
          ))}
        </ul>
      )}
    </Panel>
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
  /** Whether any colony's rate leans on the fallback — says when the box matters. */
  fallbackInUse: boolean;
  maxP0Types: 1 | 2;
  onMaxP0TypesChange: (value: 1 | 2) => void;
  cadence: PiCadence;
  onCadenceChange: (cadence: PiCadence) => void;
}

function CadenceSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PiCadenceDays;
  onChange: (days: PiCadenceDays) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-text">{label}</span>
      <Select
        value={String(value)}
        onValueChange={(next) => onChange(Number(next) as PiCadenceDays)}
      >
        <SelectTrigger size="sm" aria-label={label} className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PI_CADENCE_DAYS.map((days) => (
            <SelectItem key={days} value={String(days)}>
              {t('piAdvisor.cadenceDays', { count: days })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AssumptionsSection(props: AssumptionsProps) {
  const { t } = useTranslation();
  return (
    <Panel title={t('piPlan.assumptionsTitle')}>
      <div className="space-y-3">
        <RailField label={t('piPlan.hub')} hint={t('piPlan.hubHint')}>
          <Select
            value={props.hubId}
            onValueChange={(id) => props.onHubChange(id as TradeHub['id'])}
          >
            <SelectTrigger size="sm" aria-label={t('piPlan.hub')} className="w-full">
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
        </RailField>

        <div className="space-y-1">
          <label className="flex items-start gap-2 text-xs text-text">
            <Checkbox
              className="mt-0.5"
              checked={props.buyP1}
              onChange={(event) => props.onBuyP1Change(event.target.checked)}
            />
            {t('piPlan.buyP1')}
          </label>
          <p className="pl-6 text-[0.6875rem] text-text-dim">{t('piPlan.buyP1Hint')}</p>
        </div>

        <RailField
          label={t('piPlan.fallbackRate')}
          hint={
            props.fallbackInUse ? t('piPlan.fallbackRateInUse') : t('piPlan.fallbackRateUnused')
          }
        >
          <NumberBox
            value={props.fallbackRate}
            label={t('piPlan.fallbackRate')}
            className="w-full"
            min={1}
            step={500}
            onCommit={(value) => {
              if (value !== null && value > 0) props.onFallbackRateChange(value);
            }}
          />
        </RailField>

        <div className="space-y-1">
          <SegmentedControl
            label={t('piPlan.maxP0Types')}
            options={[
              { value: '1', label: t('piPlan.maxP0TypesOne') },
              { value: '2', label: t('piPlan.maxP0TypesTwo') },
            ]}
            value={String(props.maxP0Types) as '1' | '2'}
            onChange={(value) => props.onMaxP0TypesChange(value === '1' ? 1 : 2)}
            size="sm"
            fill
          />
          <p className="text-[0.6875rem] text-text-dim">{t('piPlan.maxP0TypesHint')}</p>
        </div>

        <div className="space-y-2">
          <CadenceSelect
            label={t('piAdvisor.cadenceRestartLabel')}
            value={props.cadence.restartDays}
            onChange={(restartDays) => props.onCadenceChange({ ...props.cadence, restartDays })}
          />
          <CadenceSelect
            label={t('piAdvisor.cadenceHaulLabel')}
            value={props.cadence.haulDays}
            onChange={(haulDays) => props.onCadenceChange({ ...props.cadence, haulDays })}
          />
          <p className="text-[0.6875rem] text-text-dim">{t('piPlan.cadenceHint')}</p>
        </div>
      </div>
    </Panel>
  );
}
