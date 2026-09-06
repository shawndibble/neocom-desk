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
} from '@/components/ui';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { OreLine } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { typeIconUrl } from '@/lib/eveImages';
import { maskIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { createAssignment, updateAssignment } from './assignments';
import { updatePayee } from './payees';
import type { MoonMiningTaxRow } from './snapshot';

interface AssignDialogProps {
  row: MoonMiningTaxRow;
  /** `null` creates a new Assignment for the row's still-unassigned ore; an existing record edits that Assignment's Payee/tax%/value/tax owed in place. */
  assignment: MiningTaxAssignmentRecord | null;
  payees: readonly PayeeRecord[];
  systemName: string;
  typeNames: ReadonlyMap<number, string>;
  /** Jita unit prices, already fetched by the parent route's snapshot load for every ore line across every row — a strict superset of what this dialog needs, so it reads this instead of re-fetching. */
  unitPrices: ReadonlyMap<number, number>;
  /** True while a sibling action (Mark as paid / Resolve / Undo) is in flight, so this form's own submit can't race it. */
  busy: boolean;
  onAssigned: () => void;
  onCancel: () => void;
  /** Status-specific buttons (Dismiss / Mark as paid / Resolve) rendered alongside Assign and Cancel — RowDetailModal owns these, since which one applies depends on the row's status, not on this form. */
  extraActions?: ReactNode;
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
 * The Assign/edit form (decision doc, and issue #523's row-detail merge):
 * one form serves both "pick a Payee for some or all of an entry's
 * still-unassigned ore" (`assignment === null`) and "correct an existing
 * Assignment's Payee/tax %/value/tax owed" (`assignment` given) — the same
 * four fields either way, so a pilot who opens a row for either reason lands
 * on the same editable view rather than a separate read-only stop first.
 *
 * Line checkboxes (the split-Payee mechanism — uncheck a line to leave it for
 * a second Assignment against a different Payee, the two-corps-one-system-
 * one-day case ESI itself cannot distinguish) only apply when creating: an
 * existing Assignment's `oreLines` stay fixed here, since line membership is
 * what the sole-vs-split ownership rule (`engine/miningTax/rowStatus.ts`)
 * keys off — resplitting a record happens through Undo + a fresh Assign, not
 * this edit.
 *
 * Tax %, estimated value, and tax owed are prefilled — from
 * `computeAssignmentValue` when creating, from the stored Assignment when
 * editing — but all three stay connected (`taxOwed = estimatedValue * taxPct
 * / 100`) as the pilot edits: changing tax % or estimated value recomputes
 * tax owed from the other two; changing tax owed instead back-solves the
 * estimated value, since tax % is the one figure a pilot is unlikely to be
 * correcting *from* a known tax-owed total. Clearing a field back to empty
 * returns both value fields to tracking their freshly computed defaults.
 *
 * "I already paid this" only shows up when creating: correcting an existing
 * record's fields never silently changes its paid/unpaid status (a dedicated
 * Mark as paid action does that, and only that).
 */
export function AssignDialog({
  row,
  assignment,
  payees,
  systemName,
  typeNames,
  unitPrices,
  busy,
  onAssigned,
  onCancel,
  extraActions,
}: AssignDialogProps) {
  const { t } = useTranslation();
  const isEditing = assignment !== null;
  const oreLines = assignment ? assignment.oreLines : row.unassignedOreLines;

  // Deliberately no `?? payees[0]` fallback when creating: the decision doc
  // leaves the multiple-moons-one-system case "deliberately unmatched...
  // that's the one case nothing can auto-resolve" — pre-selecting an
  // arbitrary Payee here would let a pilot in a hurry create a real
  // Assignment against a Payee they never actually chose.
  const autoMatch = isEditing
    ? undefined
    : payees.find((p) => p.systemId === row.entry.solarSystemId);
  const [payeeId, setPayeeId] = useState<string | null>(
    assignment?.payeeId ?? autoMatch?.id ?? null
  );
  const [taxPct, setTaxPct] = useState(
    String(assignment?.taxPct ?? autoMatch?.defaultTaxPct ?? '')
  );
  const [includedTypeIds, setIncludedTypeIds] = useState<ReadonlySet<number>>(
    new Set(oreLines.map((line) => line.typeId))
  );
  const [markPaid, setMarkPaid] = useState(false);
  const [rememberSystem, setRememberSystem] = useState(false);
  const [saving, setSaving] = useState(false);
  // Empty means "track the computed default"; any other string is a pilot
  // override that stops following `taxPct`/line-selection changes until
  // cleared back to empty. Editing starts pre-filled with the stored figure
  // (already a considered value, not something to silently recompute the
  // moment the row is opened).
  const [estimatedValueOverride, setEstimatedValueOverride] = useState(
    assignment ? String(round2(assignment.estimatedValue)) : ''
  );
  const [taxOwedOverride, setTaxOwedOverride] = useState(
    assignment ? String(round2(assignment.taxOwed)) : ''
  );

  // No reset-on-reopen effect: `RowDetailModal` only ever renders one of
  // these at a time, keyed off `detailTarget` going from `null` to a row, so
  // this component remounts fresh (new `useState` initializers) every time
  // it opens for a (possibly different) row rather than being reused in place.

  const selectedLines: OreLine[] = useMemo(
    () => oreLines.filter((line) => includedTypeIds.has(line.typeId)),
    [oreLines, includedTypeIds]
  );
  const pctValue = Number(taxPct);
  const computed = computeAssignmentValue(
    selectedLines,
    unitPrices,
    Number.isFinite(pctValue) ? pctValue : 0
  );
  const estimatedValue =
    estimatedValueOverride.trim() === ''
      ? computed.estimatedValue
      : (unmaskNumber(estimatedValueOverride) ?? NaN);
  // Tracks the *current* estimated value and tax %, not the raw Jita
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

  const selectedPayee = payees.find((p) => p.id === payeeId) ?? null;
  const offerRememberSystem =
    selectedPayee !== null && selectedPayee.systemId !== row.entry.solarSystemId;

  async function handleAssign() {
    if (!canAssign || !payeeId) return;
    setSaving(true);
    try {
      if (rememberSystem && selectedPayee) {
        await updatePayee(selectedPayee, {
          name: selectedPayee.name,
          defaultTaxPct: selectedPayee.defaultTaxPct,
          systemId: row.entry.solarSystemId,
        });
      }
      if (assignment) {
        await updateAssignment(assignment, { payeeId, taxPct: pctValue, estimatedValue, taxOwed });
      } else {
        await createAssignment({
          characterId: row.characterId,
          date: row.entry.date,
          solarSystemId: row.entry.solarSystemId,
          payeeId,
          oreLines: selectedLines,
          taxPct: pctValue,
          estimatedValue,
          taxOwed,
          markPaid,
        });
      }
      onAssigned();
    } finally {
      setSaving(false);
    }
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
    return <p className="text-xs text-text-dim">{t('miningTax.noPayeesHint')}</p>;
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
            if (!isEditing) {
              const selected = payees.find((p) => p.id === value);
              if (selected) setTaxPct(String(selected.defaultTaxPct));
            }
          }}
        >
          <SelectTrigger aria-label={t('miningTax.payeeLabel')}>
            <SelectValue placeholder={t('miningTax.payeePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {payees.map((payee) => (
              <SelectItem key={payee.id} value={payee.id}>
                {payee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {offerRememberSystem && (
        <label className="flex items-center gap-2 text-xs text-text-dim">
          <input
            type="checkbox"
            checked={rememberSystem}
            onChange={(e) => setRememberSystem(e.target.checked)}
          />
          {t('miningTax.rememberSystemLabel', {
            system: systemName,
            payee: selectedPayee?.name,
          })}
        </label>
      )}

      {!isEditing && oreLines.length > 1 && (
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
                <input
                  type="checkbox"
                  id={`line-${line.typeId}`}
                  checked={includedTypeIds.has(line.typeId)}
                  onChange={() => toggleLine(line.typeId)}
                />
                <img src={typeIconUrl(line.typeId, 32)} alt="" className="h-4 w-4 shrink-0" />
                <label htmlFor={`line-${line.typeId}`} className="w-40 shrink-0 truncate">
                  {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                </label>
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

      {!isEditing && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={markPaid}
            onChange={(e) => setMarkPaid(e.target.checked)}
          />
          {t('miningTax.markPaidLabel')}
        </label>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          variant="primary"
          size="sm"
          disabled={!canAssign || saving || busy}
          onClick={() => void handleAssign()}
        >
          {isEditing ? t('common.save') : t('miningTax.assignAction')}
        </Button>
        {extraActions}
        <Button size="sm" onClick={onCancel}>
          {t('filters.cancel')}
        </Button>
      </div>
    </div>
  );
}
