import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { OreIcon, OreLink } from './OreIcon';
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
  Checkbox,
  Tooltip,
} from '@/components/ui';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import { combine, type JoinMemberInput } from './ledgerActions';
import { agreedTerms } from './selection';
import type { MoonMiningTaxRow } from './snapshot';
import { useLedgerAction } from './useLedgerAction';
import { LedgerActionError } from './LedgerActionError';
import { toggleInSet } from '@/lib/sets';
import { formatCount } from '@/lib/formatCount';
import { Well } from '@/components/ui/Well';

export interface JoinCandidate {
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord | null;
}

interface JoinAssignDialogProps {
  open: boolean;
  onClose: () => void;
  primary: JoinCandidate;
  candidates: readonly JoinCandidate[];
  initialSelection?: 'none' | 'all';
  payees: readonly PayeeRecord[];
  typeNames: ReadonlyMap<number, string>;
  pricesFor: (hubId: string | undefined, date: string) => ReadonlyMap<number, number>;
  busy: boolean;
  onJoined: () => void;
}

function candidateKey(candidate: JoinCandidate): string {
  return candidate.assignment?.id ?? `${candidate.row.entry.date}:unassigned`;
}

export function JoinAssignDialog({
  open,
  onClose,
  primary,
  candidates,
  initialSelection = 'none',
  payees,
  typeNames,
  pricesFor,
  busy,
  onJoined,
}: JoinAssignDialogProps) {
  const { t } = useTranslation();
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() =>
    initialSelection === 'all' ? new Set(candidates.map(candidateKey)) : new Set()
  );
  const [payeeId, setPayeeId] = useState<string | null>(null);
  const [taxPct, setTaxPct] = useState('');
  const { pending: saving, error: saveError, run } = useLedgerAction();

  const selected = candidates.filter((c) => selectedKeys.has(candidateKey(c)));
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
    setSelectedKeys((previous) => toggleInSet(previous, key));
  }

  function memberInput(candidate: JoinCandidate): JoinMemberInput {
    return {
      characterId: candidate.row.characterId,
      date: candidate.row.entry.date,
      solarSystemId: candidate.row.entry.solarSystemId,
      assignment: candidate.assignment,
      oreLines: candidate.assignment ? undefined : candidate.row.unassignedOreLines,
      entryOreLines: candidate.row.entry.oreLines,
    };
  }

  async function handleJoin() {
    if (!canJoin || effectivePayeeId === null || effectivePayeeId === undefined) return;
    const hubId = payees.find((p) => p.id === effectivePayeeId)?.hubId;
    await run(
      () =>
        combine(
          [primary, ...selected].map(memberInput),
          effectivePayeeId,
          effectiveTaxPct,
          (date) => pricesFor(hubId, date)
        ),
      onJoined
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissOnOutsidePress={false}
      title={t('miningTax.joinTitle')}
    >
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <p className={eyebrowClassName}>{t('miningTax.joinCandidateLabel')}</p>
          {candidates.length === 0 ? (
            <p className="text-xs text-text-dim">{t('miningTax.joinNoCandidatesHint')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {candidates.map((candidate) => (
                <li key={candidateKey(candidate)} className="py-1">
                  <label
                    className={`flex cursor-pointer items-center gap-2 ${tappableRowClassName}`}
                  >
                    <Checkbox
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
                      ).map((line, index, lines) => (
                        <span key={line.typeId}>
                          <OreLink typeId={line.typeId}>
                            {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                          </OreLink>
                          {index < lines.length - 1 ? ', ' : ''}
                        </span>
                      ))}
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
          <Well className="space-y-1">
            <p className={eyebrowClassName}>{t('miningTax.oreColumn')}</p>
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
                    <OreIcon typeId={line.typeId} size={32} className="h-4 w-4 shrink-0" />
                    <span className="w-40 shrink-0 truncate">
                      <OreLink typeId={line.typeId}>
                        {typeNames.get(line.typeId) ?? `#${line.typeId}`}
                      </OreLink>
                    </span>
                    <span className="w-24 shrink-0 tabular-nums text-text-dim">
                      {formatCount(line.quantity)}
                    </span>
                    <span className="text-text-dim">{candidate.row.entry.date}</span>
                  </li>
                ))
              )}
            </ul>
          </Well>
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
                <p className={eyebrowClassName}>{t('miningTax.payeeLabel')}</p>
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
                <p className={eyebrowClassName}>{t('miningTax.taxPctLabel')}</p>
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

        <LedgerActionError error={saveError} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Tooltip content={!canJoin ? t('common.needsInput') : null}>
            <Button
              variant="primary"
              size="sm"
              loading={saving || busy}
              aria-disabled={!canJoin || undefined}
              onClick={() => void handleJoin()}
            >
              {t('miningTax.joinConfirmAction')}
            </Button>
          </Tooltip>
          <Button size="sm" onClick={onClose}>
            {t('filters.cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
