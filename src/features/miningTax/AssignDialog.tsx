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
  TextInput,
} from '@/components/ui';
import type { PayeeRecord } from '@/db';
import type { OreLine } from '@/engine/miningTax/types';
import { computeAssignmentValue } from '@/engine/miningTax/valuation';
import { formatIsk } from '@/lib/isk';
import { createAssignment } from './assignments';
import { updatePayee } from './payees';
import type { MoonMiningTaxRow } from './snapshot';

interface AssignDialogProps {
  open: boolean;
  onClose: () => void;
  row: MoonMiningTaxRow;
  payees: readonly PayeeRecord[];
  systemName: string;
  typeNames: ReadonlyMap<number, string>;
  /** Jita unit prices, already fetched by the parent route's snapshot load for every ore line across every row — a strict superset of what this dialog needs, so it reads this instead of re-fetching. */
  unitPrices: ReadonlyMap<number, number>;
  onAssigned: () => void;
}

/**
 * Assign dialog (decision doc): picks a Payee for some or all of an entry's
 * still-unassigned ore, at a tax % that defaults from the Payee and can be
 * overridden, and defaults "I already sent this in-game" ON — unchecking it
 * is the only way to leave the assignment Outstanding. Line checkboxes are
 * the split-Payee mechanism: uncheck a line to leave it for a second
 * Assignment against a different Payee (the two-corps-one-system-one-day
 * case ESI itself cannot distinguish).
 *
 * "Remember this system for <Payee>" is where a Payee's moon/system tag
 * actually gets set (CONTEXT.md's Payee entry) — the moment a pilot is
 * already looking at "this system, this Payee" is the moment tagging it is
 * free, rather than asking them to recall a system id in Manage Payees.
 * Pre-selecting a tagged Payee for the current system is the other half
 * (`autoMatch` below).
 */
export function AssignDialog({
  open,
  onClose,
  row,
  payees,
  systemName,
  typeNames,
  unitPrices,
  onAssigned,
}: AssignDialogProps) {
  const { t } = useTranslation();
  // Deliberately no `?? payees[0]` fallback: the decision doc leaves the
  // multiple-moons-one-system case "deliberately unmatched... that's the one
  // case nothing can auto-resolve" — pre-selecting an arbitrary Payee here
  // would, combined with `markPaid` defaulting on, let one click write a
  // paid invoice against a Payee the pilot never actually chose.
  const autoMatch = payees.find((p) => p.systemId === row.entry.solarSystemId);
  const [payeeId, setPayeeId] = useState<string | null>(autoMatch?.id ?? null);
  const [taxPct, setTaxPct] = useState(String(autoMatch?.defaultTaxPct ?? ''));
  const [includedTypeIds, setIncludedTypeIds] = useState<ReadonlySet<number>>(
    new Set(row.unassignedOreLines.map((line) => line.typeId))
  );
  const [markPaid, setMarkPaid] = useState(true);
  const [rememberSystem, setRememberSystem] = useState(false);
  const [saving, setSaving] = useState(false);

  // No reset-on-reopen effect: the route only ever renders one `AssignDialog`
  // at a time, keyed off `assignTarget` going from `null` to a row, so this
  // component remounts fresh (new `useState` initializers) every time it
  // opens for a (possibly different) row rather than being reused in place.

  const selectedLines: OreLine[] = useMemo(
    () => row.unassignedOreLines.filter((line) => includedTypeIds.has(line.typeId)),
    [row.unassignedOreLines, includedTypeIds]
  );
  const pctValue = Number(taxPct);
  const { estimatedValue, taxOwed } = computeAssignmentValue(
    selectedLines,
    unitPrices,
    Number.isFinite(pctValue) ? pctValue : 0
  );

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
    if (!payeeId || selectedLines.length === 0 || !Number.isFinite(pctValue)) return;
    setSaving(true);
    try {
      if (rememberSystem && selectedPayee) {
        await updatePayee(selectedPayee, {
          name: selectedPayee.name,
          defaultTaxPct: selectedPayee.defaultTaxPct,
          systemId: row.entry.solarSystemId,
        });
      }
      await createAssignment({
        characterId: row.characterId,
        date: row.entry.date,
        solarSystemId: row.entry.solarSystemId,
        payeeId,
        oreLines: selectedLines,
        taxPct: pctValue,
        markPaid,
      });
      onAssigned();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const canAssign =
    payeeId !== null &&
    selectedLines.length > 0 &&
    Number.isFinite(pctValue) &&
    pctValue >= 0 &&
    pctValue <= 100;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('miningTax.assignTitle', { date: row.entry.date, system: systemName })}
    >
      <div className="space-y-3">
        {payees.length === 0 ? (
          <p className="text-xs text-text-dim">{t('miningTax.noPayeesHint')}</p>
        ) : (
          <>
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

            {row.unassignedOreLines.length > 1 && (
              <div className="space-y-1">
                <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('miningTax.oreLinesLabel')}
                </p>
                <ul className="space-y-1">
                  {row.unassignedOreLines.map((line) => (
                    <li key={line.typeId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        id={`line-${line.typeId}`}
                        checked={includedTypeIds.has(line.typeId)}
                        onChange={() => toggleLine(line.typeId)}
                      />
                      <label htmlFor={`line-${line.typeId}`} className="min-w-0 flex-1 truncate">
                        {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                      </label>
                      <span className="tabular-nums text-text-dim">
                        {line.quantity.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[0.6875rem] text-text-dim">{t('miningTax.splitHint')}</p>
              </div>
            )}

            <div className="space-y-1">
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
              />
            </div>

            <div className="rounded-xs border border-line bg-panel-2 p-2 text-xs">
              <p>
                {t('miningTax.estimatedValueLabel')}:{' '}
                <strong>{formatIsk(estimatedValue, 2)} ISK</strong>
              </p>
              <p>
                {t('miningTax.taxOwedLabel')}: <strong>{formatIsk(taxOwed, 2)} ISK</strong>
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={markPaid}
                onChange={(e) => setMarkPaid(e.target.checked)}
              />
              {t('miningTax.markPaidLabel')}
            </label>

            <div className="flex gap-2 pt-1">
              <Button
                variant="primary"
                className="flex-1"
                disabled={!canAssign || saving}
                onClick={() => void handleAssign()}
              >
                {t('miningTax.assignAction')}
              </Button>
              <Button className="flex-1" onClick={onClose}>
                {t('filters.cancel')}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
