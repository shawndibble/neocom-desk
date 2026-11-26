import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { InlineError } from '@/components/ui/InlineError';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { plainTextActionClassName } from '@/components/ui/plainTextActionClassName';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Field,
  Fields,
  IconButton,
  textActionClassName,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { PayeeRecord } from '@/db';
import type { PayeeRunningAccount } from '@/engine/miningTax/payeeRunningAccount';
import { formatIsk } from '@/lib/isk';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { useSystemName } from '@/features/route/useSolarSystems';
import {
  corporationNamed,
  payeesOfBookCorporation,
  type NamedCorporation,
} from '@/engine/miningTax/payeeCorporation';
import { DefaultSystemsField } from './DefaultSystemsField';
import { deletePayee } from './ledgerActions';
import { PayeeNameField } from './PayeeNameField';
import type { PayeeEntityMatch } from './payeeEntitySearch';
import { lookupPayeeName, NEW_PAYEE_KINDS } from './payeeLookup';
import { groupPayees, type PayeeGroup, type PayeeVariant } from './payeeGroups';
import {
  DefaultSystemTakenError,
  applyPayeeTerms,
  setPayeesArchived,
  createPayee,
  loadPayees,
  updatePayee,
  type PayeeEntityKind,
} from './payees';
import { payeeSystemNames } from './payeeSystemNames';
import { hubForPayee } from './pricing';
import type { TrackedCharacter } from './snapshot';
import { DialogFooter } from '@/components/ui/DialogFooter';

interface PayeeManagerDialogProps {
  open: boolean;
  onClose: () => void;
  characters: readonly TrackedCharacter[];
  payeesByCharacter: ReadonlyMap<number, PayeeRecord[]>;
  initialCharacterId: number;
  onChanged: () => void;
  owedByPayee?: ReadonlyMap<string, PayeeOwed>;
  systemsByPayee?: ReadonlyMap<string, ReadonlySet<number>>;
  systemNames?: ReadonlyMap<number, string>;
  bookCorporations?: readonly BookCorporation[];
  accountOf?: (payeeId: string) => PayeeRunningAccount | undefined;
  onOpenLedger?: (payeeId: string) => void;
  isArchived?: (payeeId: string) => boolean;
  bookOwnerOf?: (payeeId: string) => string | undefined;
}

export interface PayeeOwed {
  amount: number;
  count: number;
  moving: number;
}

interface DraftPayee {
  id: string | null;
  name: string;
  defaultTaxPct: string;
  hubId: TradeHub['id'];
  defaultSystemIds: number[];
  entityId?: number;
  entityKind?: PayeeEntityKind;
  verifiedName?: string;
}

function DefaultSystemTaken({ systemId, holderName }: { systemId: number; holderName: string }) {
  const { t } = useTranslation();
  const system = useSystemName(systemId) ?? `#${systemId}`;
  return (
    <InlineError>
      {t('miningTax.payees.defaultSystemTaken', { system, payee: holderName })}
    </InlineError>
  );
}

export interface BookCorporation extends NamedCorporation {
  credit?: number;
}

const NO_BOOK_CORPORATIONS: readonly BookCorporation[] = [];

const EMPTY_DRAFT: DraftPayee = {
  id: null,
  name: '',
  defaultTaxPct: '',
  hubId: DEFAULT_TRADE_HUB.id,
  defaultSystemIds: [],
};

export function PayeeManagerDialog({
  open,
  onClose,
  characters,
  payeesByCharacter,
  initialCharacterId,
  onChanged,
  owedByPayee,
  systemsByPayee,
  systemNames,
  bookCorporations = NO_BOOK_CORPORATIONS,
  accountOf,
  onOpenLedger,
  isArchived,
  bookOwnerOf,
}: PayeeManagerDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [payeesByCharacterState, setPayeesByCharacterState] = useState(payeesByCharacter);
  const [draft, setDraft] = useState<DraftPayee>(EMPTY_DRAFT);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftGeneration = useRef(0);
  const [choices, setChoices] = useState<{ name: string; matches: PayeeEntityMatch[] } | null>(
    null
  );
  const [taken, setTaken] = useState<{ systemId: number; holderName: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingPayee, setDeletingPayee] = useState<PayeeRecord | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>('');

  const payees = useMemo(() => {
    const seen = new Map<string, PayeeRecord>();
    for (const list of payeesByCharacterState.values()) {
      for (const payee of list) seen.set(payee.id, payee);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [payeesByCharacterState]);

  const groups = useMemo(() => groupPayees(payees), [payees]);
  const groupOf = (payeeId: string) => groups.find((g) => g.members.some((m) => m.id === payeeId));

  const characterNameOf = (characterId: number) =>
    characters.find((c) => c.characterId === characterId)?.characterName ?? `#${characterId}`;

  const showForm = formOpen || payees.length === 0;
  const namedBook = corporationNamed(draft.name, bookCorporations);
  const suggestedBook =
    namedBook && !(draft.entityKind === 'corporation' && draft.entityId === namedBook.corporationId)
      ? namedBook
      : undefined;

  async function refresh() {
    const entries = await Promise.all(
      characters.map(async (c) => [c.characterId, await loadPayees(c.characterId)] as const)
    );
    setPayeesByCharacterState(new Map(entries));
  }

  function closeForm() {
    draftGeneration.current += 1;
    setDraft(EMPTY_DRAFT);
    setError(null);
    setChoices(null);
    setTaken(null);
    setFormOpen(false);
  }

  function startAdd() {
    draftGeneration.current += 1;
    setDraft(EMPTY_DRAFT);
    setError(null);
    setChoices(null);
    setFormOpen(true);
  }

  function startEdit(payee: PayeeRecord) {
    draftGeneration.current += 1;
    setDraft({
      id: payee.id,
      name: payee.name,
      defaultTaxPct: String(payee.defaultTaxPct),
      hubId: hubForPayee(payee.hubId).id,
      defaultSystemIds: payee.defaultSystems?.map((s) => s.systemId) ?? [],
      entityId: payee.entityId,
      entityKind: payee.entityKind,
      verifiedName: payee.entityId !== undefined ? payee.name : undefined,
    });
    setError(null);
    setChoices(null);
    setFormOpen(true);
  }

  async function handleSave(current: DraftPayee = draft) {
    const name = current.name.trim();
    const pct = Number(current.defaultTaxPct);
    if (!name) {
      setError(t('miningTax.payeeNameRequired'));
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError(t('miningTax.payeeTaxPctInvalid'));
      return;
    }
    let { entityId, entityKind } = current;
    let savedName = name;
    setChoices(null);
    const existingUnlinked = payees.find(
      (p) => p.id === current.id && p.entityId === undefined && p.name.trim() === name
    );
    if (entityId === undefined) {
      const generation = draftGeneration.current;
      const lookup = await lookupPayeeName(name);
      if (generation !== draftGeneration.current) return;
      if (lookup.status === 'found') {
        entityId = lookup.match.id;
        entityKind = lookup.match.kind;
        savedName = lookup.match.name;
      } else if (!existingUnlinked) {
        if (lookup.status === 'several') {
          setError(null);
          setChoices({ name, matches: lookup.matches });
        } else {
          setError(
            t(
              lookup.status === 'none'
                ? 'miningTax.payees.notInEve.none'
                : 'miningTax.payees.notInEve.failed',
              {
                name,
              }
            )
          );
        }
        return;
      }
    }
    const input = {
      name: savedName,
      defaultTaxPct: pct,
      defaultSystemIds: current.defaultSystemIds,
      entityId,
      entityKind,
      ...(current.hubId === DEFAULT_TRADE_HUB.id ? {} : { hubId: current.hubId }),
    };
    const existing = current.id ? payees.find((p) => p.id === current.id) : undefined;
    try {
      if (existing) {
        const saved = await updatePayee(existing, input);
        await applyPayeeTerms(saved, groupOf(existing.id)?.members ?? []);
      } else {
        await createPayee(initialCharacterId, input);
      }
    } catch (cause) {
      if (cause instanceof DefaultSystemTakenError) {
        setTaken({ systemId: cause.systemId, holderName: cause.holderName });
        return;
      }
      throw cause;
    }
    closeForm();
    await refresh();
    onChanged();
  }

  function handleNameChange(name: string) {
    draftGeneration.current += 1;
    setChoices(null);
    const stale = draft.verifiedName !== undefined && name !== draft.verifiedName;
    setDraft({
      ...draft,
      name,
      ...(stale ? { entityId: undefined, entityKind: undefined, verifiedName: undefined } : {}),
    });
  }

  function picked(match: PayeeEntityMatch): DraftPayee {
    return {
      ...draft,
      name: match.name,
      entityId: match.id,
      entityKind: match.kind,
      verifiedName: match.name,
    };
  }

  function handlePick(match: PayeeEntityMatch) {
    draftGeneration.current += 1;
    setChoices(null);
    setError(null);
    setDraft(picked(match));
  }

  function handleChoose(match: PayeeEntityMatch) {
    const next = picked(match);
    setDraft(next);
    void handleSave(next);
  }

  async function handleDelete(payee: PayeeRecord, moveToPayeeId?: string) {
    setDeleteError(null);
    const members = groupOf(payee.id)?.members ?? [payee];
    for (const member of members) {
      if (!(await deletePayee(member, moveToPayeeId)).ok) {
        setDeleteError(t('miningTax.payees.deleteFailed', { name: payee.name }));
        await refresh();
        onChanged();
        return;
      }
    }
    if (draft.id === payee.id) closeForm();
    await refresh();
    onChanged();
  }

  function openDelete(payee: PayeeRecord) {
    setDeletingPayee(payee);
    setMoveTargetId('');
  }

  function confirmDelete(moveAndDelete = false) {
    const payee = deletingPayee;
    setDeletingPayee(null);
    if (!payee) return;
    const owed = owedOfGroup(groupOf(payee.id));
    void handleDelete(payee, moveAndDelete && owed && moveTargetId ? moveTargetId : undefined);
  }

  function owedOfGroup(group: PayeeGroup | undefined): PayeeOwed | undefined {
    const parts = group?.members.flatMap((m) => owedByPayee?.get(m.id) ?? []) ?? [];
    if (parts.length === 0) return undefined;
    return parts.reduce((sum, o) => ({
      amount: sum.amount + o.amount,
      count: sum.count + o.count,
      moving: sum.moving + o.moving,
    }));
  }

  function creditOfGroup(group: PayeeGroup): number {
    const ids = new Set(group.members.map((m) => m.id));
    const own = accountOf?.(group.primary.id)?.credit ?? 0;
    return bookCorporations.reduce(
      (sum, corp) =>
        (corp.credit ?? 0) > 0 && payeesOfBookCorporation(payees, corp).some((p) => ids.has(p.id))
          ? sum + (corp.credit ?? 0)
          : sum,
      own
    );
  }

  function balanceReadout(payee: PayeeRecord, readout: ReactNode) {
    if (!readout || !onOpenLedger) return readout;
    return (
      <button
        type="button"
        onClick={() => onOpenLedger(payee.id)}
        aria-label={t('miningTax.ledger.openFor', { payee: payee.name })}
        className={plainTextActionClassName('shrink-0')}
      >
        {readout}
      </button>
    );
  }

  async function archive(group: PayeeGroup, archived: boolean) {
    await setPayeesArchived(group.members, archived);
    await refresh();
    onChanged();
  }

  async function applyVariant(group: PayeeGroup, variant: PayeeVariant) {
    await applyPayeeTerms(variant.members[0], group.members);
    await refresh();
    onChanged();
  }

  const deletingGroup = deletingPayee ? groupOf(deletingPayee.id) : undefined;
  const deletingOwed =
    (owedOfGroup(deletingGroup)?.count ?? 0) > 0 ? owedOfGroup(deletingGroup) : undefined;
  const moveTargets = groups.filter((g) => g !== deletingGroup).map((g) => g.primary);

  const archivedGroups = groups.filter((g) => isArchived?.(g.primary.id));
  const renderGroup = (group: PayeeGroup, archived: boolean) => {
    const payee = group.primary;
    const owed = owedOfGroup(group);
    const credit = creditOfGroup(group);
    const systems = payeeSystemNames(
      new Set(group.members.flatMap((m) => [...(systemsByPayee?.get(m.id) ?? [])])),
      systemNames
    );
    const hub = hubForPayee(payee.hubId).systemName;
    return (
      <li key={group.key} className="flex items-center gap-1 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Tooltip content={payee.name}>
              <p className="min-w-0 flex-1 truncate text-sm">{payee.name}</p>
            </Tooltip>
            {bookOwnerOf?.(payee.id) !== undefined ? (
              <>
                <span className="shrink-0 text-xs text-text-dim">
                  {t('miningTax.payees.trackedByBook', { corp: bookOwnerOf(payee.id) })}
                </span>
                {onOpenLedger && (
                  <button
                    type="button"
                    onClick={() => onOpenLedger(payee.id)}
                    className={textActionClassName()}
                  >
                    {t('miningTax.payees.oldHistory')}
                  </button>
                )}
              </>
            ) : (
              balanceReadout(
                payee,
                owed && owed.amount > 0 ? (
                  <span className="shrink-0 text-xs text-isk-neg tabular-nums">
                    {t('miningTax.payees.owed', { amount: formatIsk(owed.amount, 0) })}
                  </span>
                ) : credit > 0 ? (
                  <span className="shrink-0 text-xs text-isk-pos tabular-nums">
                    {t('miningTax.payees.credit', { amount: formatIsk(credit, 0) })}
                  </span>
                ) : owedByPayee ? (
                  <span className="shrink-0 text-xs text-text-dim">
                    {t('miningTax.payees.settled')}
                  </span>
                ) : null
              )
            )}
          </div>
          <p className="mt-0.5 truncate text-[0.6875rem] text-text-dim">
            {systems.length > 0
              ? t('miningTax.payees.detailWithSystems', {
                  pct: payee.defaultTaxPct,
                  hub,
                  systems: systems.join(', '),
                })
              : t('miningTax.payees.detail', { pct: payee.defaultTaxPct, hub })}
            <span>
              {' · '}
              {payee.entityKind !== undefined ? (
                t(`miningTax.payees.verify.kind.${payee.entityKind}`)
              ) : payee.entityId !== undefined ? (
                t('miningTax.payees.verify.linkedShort')
              ) : (
                <span className="text-warning">{t('miningTax.payees.verify.notFoundShort')}</span>
              )}
            </span>
          </p>
          {archived ? (
            <button
              type="button"
              className={textActionClassName()}
              aria-label={t('miningTax.payees.unarchiveNamed', { name: payee.name })}
              onClick={() => void archive(group, false)}
            >
              {t('miningTax.payees.unarchive')}
            </button>
          ) : bookOwnerOf?.(payee.id) === undefined ? (
            owed && owed.amount > 0 ? (
              <p className="mt-0.5 text-[0.6875rem] text-text-dim">
                {t('miningTax.payees.archiveOwes')}
              </p>
            ) : (
              <button
                type="button"
                className={textActionClassName()}
                aria-label={t('miningTax.payees.archiveNamed', { name: payee.name })}
                onClick={() => void archive(group, true)}
              >
                {t('miningTax.payees.archive')}
              </button>
            )
          ) : null}
          {group.members.length > 1 && (
            <p className="mt-0.5 text-[0.6875rem] text-text-dim">
              {t('miningTax.payees.sharedByCharacters', {
                count: group.members.length,
              })}
            </p>
          )}
          {group.variants.length > 1 && (
            <div className="mt-1 space-y-1">
              <p className="text-[0.6875rem] text-warning">{t('miningTax.payees.termsDiffer')}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.variants.map((variant) => (
                  <Button
                    key={`${variant.members[0].defaultTaxPct}-${variant.members[0].hubId ?? ''}`}
                    size="sm"
                    onClick={() => void applyVariant(group, variant)}
                  >
                    {t('miningTax.payees.useTermsForAll', {
                      pct: variant.members[0].defaultTaxPct,
                      hub: hubForPayee(variant.members[0].hubId).systemName,
                      characters: variant.members
                        .map((m) => characterNameOf(m.characterId))
                        .join(', '),
                    })}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <IconButton
          variant="plain"
          size="row"
          icon={<Icon.Rename />}
          label={t('miningTax.editPayee', { name: payee.name })}
          onClick={() => startEdit(payee)}
        />
      </li>
    );
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        closeForm();
        onClose();
      }}
      dismissOnOutsidePress={false}
      title={t('miningTax.managePayeesTitle')}
    >
      <div className="space-y-3">
        {!showForm && (
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={startAdd}>
              <Icon.AddRow aria-hidden="true" />
              {t('miningTax.payees.addButton')}
            </Button>
          </div>
        )}

        {deleteError && <InlineError>{deleteError}</InlineError>}
        {payees.length === 0 ? (
          <p className="text-xs text-text-dim">{t('miningTax.payeesEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {groups.filter((g) => !isArchived?.(g.primary.id)).map((g) => renderGroup(g, false))}
          </ul>
        )}
        {archivedGroups.length > 0 && (
          <section aria-label={t('miningTax.payees.archivedTitle')}>
            <p className={eyebrowClassName}>{t('miningTax.payees.archivedTitle')}</p>
            <ul className="divide-y divide-line">
              {archivedGroups.map((g) => renderGroup(g, true))}
            </ul>
          </section>
        )}

        {showForm && (
          <div className="space-y-3 border-t border-line pt-3">
            <p className={eyebrowClassName}>
              {draft.id ? t('miningTax.editPayeeTitle') : t('miningTax.addPayeeTitle')}
            </p>
            <Fields>
              <Field
                label={t('miningTax.payees.nameLabel')}
                htmlFor={`${formId}-name`}
                note={
                  draft.entityKind !== undefined
                    ? t('miningTax.payees.verify.verifiedNote', {
                        kind: t(`miningTax.payees.verify.kind.${draft.entityKind}`),
                      })
                    : draft.entityId !== undefined
                      ? t('miningTax.payees.verify.linkedNote')
                      : draft.id
                        ? t('miningTax.payees.verify.unverifiedNote')
                        : undefined
                }
              >
                <PayeeNameField
                  id={`${formId}-name`}
                  characterId={initialCharacterId}
                  value={draft.name}
                  onChange={handleNameChange}
                  onPick={handlePick}
                  kinds={NEW_PAYEE_KINDS}
                />
              </Field>
              {choices && (
                <div className="col-span-full space-y-2 text-xs">
                  <p>{t('miningTax.payees.notInEve.several', { name: choices.name })}</p>
                  <div className="flex flex-wrap gap-2">
                    {choices.matches.map((match) => (
                      <Button
                        key={`${match.kind}-${match.id}`}
                        size="sm"
                        onClick={() => handleChoose(match)}
                      >
                        {t('miningTax.payees.notInEve.choice', {
                          name: match.name,
                          kind: t(`miningTax.payees.verify.kind.${match.kind}`),
                        })}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {suggestedBook && (
                <div className="col-span-full flex flex-wrap items-center gap-2 text-xs text-text-dim">
                  <p className="min-w-0 flex-1">
                    {t('miningTax.payees.bookLink.note', { corp: suggestedBook.name })}
                  </p>
                  <Button
                    size="sm"
                    onClick={() =>
                      handlePick({
                        id: suggestedBook.corporationId,
                        name: suggestedBook.name,
                        kind: 'corporation',
                      })
                    }
                  >
                    {t('miningTax.payees.bookLink.action', { corp: suggestedBook.name })}
                  </Button>
                </div>
              )}
              <Field label={t('miningTax.payees.taxPctLabel')} htmlFor={`${formId}-pct`}>
                <TextInput
                  id={`${formId}-pct`}
                  className="w-24"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={draft.defaultTaxPct}
                  onChange={(e) => setDraft({ ...draft, defaultTaxPct: e.target.value })}
                />
              </Field>
              <Field label={t('miningTax.payeeHubLabel')} note={t('miningTax.payeeHubHint')}>
                <Select
                  value={draft.hubId}
                  onValueChange={(value) => setDraft({ ...draft, hubId: value as TradeHub['id'] })}
                >
                  <SelectTrigger aria-label={t('miningTax.payeeHubLabel')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRADE_HUBS.map((hub) => (
                      <SelectItem key={hub.id} value={hub.id}>
                        {hub.id === DEFAULT_TRADE_HUB.id
                          ? t('miningTax.payeeHubDefaultOption', { hub: hub.systemName })
                          : hub.systemName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label={t('miningTax.payees.defaultSystemsLabel')}
                note={t('miningTax.payees.defaultSystemsHint')}
              >
                <DefaultSystemsField
                  systemIds={draft.defaultSystemIds}
                  onChange={(defaultSystemIds) => {
                    setTaken(null);
                    setDraft({ ...draft, defaultSystemIds });
                  }}
                />
              </Field>
            </Fields>
            {taken && (
              <DefaultSystemTaken systemId={taken.systemId} holderName={taken.holderName} />
            )}
            {error && <InlineError>{error}</InlineError>}
            <DialogFooter>
              {draft.id && (
                <Button
                  variant="danger"
                  size="sm"
                  className="mr-auto"
                  aria-label={t('miningTax.deletePayeeNamed', { name: draft.name || draft.id })}
                  onClick={() => {
                    const target = payees.find((p) => p.id === draft.id);
                    if (target) openDelete(target);
                  }}
                >
                  {t('miningTax.deletePayeeAction')}
                </Button>
              )}
              {payees.length > 0 && (
                <Button size="sm" onClick={closeForm}>
                  {t('filters.cancel')}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => void handleSave()}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </div>
      <Modal
        open={deletingPayee !== null}
        onClose={() => setDeletingPayee(null)}
        title={t('miningTax.deletePayeeAction')}
      >
        {deletingOwed ? (
          <div className="space-y-3">
            <p className="text-xs">
              {t('miningTax.payees.deleteOwed', {
                name: deletingPayee?.name ?? '',
                count: deletingOwed.count,
                amount: formatIsk(deletingOwed.amount, 0),
              })}
            </p>
            {moveTargets.length > 0 && deletingOwed.moving > deletingOwed.count && (
              <p className="text-xs">
                {t('miningTax.payees.moveTakesCombined', { count: deletingOwed.moving })}
              </p>
            )}
            {moveTargets.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={moveTargetId} onValueChange={setMoveTargetId}>
                  <SelectTrigger
                    aria-label={t('miningTax.payees.moveToLabel')}
                    className="min-w-0 flex-1"
                  >
                    <SelectValue placeholder={t('miningTax.payees.moveToLabel')} />
                  </SelectTrigger>
                  <SelectContent>
                    {moveTargets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Tooltip
                  content={!moveTargetId ? t('miningTax.payees.moveAndDeleteNeedsTarget') : null}
                >
                  <Button
                    variant="danger"
                    aria-disabled={!moveTargetId || undefined}
                    onClick={() => confirmDelete(true)}
                  >
                    {t('miningTax.payees.moveAndDelete')}
                  </Button>
                </Tooltip>
              </div>
            )}
            <p className="text-[0.6875rem] text-text-dim">
              {t('miningTax.payees.deleteAnywayHint')}
            </p>
            <DialogFooter>
              <Button size="sm" onClick={() => setDeletingPayee(null)}>
                {t('filters.cancel')}
              </Button>
              <Button size="sm" onClick={() => confirmDelete(false)}>
                {t('miningTax.payees.deleteAnyway')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <p className="text-xs text-text-dim">
              {t('miningTax.deletePayeeConfirm', { name: deletingPayee?.name ?? '' })}
            </p>
            <DialogFooter className="mt-3">
              <Button size="sm" onClick={() => setDeletingPayee(null)}>
                {t('filters.cancel')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => confirmDelete(false)}>
                {t('miningTax.deletePayeeAction')}
              </Button>
            </DialogFooter>
          </>
        )}
      </Modal>
    </Modal>
  );
}
