import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useMemo, useState, type ComponentProps } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { OreIcon, OreLink } from './OreIcon';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  IskInput,
  TextInput,
} from '@/components/ui';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { formatIsk } from '@/lib/isk';
import { SecurityValue } from '@/features/assets/assetBrowserRows';
import * as Icon from '@/components/ui/icons';
import { useIsPhone } from '@/lib/useIsPhone';
import { editEntry, type CombinedMemberValues } from './ledgerActions';
import { useLedgerAction } from './useLedgerAction';
import { formatDateRange, type GroupMember } from './groupRows';
import {
  combinedDayValues,
  combinedLineDefaults,
  dayTaxValues,
  dayTotalValues,
} from './combinedValues';
import { useMiningTaxOreValueMode } from './oreValueMode';
import { LedgerActionError } from './LedgerActionError';
import { LabelField } from './LabelField';
import { labelSuggestions } from './assignmentLabel';

interface EntryEditDialogProps {
  open: boolean;
  onClose: () => void;
  /** Every day of the entry: one for a single entry, two or more for a combined one. */
  members: readonly GroupMember[];
  systemName: string;
  systemSecurity: number | null | undefined;
  payees: readonly PayeeRecord[];
  /** Every assignment, for the label suggestions (labels already used for this payee and system). */
  assignments?: readonly MiningTaxAssignmentRecord[];
  typeNames: ReadonlyMap<number, string>;
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  onSaved: () => void;
}

/**
 * An `IskInput` whose default is real text, not a placeholder: an untouched
 * box shows the figure as ordinary selectable text (selected whole on focus,
 * so typing replaces it), and wiping it brings the default back on blur
 * rather than leaving a faded number that looks undeletable. `value` is `''`
 * while the pilot hasn't chosen their own figure.
 */
function DefaultedIskInput({
  value,
  defaultAmount,
  onChange,
  onFocus,
  onBlur,
  ...rest
}: Omit<ComponentProps<typeof IskInput>, 'defaultAmount' | 'placeholder'> & {
  defaultAmount: number;
}) {
  // Blank mid-edit stays blank (so a fresh figure can be typed); the default
  // returns on blur, remounting the field so it re-reads it.
  const [blanked, setBlanked] = useState(false);
  const [resets, setResets] = useState(0);
  const shown = value !== '' ? value : blanked ? '' : String(defaultAmount);
  return (
    <IskInput
      key={resets}
      {...rest}
      value={shown}
      onChange={(next) => {
        setBlanked(next === '');
        onChange(next === String(defaultAmount) ? '' : next);
      }}
      onFocus={(event) => {
        event.currentTarget.select();
        onFocus?.(event);
      }}
      onBlur={(event) => {
        if (event.currentTarget.value.trim() === '') {
          setBlanked(false);
          setResets((n) => n + 1);
        }
        onBlur?.(event);
      }}
    />
  );
}

const LABEL = eyebrowClassName;

/**
 * The one edit form for an assigned entry (mockup F1, scope decision
 * 20261004), whether it is a single day or a combined one, owed or paid:
 * Payee and tax % once, then each day's ore in a section of its own — so a
 * session that crossed midnight UTC is corrected in one save, and its days
 * can never end up on different terms.
 *
 * With "edit ore values individually" on, each ore line has its own value
 * box. A line starts at its share of the stored value
 * (`combinedLineDefaults`), so the boxes add up to what the day shows before
 * anything is changed; a day whose ore is edited is re-totalled from its
 * lines and remembers them as per-ore corrections (`oreLineValues`). With it
 * off, each day has one value box instead (`dayTotalValues`). A day nobody
 * touches keeps the value it was billed at either way; its tax owed only
 * follows a changed rate.
 *
 * A Paid entry opens ready to edit: the pilot already chose Edit, so there
 * is no second unlock step. Save corrects the figures while the entry stays
 * Paid with its recorded payment — the "correcting isn't un-paying" rule
 * `editEntry` keeps — and Cancel writes nothing.
 */
export function EntryEditDialog({
  open,
  onClose,
  members,
  systemName,
  systemSecurity,
  payees,
  assignments = [],
  typeNames,
  pricesFor,
  onSaved,
}: EntryEditDialogProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const perOre = useMiningTaxOreValueMode((state) => state.value);
  // Nothing else on the Tax tab loads this setting — only Settings did, so a
  // pilot who came straight here got the per-day boxes despite turning it on.
  useHydratedStore(useMiningTaxOreValueMode);
  const current = useMemo(
    () => [...members].sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date)),
    [members]
  );
  const first = current[0]?.assignment;
  const multiDay = current.length > 1;
  const [payeeId, setPayeeId] = useState<string | undefined>(first?.payeeId);
  const [taxPct, setTaxPct] = useState(String(first?.taxPct ?? ''));
  // Every day of an entry shares payee and terms, so one label covers them all.
  const [label, setLabel] = useState(first?.label ?? '');
  // Per day, per ore type: the pilot's own whole-ISK figure as `IskInput`
  // reports it (plain digits). Absent or blank means "untouched".
  const [overrides, setOverrides] = useState<Record<string, Record<number, string>>>({});
  // Per day, the whole day's value when ore values aren't edited one by one.
  const [dayOverrides, setDayOverrides] = useState<Record<string, string>>({});
  // Per day, a tax the pilot typed (whole ISK) and the rate it was typed at:
  // it stands only while that rate does, then the day falls back to its value.
  const [taxOverrides, setTaxOverrides] = useState<
    Record<string, { tax: number; pct: number } | undefined>
  >({});
  const { pending: saving, error: saveError, run } = useLedgerAction();
  // The one case with a single editable value for the whole entry.
  const singleDayValue = !perOre && !multiDay ? current[0]?.assignment : undefined;
  const paid = current.some((m) => m.assignment.status === 'paid');

  const payee = payees.find((p) => p.id === payeeId);
  const pct = Number(taxPct);
  const pctValid = taxPct.trim() !== '' && Number.isFinite(pct) && pct >= 0 && pct <= 100;

  const defaults = useMemo(
    () =>
      new Map(
        current.map((m) => [
          m.assignment.id,
          combinedLineDefaults(m.assignment, pricesFor(payee?.hubId, m.assignment.date)),
        ])
      ),
    [current, payee?.hubId, pricesFor]
  );

  function dayValues(member: GroupMember): CombinedMemberValues {
    const { assignment } = member;
    const rate = pctValid ? pct : assignment.taxPct;
    if (!perOre) {
      const typedTax = taxOverrides[assignment.id];
      if (typedTax && typedTax.pct === rate) {
        const fromTax = dayTaxValues(typedTax.tax, rate);
        if (fromTax) return fromTax;
      }
      const raw = dayOverrides[assignment.id] ?? '';
      if (raw !== '') return dayTotalValues(Number(raw), rate);
      return combinedDayValues(assignment, {}, new Map(), rate);
    }
    const edits: Record<number, number> = {};
    for (const [typeId, raw] of Object.entries(overrides[assignment.id] ?? {})) {
      // A box left at its own default isn't an edit: only a changed figure re-totals the day.
      const fallback = Math.round(defaults.get(assignment.id)?.get(Number(typeId)) ?? 0);
      if (raw !== '' && raw !== String(fallback)) edits[Number(typeId)] = Number(raw);
    }
    return combinedDayValues(assignment, edits, defaults.get(assignment.id) ?? new Map(), rate);
  }

  const values = new Map(current.map((m) => [m.assignment.id, dayValues(m)]));
  const totalValue = [...values.values()].reduce((sum, v) => sum + v.estimatedValue, 0);
  const totalTax = [...values.values()].reduce((sum, v) => sum + v.taxOwed, 0);

  async function handleSave() {
    if (!payeeId || !pctValid) return;
    await run(
      () =>
        editEntry(
          current.map((m) => m.assignment),
          { payeeId, taxPct: pct, label, members: Object.fromEntries(values) }
        ),
      onSaved
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      // A form: a stray click outside must not throw away what was typed.
      dismissOnOutsidePress={false}
      placement={isPhone ? 'sheet-full' : 'center'}
      title={
        <span className="flex items-center gap-1.5">
          {t('miningTax.entryEdit.title', {
            date: formatDateRange(current.map((m) => m.assignment.date)),
            system: systemName,
          })}
          <SecurityValue security={systemSecurity} />
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        {paid && (
          <p className="rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs text-text-dim">
            {t('miningTax.entryEdit.paidHint', { count: current.length })}
          </p>
        )}

        <div className="flex gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <p className={LABEL}>{t('miningTax.payeeLabel')}</p>
            <Select
              value={payeeId}
              onValueChange={(value) => {
                setPayeeId(value);
                const next = payees.find((p) => p.id === value);
                if (next) setTaxPct(String(next.defaultTaxPct));
              }}
            >
              <SelectTrigger aria-label={t('miningTax.payeeLabel')} className="w-full">
                <SelectValue placeholder={t('miningTax.payeePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {payees.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-20 shrink-0 space-y-1">
            <p className={LABEL}>{t('miningTax.taxPctLabel')}</p>
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
        </div>

        <LabelField
          value={label}
          onChange={setLabel}
          suggestions={
            payeeId && first ? labelSuggestions(assignments, payeeId, first.solarSystemId) : []
          }
        />

        {current.map((member) => {
          const { assignment } = member;
          const lineDefaults = defaults.get(assignment.id) ?? new Map<number, number>();
          const day = values.get(assignment.id);
          return (
            <section
              key={assignment.id}
              aria-label={assignment.date}
              className="rounded-xs border border-line bg-panel-2"
            >
              <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-1.5">
                {/* A single entry's date is already in the title; only a
                    combined entry needs each section to say which day. */}
                {multiDay ? (
                  <span className="font-semibold">{assignment.date}</span>
                ) : (
                  <span className={LABEL}>{t('miningTax.oreColumn')}</span>
                )}
                <span className="text-xs text-text-dim tabular-nums">
                  {formatIsk(day?.estimatedValue ?? 0)} → {formatIsk(day?.taxOwed ?? 0)} ISK
                </span>
              </div>
              <ul className="divide-y divide-line px-2">
                {assignment.oreLines.map((line) => {
                  const name = typeNames.get(line.typeId) ?? `#${line.typeId}`;
                  const raw = overrides[assignment.id]?.[line.typeId];
                  const fallback = Math.round(lineDefaults.get(line.typeId) ?? 0);
                  return (
                    <li key={line.typeId} className="flex items-center gap-1.5 py-1.5 text-xs">
                      <OreIcon typeId={line.typeId} size={32} className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        <OreLink typeId={line.typeId}>{name}</OreLink>
                        <span className="ml-1.5 text-text-dim tabular-nums">
                          {line.quantity.toLocaleString()}
                        </span>
                      </span>
                      {perOre && (
                        <DefaultedIskInput
                          echo={false}
                          aria-label={t('miningTax.entryEdit.oreValueLabel', {
                            name,
                            date: assignment.date,
                          })}
                          className="w-36 shrink-0"
                          value={raw ?? ''}
                          defaultAmount={fallback}
                          onChange={(value) =>
                            setOverrides((previous) => ({
                              ...previous,
                              [assignment.id]: {
                                ...previous[assignment.id],
                                [line.typeId]: value,
                              },
                            }))
                          }
                        />
                      )}
                    </li>
                  );
                })}
                {!perOre && multiDay && (
                  <li className="flex items-center gap-1.5 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 text-text-dim">
                      {t('miningTax.estimatedValueLabel')}
                    </span>
                    <DefaultedIskInput
                      echo={false}
                      aria-label={t('miningTax.entryEdit.dayValueLabel', {
                        date: assignment.date,
                      })}
                      className="w-36 shrink-0"
                      value={dayOverrides[assignment.id] ?? ''}
                      defaultAmount={Math.round(assignment.estimatedValue)}
                      onChange={(value) =>
                        setDayOverrides((previous) => ({ ...previous, [assignment.id]: value }))
                      }
                    />
                  </li>
                )}
              </ul>
            </section>
          );
        })}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xs border border-line px-2 py-1.5">
            <p className={LABEL}>{t('miningTax.estimatedValueLabel')}</p>
            {singleDayValue ? (
              // The one place this day's value is edited (§6c: a faint pencil
              // marks an editable value). Per-ore and combined entries keep
              // their per-line boxes, so there the tile is a read-only total.
              <div className="relative">
                <DefaultedIskInput
                  echo={false}
                  aria-label={t('miningTax.entryEdit.dayValueLabel', {
                    date: singleDayValue.date,
                  })}
                  className="[&_input]:pr-7 [&_input]:font-semibold"
                  value={dayOverrides[singleDayValue.id] ?? ''}
                  defaultAmount={Math.round(singleDayValue.estimatedValue)}
                  onChange={(value) => {
                    setTaxOverrides((previous) => ({
                      ...previous,
                      [singleDayValue.id]: undefined,
                    }));
                    setDayOverrides((previous) => ({ ...previous, [singleDayValue.id]: value }));
                  }}
                />
                <Icon.Rename
                  size={Icon.ICON_SIZE.sm}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-text-faint"
                />
              </div>
            ) : (
              <p className="font-semibold tabular-nums">{formatIsk(totalValue)}</p>
            )}
          </div>
          <div className="rounded-xs border border-line px-2 py-1.5">
            <p className={LABEL}>{t('miningTax.entryEdit.taxAt', { pct: pctValid ? pct : '—' })}</p>
            {singleDayValue ? (
              // The same two-way link from the other side: a typed tax sets
              // the value it implies. Needs a rate above 0% to imply one.
              <div className="relative">
                <DefaultedIskInput
                  echo={false}
                  disabled={!pctValid || pct <= 0}
                  aria-label={t('miningTax.entryEdit.dayTaxLabel', { date: singleDayValue.date })}
                  className="[&_input]:pr-7 [&_input]:font-semibold"
                  value={
                    taxOverrides[singleDayValue.id]?.pct === pct
                      ? String(taxOverrides[singleDayValue.id]?.tax)
                      : ''
                  }
                  defaultAmount={Math.round(totalTax)}
                  onChange={(raw) => {
                    const id = singleDayValue.id;
                    if (raw === '' || !pctValid) {
                      setTaxOverrides((previous) => ({ ...previous, [id]: undefined }));
                      return;
                    }
                    const derived = dayTaxValues(Number(raw), pct);
                    if (!derived) return;
                    setTaxOverrides((previous) => ({
                      ...previous,
                      [id]: { tax: Number(raw), pct },
                    }));
                    setDayOverrides((previous) => ({
                      ...previous,
                      [id]: String(derived.estimatedValue),
                    }));
                  }}
                />
                <Icon.Rename
                  size={Icon.ICON_SIZE.sm}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-text-faint"
                />
              </div>
            ) : (
              <p className="font-semibold tabular-nums">{formatIsk(totalTax)}</p>
            )}
          </div>
        </div>

        <LedgerActionError error={saveError} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            disabled={saving || !payeeId || !pctValid}
            onClick={() => void handleSave()}
          >
            {t('miningTax.entryEdit.save', { count: current.length })}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
