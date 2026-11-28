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
  Tooltip,
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
import { formatCount } from '@/lib/formatCount';
import { Well } from '@/components/ui/Well';

interface EntryEditDialogProps {
  open: boolean;
  onClose: () => void;
  members: readonly GroupMember[];
  systemName: string;
  systemSecurity: number | null | undefined;
  payees: readonly PayeeRecord[];
  assignments?: readonly MiningTaxAssignmentRecord[];
  typeNames: ReadonlyMap<number, string>;
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  onSaved: () => void;
}

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
  useHydratedStore(useMiningTaxOreValueMode);
  const current = useMemo(
    () => [...members].sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date)),
    [members]
  );
  const first = current[0]?.assignment;
  const multiDay = current.length > 1;
  const [payeeId, setPayeeId] = useState<string | undefined>(first?.payeeId);
  const [taxPct, setTaxPct] = useState(String(first?.taxPct ?? ''));
  const [label, setLabel] = useState(first?.label ?? '');
  const [overrides, setOverrides] = useState<Record<string, Record<number, string>>>({});
  const [dayOverrides, setDayOverrides] = useState<Record<string, string>>({});
  const [taxOverrides, setTaxOverrides] = useState<
    Record<string, { tax: number; pct: number } | undefined>
  >({});
  const { pending: saving, error: saveError, run } = useLedgerAction();
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
          <Well as="p" tone="warning" className="text-xs text-text-dim">
            {t('miningTax.entryEdit.paidHint', { count: current.length })}
          </Well>
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
                          {formatCount(line.quantity)}
                        </span>
                      </span>
                      {perOre && (
                        <DefaultedIskInput
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
              <div className="relative">
                <DefaultedIskInput
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
              <div className="relative">
                <DefaultedIskInput
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
          <Tooltip content={!payeeId || !pctValid ? t('common.needsInput') : null}>
            <Button
              variant="primary"
              loading={saving}
              aria-disabled={!payeeId || !pctValid || undefined}
              onClick={() => void handleSave()}
            >
              {t('miningTax.entryEdit.save', { count: current.length })}
            </Button>
          </Tooltip>
          <Button className="ml-auto" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
