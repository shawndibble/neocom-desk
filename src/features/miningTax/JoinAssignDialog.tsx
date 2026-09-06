import { useState } from 'react';
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
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { typeIconUrl } from '@/lib/eveImages';
import { joinAssignments, type JoinMemberInput } from './assignments';
import { agreedTerms } from './selection';
import type { MoonMiningTaxRow } from './snapshot';

export interface JoinCandidate {
  row: MoonMiningTaxRow;
  /** `null` when this date is still unassigned. */
  assignment: MiningTaxAssignmentRecord | null;
}

interface JoinAssignDialogProps {
  open: boolean;
  onClose: () => void;
  primary: JoinCandidate;
  /** Every other same-system, same-character, ungrouped, assignable row — already filtered for the merge rule (an already-assigned `primary` only ever lists an unassigned candidate or one sharing its Payee and tax %). */
  candidates: readonly JoinCandidate[];
  /**
   * Whether `candidates` arrives as a list to pick from or as one already
   * chosen. `'none'` (the default) is the row-detail entry point: "join this
   * with something", every same-system row on offer. `'all'` is the selection
   * toolbar's Combine, where the pilot has already ticked exactly what they
   * meant — the list becomes a confirmation they can still untick from.
   */
  initialSelection?: 'none' | 'all';
  payees: readonly PayeeRecord[];
  typeNames: ReadonlyMap<number, string>;
  unitPrices: ReadonlyMap<number, number>;
  busy: boolean;
  onJoined: () => void;
}

function candidateKey(candidate: JoinCandidate): string {
  return candidate.assignment?.id ?? `${candidate.row.entry.date}:unassigned`;
}

/**
 * Joins the currently-open row with one or more compatible same-system entries
 * into one combined obligation (issue #523's "join entries" — a mining
 * session spanning midnight UTC shows up as two Mining Ledger Entries even
 * though a corp's own billing treats it as one; issue #539 lifted the
 * two-member cap, which was only ever in this picker — `joinAssignments` and
 * `flatten` were N-ary from the start).
 *
 * Deliberately no editable value fields here (unlike `AssignDialog`): once
 * two dates are joined each keeps its own independently Jita-priced value —
 * a blended, hand-typed total across two different ledger entries has no
 * single obvious meaning. A correction after the fact goes through the
 * ordinary single-Assignment editor for that one member
 * (`GroupSummaryModal`'s per-member Edit), not this dialog.
 *
 * Payee/tax % are only pickable when *neither* side is assigned yet; the
 * moment either side already has an Assignment, joining means adopting that
 * Assignment's Payee/tax % for the whole group (the still-unassigned side
 * gets a fresh Assignment created against it) rather than renegotiating
 * terms an existing obligation already settled.
 */
export function JoinAssignDialog({
  open,
  onClose,
  primary,
  candidates,
  initialSelection = 'none',
  payees,
  typeNames,
  unitPrices,
  busy,
  onJoined,
}: JoinAssignDialogProps) {
  const { t } = useTranslation();
  // Lazily initialised, never re-synced: the dialog is mounted fresh on each
  // open (the route renders it conditionally), so there is no stale-props case
  // to reconcile.
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() =>
    initialSelection === 'all' ? new Set(candidates.map(candidateKey)) : new Set()
  );
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [taxPct, setTaxPct] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = candidates.filter((c) => selectedKeys.has(candidateKey(c)));
  /**
   * The merge rule, from the same place the selection toolbar gets it.
   * `candidates` is pre-filtered against the *primary*, which is not enough
   * once several can be ticked at once: when the primary is still unassigned
   * that filter passes every assigned candidate through, so two of them on
   * different Payees could otherwise be joined and one side's terms silently
   * dropped.
   */
  const agreed = agreedTerms(
    [primary, ...selected]
      .map((c) => c.assignment)
      .filter((a): a is MiningTaxAssignmentRecord => a !== null)
  );
  const lockedTerms = agreed.ok ? agreed.terms : null;
  const effectivePayeeId = lockedTerms ? lockedTerms.payeeId : payeeId;
  const effectiveTaxPct = lockedTerms ? lockedTerms.taxPct : Number(taxPct);
  const canJoin =
    selected.length > 0 &&
    agreed.ok &&
    effectivePayeeId !== undefined &&
    effectivePayeeId !== null &&
    Number.isFinite(effectiveTaxPct) &&
    effectiveTaxPct >= 0 &&
    effectiveTaxPct <= 100;

  function toggle(key: string) {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function memberInput(candidate: JoinCandidate): JoinMemberInput {
    return {
      characterId: candidate.row.characterId,
      date: candidate.row.entry.date,
      solarSystemId: candidate.row.entry.solarSystemId,
      assignment: candidate.assignment,
      oreLines: candidate.assignment ? undefined : candidate.row.unassignedOreLines,
    };
  }

  async function handleJoin() {
    if (!canJoin || effectivePayeeId === null || effectivePayeeId === undefined) return;
    setSaving(true);
    try {
      await joinAssignments(
        [primary, ...selected].map(memberInput),
        effectivePayeeId,
        effectiveTaxPct,
        unitPrices
      );
      onJoined();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('miningTax.joinTitle')}>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('miningTax.joinCandidateLabel')}
          </p>
          {candidates.length === 0 ? (
            <p className="text-xs text-text-dim">{t('miningTax.joinNoCandidatesHint')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {candidates.map((candidate) => (
                <li key={candidateKey(candidate)} className="py-1">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(candidateKey(candidate))}
                      onChange={() => toggle(candidateKey(candidate))}
                      aria-label={t('miningTax.joinIncludeLabel', {
                        date: candidate.row.entry.date,
                      })}
                    />
                    <span>{candidate.row.entry.date}</span>
                    <span className="text-xs text-text-dim">
                      {(candidate.assignment
                        ? candidate.assignment.oreLines
                        : candidate.row.unassignedOreLines
                      )
                        .map((line) => typeNames.get(line.typeId) ?? `#${line.typeId}`)
                        .join(', ')}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {selected.length > 0 && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('miningTax.joinMemberCount', { count: selected.length + 1 })}
            </p>
          )}
        </div>

        {selected.length > 0 && (
          <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('miningTax.oreColumn')}
            </p>
            <ul className="divide-y divide-line text-xs">
              {[primary, ...selected].flatMap((candidate) =>
                (candidate.assignment
                  ? candidate.assignment.oreLines
                  : candidate.row.unassignedOreLines
                ).map((line) => (
                  <li
                    key={`${candidate.row.entry.date}:${line.typeId}`}
                    className="flex items-center gap-1.5 py-1 first:pt-0 last:pb-0"
                  >
                    <img src={typeIconUrl(line.typeId, 32)} alt="" className="h-4 w-4 shrink-0" />
                    <span className="w-40 shrink-0 truncate">
                      {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                    </span>
                    <span className="w-24 shrink-0 tabular-nums text-text-dim">
                      {line.quantity.toLocaleString()}
                    </span>
                    <span className="text-text-dim">{candidate.row.entry.date}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}

        {!agreed.ok ? (
          <p className="text-xs text-warning">{t('miningTax.combineBlocked.mixed-terms')}</p>
        ) : lockedTerms ? (
          <p className="text-xs text-text-dim">
            {t('miningTax.joinLockedToExistingHint', {
              payee: payees.find((p) => p.id === lockedTerms.payeeId)?.name ?? '',
              pct: lockedTerms.taxPct,
            })}
          </p>
        ) : (
          selected.length > 0 && (
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="min-w-0 space-y-1 sm:flex-1">
                <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('miningTax.payeeLabel')}
                </p>
                <Select
                  value={payeeId ?? undefined}
                  onValueChange={(value) => {
                    setPayeeId(value);
                    const chosen = payees.find((p) => p.id === value);
                    if (chosen) setTaxPct(String(chosen.defaultTaxPct));
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
            </div>
          )
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            variant="primary"
            size="sm"
            disabled={!canJoin || saving || busy}
            onClick={() => void handleJoin()}
          >
            {t('miningTax.joinConfirmAction')}
          </Button>
          <Button size="sm" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
