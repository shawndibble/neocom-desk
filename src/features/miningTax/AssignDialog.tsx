import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  InfoTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  TypeIcon,
  Checkbox,
} from '@/components/ui';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { OreLine } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { maskIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { AlreadyAssignedError, createAssignment, updateAssignment } from './assignments';
import { useMiningTaxOreValueMode } from './oreValueMode';
import { updatePayee } from './payees';
import { hubForPayee } from './pricing';
import type { MoonMiningTaxRow } from './snapshot';

interface AssignDialogProps {
  row: MoonMiningTaxRow;
  /** `null` creates a new Assignment for the row's still-unassigned ore; an existing record edits that Assignment's Payee/tax%/value/tax owed in place. */
  assignment: MiningTaxAssignmentRecord | null;
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
   * Reopens a Paid Assignment for editing ("unlock to edit", grilling
   * session 2026-09-27) — only ever offered when editing (`assignment` is
   * not `null`) and `assignment.status === 'paid'`. Present only from
   * `RowDetailModal`, which owns updating the parent's copy of the
   * Assignment once this resolves.
   */
  onUnlock?: () => void | Promise<void>;
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
  disabled?: boolean;
}

/**
 * The estimated-value/tax-owed fields: grouped digits at rest (`maskIsk`,
 * up to 2 decimals, none padded on) and the plain figure to type into, same
 * split `numberMask.ts`'s `SourcingInput` uses — reformatting on every
 * keystroke would fight the caret. `unmaskNumber` accepts what's typed or
 * pasted with or without its own commas.
 */
function IskField({
  ariaLabel,
  computedDefault,
  override,
  onOverrideChange,
  disabled,
}: IskFieldProps) {
  const [editing, setEditing] = useState(false);
  const effectiveValue =
    override.trim() === '' ? computedDefault : (unmaskNumber(override) ?? computedDefault);
  return (
    <TextInput
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      className="w-full"
      disabled={disabled}
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

interface OreValueFieldProps {
  ariaLabel: string;
  computedDefault: number;
  override: string;
  onOverrideChange: (raw: string) => void;
  disabled?: boolean;
}

/**
 * One ore line's total-value box, in the "edit ore values individually"
 * mode (grilling session 2026-09-27). Deliberately diverges from
 * `IskField`'s invalid-input handling: a negative number or non-numeric text
 * is rejected and the field snaps straight back to tracking the computed
 * default, rather than `IskField`'s "leave the raw text, disable Save"
 * pattern — the pilot is reconciling against a corp's own tool's figures
 * line by line, and a box silently holding an un-savable value while its
 * neighbors look fine invites missing which one is actually wrong.
 */
function OreValueField({
  ariaLabel,
  computedDefault,
  override,
  onOverrideChange,
  disabled,
}: OreValueFieldProps) {
  const [editing, setEditing] = useState(false);
  const effectiveValue =
    override.trim() === '' ? computedDefault : (unmaskNumber(override) ?? computedDefault);

  function handleChange(raw: string) {
    if (raw.trim() !== '' && unmaskNumber(raw) === undefined) {
      onOverrideChange('');
      return;
    }
    onOverrideChange(raw);
  }

  return (
    <TextInput
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      className="w-full"
      disabled={disabled}
      value={
        editing
          ? override === ''
            ? String(round2(computedDefault))
            : override
          : maskIsk(round2(effectiveValue))
      }
      onFocus={() => setEditing(true)}
      onChange={(e) => handleChange(e.target.value)}
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
 * The ore is valued at the *selected* Payee's trade hub, re-derived on every
 * render rather than fetched: picking a different Payee can change what the
 * same ore is worth, because the hub belongs to the Payee (the figure is a
 * bill one player sends another, not a local viewing preference).
 *
 * "I already paid this" only shows up when creating: correcting an existing
 * record's fields never silently changes its paid/unpaid status (a dedicated
 * Mark as paid action does that, and only that).
 *
 * **Per-ore value editing** (grilling session, 2026-09-27), only ever shown
 * when editing (never when creating — see decision doc): with the
 * `miningTaxOreValueMode` setting on, the single Estimated Value/Tax Owed
 * inputs above are replaced by one editable total-value box per ore line
 * (`OreValueField`), and Estimated Value/Tax Owed become plain calculated
 * totals — `computeAssignmentValue`'s own `oreLineValues` parameter, so the
 * same engine function derives the total either way. Tax % stays editable in
 * both modes.
 *
 * **Paid lock**: an Assignment already marked Paid renders every field here
 * disabled, with an inline "unlock to edit" prompt in place of Save — a
 * pilot correcting a data-entry mistake against a corp's own moon-tax tool
 * should not have to un-invoice a real payment to do it, but the record stays
 * protected until they explicitly ask to reopen it (`onUnlock`, which keeps
 * the recorded payment untouched — only `status`/`paidAt` move).
 */
export function AssignDialog({
  row,
  assignment,
  payees,
  systemName,
  typeNames,
  pricesFor,
  busy,
  onAssigned,
  onCancel,
  extraActions,
  onAddPayee,
  onUnlock,
}: AssignDialogProps) {
  const { t } = useTranslation();
  const isEditing = assignment !== null;
  const oreLines = assignment ? assignment.oreLines : row.unassignedOreLines;
  const oreValueMode = useMiningTaxOreValueMode((state) => state.value) && isEditing;
  const locked = isEditing && assignment.status === 'paid';

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
  const [unlocking, setUnlocking] = useState(false);
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
  // Per-ore-type override text, keyed by typeId — same "empty tracks the
  // computed default" convention as the whole-row fields above. Seeded from
  // the stored `oreLineValues`, when there is one.
  const [oreValueOverrides, setOreValueOverrides] = useState<Record<number, string>>(() => {
    const seed: Record<number, string> = {};
    for (const line of oreLines) {
      const stored = assignment?.oreLineValues?.[line.typeId];
      if (stored !== undefined) seed[line.typeId] = String(round2(stored));
    }
    return seed;
  });

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

  const oreLineValueOverrideMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const line of selectedLines) {
      const raw = oreValueOverrides[line.typeId];
      if (raw === undefined || raw.trim() === '') continue;
      const parsed = unmaskNumber(raw);
      if (parsed !== undefined) map.set(line.typeId, parsed);
    }
    return map;
  }, [selectedLines, oreValueOverrides]);

  const computed = computeAssignmentValue(
    selectedLines,
    prices,
    Number.isFinite(pctValue) ? pctValue : 0,
    oreValueMode ? oreLineValueOverrideMap : undefined
  );

  const estimatedValue = oreValueMode
    ? computed.estimatedValue
    : estimatedValueOverride.trim() === ''
      ? computed.estimatedValue
      : (unmaskNumber(estimatedValueOverride) ?? NaN);
  // Tracks the *current* estimated value and tax %, not the raw hub-priced
  // default — so an edit to either one keeps this field's display in sync
  // (the three fields are connected: taxOwed = estimatedValue * pct / 100).
  const taxOwed = oreValueMode
    ? computed.taxOwed
    : taxOwedOverride.trim() === ''
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
    if (oreValueMode) return; // taxOwed is a plain calculated total in this mode.
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

  function handleOreValueChange(typeId: number, raw: string) {
    setOreValueOverrides((previous) => ({ ...previous, [typeId]: raw }));
  }

  const offerRememberSystem =
    selectedPayee !== null && selectedPayee.systemId !== row.entry.solarSystemId;

  async function handleUnlock() {
    if (!onUnlock) return;
    setUnlocking(true);
    try {
      await onUnlock();
    } finally {
      setUnlocking(false);
    }
  }

  async function handleAssign() {
    if (!canAssign || !payeeId) return;
    setSaving(true);
    try {
      if (rememberSystem && selectedPayee) {
        await updatePayee(selectedPayee, {
          name: selectedPayee.name,
          defaultTaxPct: selectedPayee.defaultTaxPct,
          systemId: row.entry.solarSystemId,
          // Carried through, not omitted: `updatePayee` deletes any field its
          // input leaves out, so remembering a system would otherwise quietly
          // move this Payee's billing back to Jita.
          hubId: selectedPayee.hubId,
        });
      }
      if (assignment) {
        await updateAssignment(assignment, {
          payeeId,
          taxPct: pctValue,
          estimatedValue,
          taxOwed,
          oreLineValues: oreValueMode ? Object.fromEntries(oreLineValueOverrideMap) : undefined,
        });
      } else {
        await createAssignment({
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
        });
      }
      onAssigned();
    } catch (error) {
      // The row was stale — something else already claimed this ore. Refresh
      // so the pilot sees the Assignment that exists instead of saving a twin.
      if (error instanceof AlreadyAssignedError) onAssigned();
      else throw error;
    } finally {
      setSaving(false);
    }
  }

  const canAssign =
    !locked &&
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
      {locked && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
        >
          <span className="text-text-dim">{t('miningTax.lockedHint')}</span>
          <Button size="sm" disabled={unlocking || busy} onClick={() => void handleUnlock()}>
            {t('miningTax.unlockAction')}
          </Button>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('miningTax.payeeLabel')}
        </p>
        <Select
          value={payeeId ?? undefined}
          disabled={locked}
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
          <Checkbox
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
                <label
                  htmlFor={`line-${line.typeId}`}
                  className="flex shrink-0 items-center gap-1.5"
                >
                  <Checkbox
                    id={`line-${line.typeId}`}
                    checked={includedTypeIds.has(line.typeId)}
                    onChange={() => toggleLine(line.typeId)}
                    aria-label={t('miningTax.includeLineLabel', {
                      ore: typeNames.get(line.typeId) ?? `#${line.typeId}`,
                    })}
                  />
                  <TypeIcon typeId={line.typeId} size={32} className="h-4 w-4 shrink-0" />
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

      {oreValueMode && (
        <div className="space-y-1">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.oreColumn')}
          </p>
          <p className="text-[0.6875rem] text-text-dim">{t('miningTax.oreValueHint')}</p>
          <ul className="divide-y divide-line">
            {selectedLines.map((line) => {
              const override = oreValueOverrides[line.typeId] ?? '';
              const computedLineDefault = line.quantity * (prices.get(line.typeId) ?? 0);
              const name = typeNames.get(line.typeId) ?? `#${line.typeId}`;
              const isCorrected = override.trim() !== '';
              return (
                <li key={line.typeId} className="flex items-center gap-1.5 py-1.5 text-sm">
                  <TypeIcon typeId={line.typeId} size={32} className="h-4 w-4 shrink-0" />
                  <span className="w-32 shrink-0 truncate">
                    <MarketItemLink typeId={line.typeId}>{name}</MarketItemLink>
                  </span>
                  <span className="w-16 shrink-0 tabular-nums text-text-dim">
                    {line.quantity.toLocaleString()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <OreValueField
                      ariaLabel={t('miningTax.oreValueLabel', { name })}
                      computedDefault={computedLineDefault}
                      override={override}
                      onOverrideChange={(raw) => handleOreValueChange(line.typeId, raw)}
                      disabled={locked}
                    />
                  </div>
                  {isCorrected && (
                    <InfoTooltip
                      label={t('common.aboutLabel', { label: name })}
                      content={t('miningTax.correctedTooltip', {
                        original: maskIsk(round2(computedLineDefault)),
                        current: maskIsk(round2(unmaskNumber(override) ?? computedLineDefault)),
                      })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
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
            disabled={locked}
            onChange={(e) => handleTaxPctChange(e.target.value)}
            aria-label={t('miningTax.taxPctLabel')}
            className="w-full"
          />
        </div>

        <div className="min-w-0 space-y-1 sm:flex-1">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.estimatedValueLabel')}
          </p>
          {oreValueMode ? (
            <p className="tabular-nums" aria-label={t('miningTax.estimatedValueLabel')}>
              {maskIsk(round2(estimatedValue))}
            </p>
          ) : (
            <IskField
              ariaLabel={t('miningTax.estimatedValueLabel')}
              computedDefault={computed.estimatedValue}
              override={estimatedValueOverride}
              onOverrideChange={handleEstimatedValueChange}
              disabled={locked}
            />
          )}
          {/* Only for a Payee billing somewhere other than the default: at
              Jita this would be a line of standing noise, anywhere else it is
              the explanation for a figure that doesn't match the ledger's
              own Value column. Deliberately a statement about the *Payee*,
              not about the number above it: when editing, that number stays
              on the stored figure until cleared, so "valued at X" would
              contradict the field it sits under. */}
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
          {oreValueMode ? (
            <p className="tabular-nums" aria-label={t('miningTax.taxOwedLabel')}>
              {maskIsk(round2(taxOwed))}
            </p>
          ) : (
            <IskField
              ariaLabel={t('miningTax.taxOwedLabel')}
              computedDefault={(estimatedValue * (Number.isFinite(pctValue) ? pctValue : 0)) / 100}
              override={taxOwedOverride}
              onOverrideChange={handleTaxOwedChange}
              disabled={locked}
            />
          )}
        </div>
      </div>

      {!isEditing && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={markPaid} onChange={(e) => setMarkPaid(e.target.checked)} />
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
