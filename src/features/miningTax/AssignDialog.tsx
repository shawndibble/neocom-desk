import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { typeLabels } from './typeLabels';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { OreIcon, OreLink } from './OreIcon';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSurveyPayeeId } from './surveyPayeePref';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  Checkbox,
  LiveNote,
  Tooltip,
} from '@/components/ui';
import type { PayeeRecord } from '@/db';
import { defaultPayeeForSystem } from '@/engine/miningTax/defaultSystems';
import type { OreLine } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { maskIsk, roundIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { assign } from './ledgerActions';
import { hubForPayee } from './pricing';
import type { MoonMiningTaxRow } from './snapshot';
import type { PayeeSuggestion } from './suggestPayee';
import { useLedgerAction } from './useLedgerAction';
import { LabelField } from './LabelField';
import { LedgerActionError } from './LedgerActionError';
import { toggleInSet } from '@/lib/sets';
import { formatCount } from '@/lib/formatCount';

interface AssignDialogProps {
  row: MoonMiningTaxRow;
  payees: readonly PayeeRecord[];
  systemName: string;
  typeNames: ReadonlyMap<number, string>;
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  unreachableHubs?: ReadonlySet<string>;
  busy: boolean;
  onAssigned: () => void;
  onCancel: () => void;
  extraActions?: ReactNode;
  onAddPayee?: () => void;
  suggestion?: PayeeSuggestion;
}

interface IskFieldProps {
  ariaLabel: string;
  computedDefault: number;
  override: string;
  onOverrideChange: (raw: string) => void;
}

function IskField({ ariaLabel, computedDefault, override, onOverrideChange }: IskFieldProps) {
  const [editing, setEditing] = useState(false);
  const effectiveValue =
    override.trim() === '' ? computedDefault : (unmaskNumber(override) ?? computedDefault);
  return (
    <TextInput
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      className="w-full"
      value={
        editing
          ? override === ''
            ? String(roundIsk(computedDefault))
            : override
          : maskIsk(roundIsk(effectiveValue))
      }
      onFocus={() => setEditing(true)}
      onChange={(e) => onOverrideChange(e.target.value)}
      onBlur={() => setEditing(false)}
    />
  );
}

export function AssignDialog({
  row,
  payees,
  systemName,
  typeNames,
  pricesFor,
  unreachableHubs,
  busy,
  onAssigned,
  onCancel,
  extraActions,
  onAddPayee,
  suggestion,
}: AssignDialogProps) {
  const { t } = useTranslation();
  const oreLines = row.unassignedOreLines;

  const surveyPayeeId = useSurveyPayeeId((state) => state.value);
  const autoMatch =
    (suggestion?.fromHistory ? suggestion.suggested : undefined) ??
    payees.find((p) => p.id === surveyPayeeId) ??
    defaultPayeeForSystem(payees, row.characterId, row.entry.solarSystemId);
  const orderedPayees = suggestion ? suggestion.ranked : payees;
  const [payeeId, setPayeeId] = useState<string | null>(autoMatch?.id ?? null);
  const [taxPct, setTaxPct] = useState(String(autoMatch?.defaultTaxPct ?? ''));
  const [includedTypeIds, setIncludedTypeIds] = useState<ReadonlySet<number>>(
    new Set(oreLines.map((line) => line.typeId))
  );
  const [label, setLabel] = useState('');
  const { pending: saving, error: saveError, run } = useLedgerAction();
  const [estimatedValueOverride, setEstimatedValueOverride] = useState('');
  const [taxOwedOverride, setTaxOwedOverride] = useState('');

  const selectedLines: OreLine[] = useMemo(
    () => oreLines.filter((line) => includedTypeIds.has(line.typeId)),
    [oreLines, includedTypeIds]
  );
  const pctValue = Number(taxPct);
  const selectedPayee = payees.find((p) => p.id === payeeId) ?? null;
  const hub = hubForPayee(selectedPayee?.hubId);
  const prices = pricesFor(selectedPayee?.hubId, row.entry.date);

  const computed = computeAssignmentValue(
    selectedLines,
    prices,
    Number.isFinite(pctValue) ? pctValue : 0
  );

  const unpricedOffline = unreachableHubs?.has(hub.id)
    ? selectedLines.filter((line) => (prices.get(line.typeId) ?? 0) <= 0)
    : [];
  const warnUnpricedOffline = unpricedOffline.length > 0 && estimatedValueOverride.trim() === '';

  const estimatedValue =
    estimatedValueOverride.trim() === ''
      ? computed.estimatedValue
      : (unmaskNumber(estimatedValueOverride) ?? NaN);
  const taxOwed =
    taxOwedOverride.trim() === ''
      ? (estimatedValue * (Number.isFinite(pctValue) ? pctValue : 0)) / 100
      : (unmaskNumber(taxOwedOverride) ?? NaN);

  function toggleLine(typeId: number) {
    setIncludedTypeIds((previous) => toggleInSet(previous, typeId));
  }

  function handleTaxPctChange(raw: string) {
    setTaxPct(raw);
    const pct = Number(raw);
    if (Number.isFinite(pct)) {
      setTaxOwedOverride(String(roundIsk((estimatedValue * pct) / 100)));
    }
  }

  function handleEstimatedValueChange(raw: string) {
    setEstimatedValueOverride(raw);
    if (raw.trim() === '') {
      setTaxOwedOverride('');
      return;
    }
    const newValue = unmaskNumber(raw);
    if (newValue !== undefined && Number.isFinite(pctValue)) {
      setTaxOwedOverride(String(roundIsk((newValue * pctValue) / 100)));
    }
  }

  function handleTaxOwedChange(raw: string) {
    setTaxOwedOverride(raw);
    if (raw.trim() === '') {
      setEstimatedValueOverride('');
      return;
    }
    const newTaxOwed = unmaskNumber(raw);
    if (newTaxOwed !== undefined && Number.isFinite(pctValue) && pctValue !== 0) {
      setEstimatedValueOverride(String(roundIsk(newTaxOwed / (pctValue / 100))));
    }
  }

  async function handleAssign() {
    if (!canAssign || !payeeId) return;
    await run(
      () =>
        assign({
          characterId: row.characterId,
          date: row.entry.date,
          solarSystemId: row.entry.solarSystemId,
          payeeId,
          oreLines: selectedLines,
          entryOreLines: row.entry.oreLines,
          releasedTypeIds: (row.bookTakenOreLines ?? []).map((l) => l.typeId),
          taxPct: pctValue,
          estimatedValue,
          taxOwed,
          label,
        }),
      onAssigned
    );
  }

  const canAssign =
    payeeId !== null &&
    selectedLines.length > 0 &&
    Number.isFinite(pctValue) &&
    pctValue >= 0 &&
    pctValue <= 100 &&
    Number.isFinite(estimatedValue) &&
    estimatedValue >= 0 &&
    Number.isFinite(taxOwed) &&
    taxOwed >= 0;

  if (payees.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-text-dim">{t('miningTax.noPayeesHint')}</p>
        {onAddPayee && (
          <Button size="sm" onClick={onAddPayee}>
            {t('miningTax.addPayee')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className={eyebrowClassName}>{t('miningTax.payeeLabel')}</p>
        <Select
          value={payeeId ?? undefined}
          onValueChange={(value) => {
            setPayeeId(value);
            const selected = payees.find((p) => p.id === value);
            if (selected) setTaxPct(String(selected.defaultTaxPct));
          }}
        >
          <SelectTrigger aria-label={t('miningTax.payeeLabel')}>
            <SelectValue placeholder={t('miningTax.payeePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {orderedPayees.map((payee) => (
              <SelectItem key={payee.id} value={payee.id}>
                {payee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {suggestion?.fromHistory && autoMatch && payeeId === autoMatch.id && (
        <p className="text-[0.6875rem] text-text-dim">
          {t('miningTax.suggestedPayeeHint', { system: systemName })}
        </p>
      )}

      {oreLines.length > 1 && (
        <div className="space-y-1">
          <p className={eyebrowClassName}>{t('miningTax.oreLinesLabel')}</p>
          <ul className="divide-y divide-line">
            {oreLines.map((line) => (
              <li
                key={line.typeId}
                className="flex items-center gap-1.5 py-1 text-sm first:pt-0 last:pb-0"
              >
                <label
                  htmlFor={`line-${line.typeId}`}
                  className={`flex shrink-0 items-center gap-1.5 ${tappableRowClassName}`}
                >
                  <Checkbox
                    id={`line-${line.typeId}`}
                    checked={includedTypeIds.has(line.typeId)}
                    onChange={() => toggleLine(line.typeId)}
                    aria-label={t('miningTax.includeLineLabel', {
                      ore: typeNames.get(line.typeId) ?? `#${line.typeId}`,
                    })}
                  />
                  <OreIcon typeId={line.typeId} size={32} className="h-4 w-4 shrink-0" />
                </label>
                <span className="w-40 shrink-0 truncate">
                  <OreLink typeId={line.typeId}>
                    {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                  </OreLink>
                </span>
                <span className="tabular-nums text-text-dim">{formatCount(line.quantity)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[0.6875rem] text-text-dim">{t('miningTax.splitHint')}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="space-y-1 sm:w-16 sm:shrink-0">
          <p className={eyebrowClassName}>{t('miningTax.taxPctLabel')}</p>
          <TextInput
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={taxPct}
            onChange={(e) => handleTaxPctChange(e.target.value)}
            aria-label={t('miningTax.taxPctLabel')}
            className="w-full"
          />
        </div>

        <div className="min-w-0 space-y-1 sm:flex-1">
          <p className={eyebrowClassName}>{t('miningTax.estimatedValueLabel')}</p>
          <IskField
            ariaLabel={t('miningTax.estimatedValueLabel')}
            computedDefault={computed.estimatedValue}
            override={estimatedValueOverride}
            onOverrideChange={handleEstimatedValueChange}
          />
          {hub.id !== DEFAULT_TRADE_HUB.id && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('miningTax.valuedAtHubHint', { hub: hub.systemName })}
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-1 sm:flex-1">
          <p className={eyebrowClassName}>{t('miningTax.taxOwedLabel')}</p>
          <IskField
            ariaLabel={t('miningTax.taxOwedLabel')}
            computedDefault={(estimatedValue * (Number.isFinite(pctValue) ? pctValue : 0)) / 100}
            override={taxOwedOverride}
            onOverrideChange={handleTaxOwedChange}
          />
        </div>
      </div>

      <LabelField value={label} onChange={setLabel} />

      {warnUnpricedOffline && (
        <LiveNote className="text-xs text-warning">
          {t('miningTax.assignUnpricedOfflineWarning', {
            types: typeLabels(
              unpricedOffline.map((line) => line.typeId),
              typeNames
            ),
          })}
        </LiveNote>
      )}
      <LedgerActionError error={saveError} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Tooltip content={!canAssign ? t('common.needsInput') : null}>
          <Button
            variant="primary"
            size="sm"
            loading={saving || busy}
            aria-disabled={!canAssign || undefined}
            onClick={() => void handleAssign()}
          >
            {warnUnpricedOffline
              ? t('miningTax.assignAnywayAction')
              : selectedPayee && Number.isFinite(taxOwed)
                ? t('miningTax.assignToAction', {
                    payee: selectedPayee.name,
                    amount: maskIsk(Math.round(taxOwed)),
                  })
                : t('miningTax.assignAction')}
          </Button>
        </Tooltip>
        {extraActions}
        <Button size="sm" onClick={onCancel}>
          {t('filters.cancel')}
        </Button>
      </div>
    </div>
  );
}
