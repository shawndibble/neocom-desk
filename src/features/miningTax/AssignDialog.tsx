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
import * as Icon from '@/components/ui/icons';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { OreLine } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
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
 * Estimated value and tax owed are both prefilled — from `computeAssignmentValue`
 * when creating, from the stored Assignment when editing — but independently
 * editable either way, since a Jita price or a Payee's default rate can turn
 * out wrong. Clearing a field back to empty returns it to tracking a freshly
 * computed default.
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
    estimatedValueOverride.trim() === '' ? computed.estimatedValue : Number(estimatedValueOverride);
  const taxOwed = taxOwedOverride.trim() === '' ? computed.taxOwed : Number(taxOwedOverride);

  function toggleLine(typeId: number) {
    setIncludedTypeIds((previous) => {
      const next = new Set(previous);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
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
                <Icon.Ore
                  aria-hidden="true"
                  size={Icon.ICON_SIZE.sm}
                  className="shrink-0 text-text-faint"
                />
                <label htmlFor={`line-${line.typeId}`} className="min-w-0 max-w-[10rem] truncate">
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
            onChange={(e) => setTaxPct(e.target.value)}
            aria-label={t('miningTax.taxPctLabel')}
            className="w-full"
          />
        </div>

        <div className="min-w-0 space-y-1 sm:flex-1">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.estimatedValueLabel')}
          </p>
          <TextInput
            type="number"
            min={0}
            step="0.01"
            value={
              estimatedValueOverride === ''
                ? String(round2(computed.estimatedValue))
                : estimatedValueOverride
            }
            onChange={(e) => setEstimatedValueOverride(e.target.value)}
            aria-label={t('miningTax.estimatedValueLabel')}
            className="w-full"
          />
        </div>

        <div className="min-w-0 space-y-1 sm:flex-1">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.taxOwedLabel')}
          </p>
          <TextInput
            type="number"
            min={0}
            step="0.01"
            value={taxOwedOverride === '' ? String(round2(computed.taxOwed)) : taxOwedOverride}
            onChange={(e) => setTaxOwedOverride(e.target.value)}
            aria-label={t('miningTax.taxOwedLabel')}
            className="w-full"
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
          {t('miningTax.assignAction')}
        </Button>
        {extraActions}
        <Button size="sm" onClick={onCancel}>
          {t('filters.cancel')}
        </Button>
      </div>
    </div>
  );
}
