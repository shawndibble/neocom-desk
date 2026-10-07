import { tappableRowClassName } from '@/components/ui/controlStyles';
import { OreIcon } from './OreIcon';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  Checkbox,
} from '@/components/ui';
import type { PayeeRecord } from '@/db';
import type { OreLine } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { maskIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { assign } from './ledgerActions';
import { hubForPayee } from './pricing';
import type { MoonMiningTaxRow } from './snapshot';
import type { PayeeSuggestion } from './suggestPayee';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';

interface AssignDialogProps {
  row: MoonMiningTaxRow;
  payees: readonly PayeeRecord[];
  systemName: string;
  typeNames: ReadonlyMap<number, string>;
  /**
   * Unit prices at the trade hub a Payee bills at (`PayeeRecord.hubId`;
   * `undefined` means the default, Jita), on a given date. A lookup rather
   * than one map, because *which* prices apply is decided by this dialog's
   * own Payee selection: the pilot picking a different Payee re-values the
   * same ore. The parent route's snapshot has already fetched every hub its
   * Payees use, for every ore line, across every date any row needs, so this
   * never re-fetches.
   */
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  /** True while a sibling action (Mark as paid / Resolve / Undo) is in flight, so this form's own submit can't race it. */
  busy: boolean;
  onAssigned: () => void;
  onCancel: () => void;
  /** Status-specific buttons (Dismiss / Mark as paid / Resolve) rendered alongside Assign and Cancel — RowDetailModal owns these, since which one applies depends on the row's status, not on this form. */
  extraActions?: ReactNode;
  /** Opens the Payee manager from the no-Payees state. The dialog stays mounted underneath, so the form appears in place once a Payee exists. */
  onAddPayee?: () => void;
  /**
   * Which Payee this entry most likely belongs to, from the pilot's own
   * history in its system (`suggestPayeeForSystem`) — pre-selected, and
   * the order the Payee list is offered in.
   */
  suggestion?: PayeeSuggestion;
}

/** Rounds to the cent — what the editable ISK fields below prefill and display, since a raw float in a number input reads as noise. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface IskFieldProps {
  ariaLabel: string;
  computedDefault: number;
  /** Empty means "track `computedDefault`"; anything else is the pilot's own text, commas and all. */
  override: string;
  onOverrideChange: (raw: string) => void;
}

/**
 * The estimated-value/tax-owed fields: grouped digits at rest (`maskIsk`,
 * up to 2 decimals, none padded on) and the plain figure to type into, same
 * split `numberMask.ts`'s `SourcingInput` uses — reformatting on every
 * keystroke would fight the caret. `unmaskNumber` accepts what's typed or
 * pasted with or without its own commas.
 */
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
            ? String(round2(computedDefault))
            : override
          : maskIsk(round2(effectiveValue))
      }
      onFocus={() => setEditing(true)}
      onChange={(e) => onOverrideChange(e.target.value)}
      onBlur={() => setEditing(false)}
    />
  );
}

/**
 * The Assign form (decision doc, and issue #523's row-detail merge): picks a
 * Payee for some or all of an entry's still-unassigned ore and creates a new
 * Assignment for it. Create-only — correcting an existing Assignment's Payee/
 * tax %/value/tax owed happens in `EntryEditDialog`, not here.
 *
 * Line checkboxes are the split-Payee mechanism: uncheck a line to leave it
 * for a second Assignment against a different Payee, the two-corps-one-
 * system-one-day case ESI itself cannot distinguish. Line membership is what
 * the sole-vs-split ownership rule (`engine/miningTax/rowStatus.ts`) keys off.
 *
 * Tax %, estimated value, and tax owed are prefilled from
 * `computeAssignmentValue`, but all three stay connected (`taxOwed =
 * estimatedValue * taxPct / 100`) as the pilot edits: changing tax % or
 * estimated value recomputes tax owed from the other two; changing tax owed
 * instead back-solves the estimated value, since tax % is the one figure a
 * pilot is unlikely to be correcting *from* a known tax-owed total. Clearing
 * a field back to empty returns both value fields to tracking their freshly
 * computed defaults.
 *
 * The ore is valued at the *selected* Payee's trade hub, re-derived on every
 * render rather than fetched: picking a different Payee can change what the
 * same ore is worth, because the hub belongs to the Payee (the figure is a
 * bill one player sends another, not a local viewing preference).
 *
 * "I already paid this" creates the Assignment already marked Paid, for ore
 * the pilot settled before recording it here.
 */
export function AssignDialog({
  row,
  payees,
  systemName,
  typeNames,
  pricesFor,
  busy,
  onAssigned,
  onCancel,
  extraActions,
  onAddPayee,
  suggestion,
}: AssignDialogProps) {
  const { t } = useTranslation();
  const oreLines = row.unassignedOreLines;

  // The Payee the pilot last used in this system (scope decision 20261004),
  // falling back to one remembered for it. Still never `payees[0]`: with no
  // history here at all, pre-selecting an arbitrary Payee would let a pilot
  // in a hurry create a real Assignment against one they never chose.
  const autoMatch =
    suggestion?.suggested ?? payees.find((p) => p.systemId === row.entry.solarSystemId);
  const orderedPayees = suggestion ? suggestion.ranked : payees;
  const [payeeId, setPayeeId] = useState<string | null>(autoMatch?.id ?? null);
  const [taxPct, setTaxPct] = useState(String(autoMatch?.defaultTaxPct ?? ''));
  const [includedTypeIds, setIncludedTypeIds] = useState<ReadonlySet<number>>(
    new Set(oreLines.map((line) => line.typeId))
  );
  const [markPaid, setMarkPaid] = useState(false);
  const { pending: saving, error: saveError, run } = useLedgerAction();
  // Empty means "track the computed default"; any other string is a pilot
  // override that stops following `taxPct`/line-selection changes until
  // cleared back to empty.
  const [estimatedValueOverride, setEstimatedValueOverride] = useState('');
  const [taxOwedOverride, setTaxOwedOverride] = useState('');

  // No reset-on-reopen effect: `RowDetailModal` only ever renders one of
  // these at a time, keyed off `detailTarget` going from `null` to a row, so
  // this component remounts fresh (new `useState` initializers) every time
  // it opens for a (possibly different) row rather than being reused in place.

  const selectedLines: OreLine[] = useMemo(
    () => oreLines.filter((line) => includedTypeIds.has(line.typeId)),
    [oreLines, includedTypeIds]
  );
  const pctValue = Number(taxPct);
  const selectedPayee = payees.find((p) => p.id === payeeId) ?? null;
  // Before a Payee is picked there is no hub to bill against, so the preview
  // shows the default one's figure — the same basis the row's Value column
  // already used for still-unassigned ore.
  const hub = hubForPayee(selectedPayee?.hubId);
  const prices = pricesFor(selectedPayee?.hubId, row.entry.date);

  const computed = computeAssignmentValue(
    selectedLines,
    prices,
    Number.isFinite(pctValue) ? pctValue : 0
  );

  const estimatedValue =
    estimatedValueOverride.trim() === ''
      ? computed.estimatedValue
      : (unmaskNumber(estimatedValueOverride) ?? NaN);
  // Tracks the *current* estimated value and tax %, not the raw hub-priced
  // default — so an edit to either one keeps this field's display in sync
  // (the three fields are connected: taxOwed = estimatedValue * pct / 100).
  const taxOwed =
    taxOwedOverride.trim() === ''
      ? (estimatedValue * (Number.isFinite(pctValue) ? pctValue : 0)) / 100
      : (unmaskNumber(taxOwedOverride) ?? NaN);

  function toggleLine(typeId: number) {
    setIncludedTypeIds((previous) => {
      const next = new Set(previous);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }

  /** Tax % changed: recompute tax owed from the *current* estimated value, leaving that value itself untouched. */
  function handleTaxPctChange(raw: string) {
    setTaxPct(raw);
    const pct = Number(raw);
    if (Number.isFinite(pct)) {
      setTaxOwedOverride(String(round2((estimatedValue * pct) / 100)));
    }
  }

  /** Estimated value changed: recompute tax owed from the new value and the current tax %. Clearing back to empty resumes tracking both defaults. */
  function handleEstimatedValueChange(raw: string) {
    setEstimatedValueOverride(raw);
    if (raw.trim() === '') {
      setTaxOwedOverride('');
      return;
    }
    const newValue = unmaskNumber(raw);
    if (newValue !== undefined && Number.isFinite(pctValue)) {
      setTaxOwedOverride(String(round2((newValue * pctValue) / 100)));
    }
  }

  /** Tax owed changed: back-solve the estimated value from the current tax %, leaving the rate itself untouched. Clearing back to empty resumes tracking both defaults. */
  function handleTaxOwedChange(raw: string) {
    setTaxOwedOverride(raw);
    if (raw.trim() === '') {
      setEstimatedValueOverride('');
      return;
    }
    const newTaxOwed = unmaskNumber(raw);
    if (newTaxOwed !== undefined && Number.isFinite(pctValue) && pctValue !== 0) {
      setEstimatedValueOverride(String(round2(newTaxOwed / (pctValue / 100))));
    }
  }

  async function handleAssign() {
    if (!canAssign || !payeeId) return;
    // A stale row (something else already claimed this ore) also lands on
    // `onAssigned`: the refresh shows the Assignment that exists.
    await run(
      () =>
        assign({
          characterId: row.characterId,
          date: row.entry.date,
          solarSystemId: row.entry.solarSystemId,
          payeeId,
          oreLines: selectedLines,
          entryOreLines: row.entry.oreLines,
          taxPct: pctValue,
          estimatedValue,
          taxOwed,
          markPaid,
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
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.payeeLabel')}
        </p>
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
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.oreLinesLabel')}
          </p>
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
                  <MarketItemLink typeId={line.typeId}>
                    {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                  </MarketItemLink>
                </span>
                <span className="tabular-nums text-text-dim">{line.quantity.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          <p className="text-[0.6875rem] text-text-dim">{t('miningTax.splitHint')}</p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Narrow and fixed: a tax rate is a percentage, realistically
            2 digits (rarely a decimal), so it never needs the room the
            two ISK fields do. */}
        <div className="space-y-1 sm:w-16 sm:shrink-0">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.taxPctLabel')}
          </p>
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
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.estimatedValueLabel')}
          </p>
          <IskField
            ariaLabel={t('miningTax.estimatedValueLabel')}
            computedDefault={computed.estimatedValue}
            override={estimatedValueOverride}
            onOverrideChange={handleEstimatedValueChange}
          />
          {/* Only for a Payee billing somewhere other than the default: at
              Jita this would be a line of standing noise, anywhere else it is
              the explanation for a figure that doesn't match the ledger's
              own Value column. Deliberately a statement about the *Payee*,
              not about the number above it: once the pilot types their own
              figure, "valued at X" would contradict the field it sits
              under. */}
          {hub.id !== DEFAULT_TRADE_HUB.id && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('miningTax.valuedAtHubHint', { hub: hub.systemName })}
            </p>
          )}
        </div>

        <div className="min-w-0 space-y-1 sm:flex-1">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.taxOwedLabel')}
          </p>
          <IskField
            ariaLabel={t('miningTax.taxOwedLabel')}
            computedDefault={(estimatedValue * (Number.isFinite(pctValue) ? pctValue : 0)) / 100}
            override={taxOwedOverride}
            onOverrideChange={handleTaxOwedChange}
          />
        </div>
      </div>

      <label className={`flex items-center gap-2 text-sm ${tappableRowClassName}`}>
        <Checkbox checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
        {t('miningTax.markPaidLabel')}
      </label>

      <LedgerActionError error={saveError} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          variant="primary"
          size="sm"
          disabled={!canAssign || saving || busy}
          onClick={() => void handleAssign()}
        >
          {selectedPayee && Number.isFinite(taxOwed)
            ? t('miningTax.assignToAction', {
                payee: selectedPayee.name,
                amount: maskIsk(Math.round(taxOwed)),
              })
            : t('miningTax.assignAction')}
        </Button>
        {extraActions}
        <Button size="sm" onClick={onCancel}>
          {t('filters.cancel')}
        </Button>
      </div>
    </div>
  );
}
