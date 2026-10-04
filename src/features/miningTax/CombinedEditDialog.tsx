import { useMemo, useState } from 'react';
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
  TypeIcon,
} from '@/components/ui';
import type { PayeeRecord } from '@/db';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { formatIsk } from '@/lib/isk';
import { SecurityValue } from '@/features/character/assetBrowserRows';
import { useIsPhone } from '@/lib/useIsPhone';
import { updateCombinedAssignments, type CombinedMemberValues } from './assignments';
import { formatDateRange, type GroupMember } from './groupRows';
import { combinedDayValues, combinedLineDefaults } from './combinedValues';

interface CombinedEditDialogProps {
  open: boolean;
  onClose: () => void;
  /** Every day of the combined entry. */
  members: readonly GroupMember[];
  systemName: string;
  systemSecurity: number | null | undefined;
  payees: readonly PayeeRecord[];
  typeNames: ReadonlyMap<number, string>;
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  onSaved: () => void;
}

/**
 * The combined entry's one edit form (mockup F1, scope decision 20261004):
 * Payee and tax % once for every day, then each day's own ore values in a
 * section of its own — so a session that crossed midnight UTC is corrected
 * in one save instead of one editor per day, and its days can never end up
 * on different terms.
 *
 * A day nobody touches keeps the value it was billed at; its tax owed only
 * follows a changed rate. A day whose ore is edited is re-totalled from its
 * lines and remembers them as per-ore corrections, the same `oreLineValues`
 * the single-entry editor writes. Each line starts at its share of the
 * stored value (`combinedLineDefaults`), so the boxes always add up to what
 * the day shows before anything is changed.
 *
 * A Paid entry opens locked. "Unlock to edit" opens every day's fields at
 * once, and Save corrects the figures while the entry stays Paid with its
 * recorded payment — the same "correcting isn't un-paying" rule
 * `updateAssignment` keeps. Cancelling writes nothing.
 */
export function CombinedEditDialog({
  open,
  onClose,
  members,
  systemName,
  systemSecurity,
  payees,
  typeNames,
  pricesFor,
  onSaved,
}: CombinedEditDialogProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const current = useMemo(
    () => [...members].sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date)),
    [members]
  );
  const first = current[0]?.assignment;
  const [payeeId, setPayeeId] = useState<string | undefined>(first?.payeeId);
  const [taxPct, setTaxPct] = useState(String(first?.taxPct ?? ''));
  // Per day, per ore type: the pilot's own whole-ISK figure as `IskInput`
  // reports it (plain digits). Absent or blank means "untouched".
  const [overrides, setOverrides] = useState<Record<string, Record<number, string>>>({});
  const [saving, setSaving] = useState(false);
  // Unlocking only opens the fields: nothing is written until Save, and Save
  // corrects the figures without un-paying anything — cancelling leaves the
  // entry exactly as it was.
  const [unlocked, setUnlocked] = useState(false);
  const locked = !unlocked && current.some((m) => m.assignment.status === 'paid');

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
    const edits: Record<number, number> = {};
    for (const [typeId, raw] of Object.entries(overrides[assignment.id] ?? {})) {
      if (raw !== '') edits[Number(typeId)] = Number(raw);
    }
    return combinedDayValues(
      assignment,
      edits,
      defaults.get(assignment.id) ?? new Map(),
      pctValid ? pct : assignment.taxPct
    );
  }

  const values = new Map(current.map((m) => [m.assignment.id, dayValues(m)]));
  const totalValue = [...values.values()].reduce((sum, v) => sum + v.estimatedValue, 0);
  const totalTax = [...values.values()].reduce((sum, v) => sum + v.taxOwed, 0);

  async function handleSave() {
    if (!payeeId || !pctValid || locked) return;
    setSaving(true);
    try {
      await updateCombinedAssignments(
        current.map((m) => m.assignment),
        { payeeId, taxPct: pct, members: Object.fromEntries(values) }
      );
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const label = (text: string) => (
    <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">{text}</p>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement={isPhone ? 'sheet-full' : 'center'}
      title={
        <span className="flex items-center gap-1.5">
          {t('miningTax.combined.editTitle', {
            date: formatDateRange(current.map((m) => m.assignment.date)),
            system: systemName,
          })}
          <SecurityValue security={systemSecurity} t={t} />
        </span>
      }
    >
      <div className="space-y-3 text-sm">
        {locked && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-warning/60 bg-warning/10 p-2 text-xs"
          >
            <span className="text-text-dim">
              {t('miningTax.combined.lockedHint', { count: current.length })}
            </span>
            <Button size="sm" onClick={() => setUnlocked(true)}>
              {t('miningTax.unlockAction')}
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            {label(t('miningTax.payeeLabel'))}
            <Select
              value={payeeId}
              disabled={locked}
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
            {label(t('miningTax.taxPctLabel'))}
            <TextInput
              type="number"
              min={0}
              max={100}
              step="0.1"
              value={taxPct}
              disabled={locked}
              onChange={(e) => setTaxPct(e.target.value)}
              aria-label={t('miningTax.taxPctLabel')}
              className="w-full"
            />
          </div>
        </div>

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
                <span className="font-semibold">{assignment.date}</span>
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
                      <TypeIcon typeId={line.typeId} size={32} className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">
                        <MarketItemLink typeId={line.typeId}>{name}</MarketItemLink>
                        <span className="ml-1.5 text-text-dim tabular-nums">
                          {line.quantity.toLocaleString()}
                        </span>
                      </span>
                      <IskInput
                        echo={false}
                        aria-label={t('miningTax.combined.oreValueLabel', {
                          name,
                          date: assignment.date,
                        })}
                        className="w-32 shrink-0"
                        disabled={locked}
                        value={raw ?? ''}
                        defaultAmount={fallback}
                        onChange={(value) =>
                          setOverrides((previous) => ({
                            ...previous,
                            [assignment.id]: { ...previous[assignment.id], [line.typeId]: value },
                          }))
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xs border border-line px-2 py-1.5">
            {label(t('miningTax.estimatedValueLabel'))}
            <p className="font-semibold tabular-nums">{formatIsk(totalValue)}</p>
          </div>
          <div className="rounded-xs border border-line px-2 py-1.5">
            {label(t('miningTax.combined.taxAt', { pct: pctValid ? pct : '—' }))}
            <p className="font-semibold tabular-nums">{formatIsk(totalTax)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            disabled={locked || saving || !payeeId || !pctValid}
            onClick={() => void handleSave()}
          >
            {t('miningTax.combined.saveAll', { count: current.length })}
          </Button>
          <Button className="ml-auto" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
