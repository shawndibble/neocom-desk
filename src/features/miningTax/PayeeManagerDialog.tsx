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
import type { PayeeAccount } from '@/engine/miningTax/payeeAccount';
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
  /** Every tracked character's current Payees, already loaded by the parent route's snapshot — the initial list here is seeded from this rather than a fresh Dexie read. */
  payeesByCharacter: ReadonlyMap<number, PayeeRecord[]>;
  /**
   * Which character a newly-created Payee is stored under — a Payee row still
   * belongs to one character in Dexie, even though a corp's landlord list is
   * the same regardless of which alt is looking. Usually whichever character
   * the "Manage Payees" action was pressed from.
   */
  initialCharacterId: number;
  onChanged: () => void;
  /**
   * What each Payee is still owed — outstanding Assignments only — keyed by
   * Payee id. Drives the row's balance and the delete
   * confirmation's "move them first" offer; absent reads as nothing owed.
   */
  owedByPayee?: ReadonlyMap<string, PayeeOwed>;
  /** The systems each Payee has been mined for, learned from Assignments (`suggestPayeeForSystem`'s `systemsByPayee`). */
  systemsByPayee?: ReadonlyMap<string, ReadonlySet<number>>;
  /** Display names for the ids in `systemsByPayee`; an id without one is left out of the row. */
  systemNames?: ReadonlyMap<number, string>;
  /**
   * The corporations whose Corp Tax Book the member can see. A Payee named for
   * one is offered the link to it (#6205): the book counts a Payee linked to its
   * corporation as its own (`payeesOfBookCorporation`).
   */
  bookCorporations?: readonly BookCorporation[];
  /** Each personal Payee's Running account, by any of its record ids: its credit, and its ledger. */
  accountOf?: (payeeId: string) => PayeeAccount | undefined;
  /** Opens a Payee's ledger: each row's balance is the way in, owed, in credit or settled. */
  onOpenLedger?: (payeeId: string) => void;
}

export interface PayeeOwed {
  amount: number;
  /** How many owed entries make up `amount`. */
  count: number;
  /**
   * How many entries "Move and delete" takes — `count` plus the other days of
   * any Combined Entry those are in (`assignmentsMovedWithPayee`).
   */
  moving: number;
}

interface DraftPayee {
  id: string | null;
  name: string;
  defaultTaxPct: string;
  /**
   * Always a concrete hub, never absent — the *stored* field is optional, and
   * the default hub's own id is what "stored nothing" round-trips through.
   * That keeps one option in the picker meaning Jita, rather than a "default"
   * entry and a "Jita" entry that a pilot would have to be told are the same.
   */
  hubId: TradeHub['id'];
  /** The systems this Payee is the default for (`PayeeRecord.defaultSystems`); the start day of each is kept by `updatePayee`. */
  defaultSystemIds: number[];
  /**
   * The EVE entity this Payee is: set by picking a suggestion, or carried from
   * the stored Payee (a payment may have taught it the id without a kind).
   */
  entityId?: number;
  entityKind?: PayeeEntityKind;
  /** The name the entity was verified under; editing away from it clears the verification. */
  verifiedName?: string;
}

/** Which Payee already has the system the pilot tried to add. */
function DefaultSystemTaken({ systemId, holderName }: { systemId: number; holderName: string }) {
  const { t } = useTranslation();
  const system = useSystemName(systemId) ?? `#${systemId}`;
  return (
    <InlineError>
      {t('miningTax.payees.defaultSystemTaken', { system, payee: holderName })}
    </InlineError>
  );
}

/** A Corp Tax Book's corporation, with the ISK the member has paid it beyond every open day. */
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

/**
 * Manage Payees (decision doc): create/edit/remove the corps and people a
 * character owes a moon-rental tax to. Payees are shared across every
 * tracked character — a landlord doesn't change depending on which alt is
 * looking — so this lists the union of all of them rather than gating on one
 * character at a time. Name, default tax %, and the trade hub the Payee's ore
 * is valued at, and its Default Systems (GLOSSARY.md), which only this form edits.
 *
 * The hub belongs to the Payee rather than to this device because the figure
 * it produces is a bill one player sends another: a device-local pick would
 * have two corpmates computing different amounts owed for the same ore. It is
 * deliberately not the Market Browser's `marketHub`, which is one pilot's
 * viewing preference.
 */
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
}: PayeeManagerDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [payeesByCharacterState, setPayeesByCharacterState] = useState(payeesByCharacter);
  const [draft, setDraft] = useState<DraftPayee>(EMPTY_DRAFT);
  // The add/edit form stays out of the way until asked for — the list is what
  // the dialog is for. An empty list shows it regardless (see `showForm`).
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped whenever the form starts over or its name changes: a lookup answered after that
  // belongs to an older draft and is dropped.
  const draftGeneration = useRef(0);
  // Several corporations/characters answer to the typed name: the pilot picks one.
  const [choices, setChoices] = useState<{ name: string; matches: PayeeEntityMatch[] } | null>(
    null
  );
  // A Default System another of the Character's Payees already holds: shown above Save.
  const [taken, setTaken] = useState<{ systemId: number; holderName: string } | null>(null);
  // Shown above the list: the add/edit form (and its own error line) may be closed.
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingPayee, setDeletingPayee] = useState<PayeeRecord | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>('');

  // Deduped by id: the same corp Payee, however it's stored per-character
  // under the hood, must not show up twice just because two alts happen to
  // owe it.
  const payees = useMemo(() => {
    const seen = new Map<string, PayeeRecord>();
    for (const list of payeesByCharacterState.values()) {
      for (const payee of list) seen.set(payee.id, payee);
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [payeesByCharacterState]);

  // One row per corporation or player: a pilot's alts each hold a record of the same recipient.
  const groups = useMemo(() => groupPayees(payees), [payees]);
  const groupOf = (payeeId: string) => groups.find((g) => g.members.some((m) => m.id === payeeId));

  const characterNameOf = (characterId: number) =>
    characters.find((c) => c.characterId === characterId)?.characterName ?? `#${characterId}`;

  const showForm = formOpen || payees.length === 0;
  // A name matching a Corp Tax Book's corporation the draft is not yet linked to.
  const namedBook = corporationNamed(draft.name, bookCorporations);
  const suggestedBook =
    namedBook && !(draft.entityKind === 'corporation' && draft.entityId === namedBook.corporationId)
      ? namedBook
      : undefined;

  // A genuinely fresh read after a mutation, since the parent's snapshot map
  // is a point-in-time seed and won't reflect this dialog's own edit until
  // its next full refresh. Reloads every tracked character since a mutation
  // could touch any of them (an edit keeps its Payee's existing owner; a new
  // Payee is created under `initialCharacterId`).
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
      // A stored hub this build doesn't know reads as Jita here exactly as it
      // does when pricing — the picker never opens on a blank selection.
      hubId: hubForPayee(payee.hubId).id,
      defaultSystemIds: payee.defaultSystems?.map((s) => s.systemId) ?? [],
      entityId: payee.entityId,
      entityKind: payee.entityKind,
      // Any link is tied to the name it was made under: renaming asks EVE again, so a Payee is
      // never saved under one name while pointing at someone else.
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
    // A Payee is someone in EVE (scope decision 20261117-005150): a name typed
    // without picking a suggestion gets one exact-name lookup, and only a single
    // corporation or character saves. None, several (the pilot picks) or a failed
    // lookup save nothing. A linked Payee whose name is unchanged asks nothing.
    let { entityId, entityKind } = current;
    let savedName = name;
    setChoices(null);
    // An old unlinked Payee kept under its own name may still have its rate, hub or systems
    // changed: it stays flagged until the pilot picks who it is, but is never locked.
    const existingUnlinked = payees.find(
      (p) => p.id === current.id && p.entityId === undefined && p.name.trim() === name
    );
    if (entityId === undefined) {
      const generation = draftGeneration.current;
      const lookup = await lookupPayeeName(name);
      // The pilot moved on (another Payee, a new name, the form closed): not this draft's answer.
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
      // Otherwise an old unlinked Payee saved as it was: still unlinked, still flagged.
    }
    // The default hub is stored as *no* hub, which is what every Payee
    // predating this field already means — so "Jita" never becomes a second
    // way of saying the same thing that only some records carry.
    const input = {
      name: savedName,
      defaultTaxPct: pct,
      defaultSystemIds: current.defaultSystemIds,
      entityId,
      // An id with no kind (learned from a payment) keeps whatever the record has.
      entityKind,
      ...(current.hubId === DEFAULT_TRADE_HUB.id ? {} : { hubId: current.hubId }),
    };
    const existing = current.id ? payees.find((p) => p.id === current.id) : undefined;
    try {
      if (existing) {
        const saved = await updatePayee(existing, input);
        // A Payee is one recipient whatever the Character: its other records bill the same.
        await applyPayeeTerms(saved, groupOf(existing.id)?.members ?? []);
      } else {
        await createPayee(initialCharacterId, input);
      }
    } catch (cause) {
      // One Default Payee per system: say who has it instead of saving.
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
    // Editing the name after verifying clears the verification.
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

  /** One of several of the same name, picked after Save asked: saves it straight away. */
  function handleChoose(match: PayeeEntityMatch) {
    const next = picked(match);
    setDraft(next);
    void handleSave(next);
  }

  async function handleDelete(payee: PayeeRecord, moveToPayeeId?: string) {
    // One transaction: a failure leaves the Payee and every entry's label intact.
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

  /** What a group is owed: its records' Assignments summed. */
  function owedOfGroup(group: PayeeGroup | undefined): PayeeOwed | undefined {
    const parts = group?.members.flatMap((m) => owedByPayee?.get(m.id) ?? []) ?? [];
    if (parts.length === 0) return undefined;
    return parts.reduce((sum, o) => ({
      amount: sum.amount + o.amount,
      count: sum.count + o.count,
      moving: sum.moving + o.moving,
    }));
  }

  /**
   * What the member has paid a group beyond what it bills: its Running account's credit, and
   * that of a Corp Tax Book it is linked to.
   */
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

  /**
   * A row's balance is the readout of the Payee's ledger, so it opens it (DESIGN §6c, as on the
   * Payee card): the way into the ledger of a Payee that owes nothing and so has no card.
   */
  function balanceReadout(payee: PayeeRecord, readout: ReactNode) {
    if (!readout || !onOpenLedger || !accountOf?.(payee.id)) return readout;
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

  /** The pilot's pick of which terms a merged Payee's records all bill with. */
  async function applyVariant(group: PayeeGroup, variant: PayeeVariant) {
    await applyPayeeTerms(variant.members[0], group.members);
    await refresh();
    onChanged();
  }

  const deletingGroup = deletingPayee ? groupOf(deletingPayee.id) : undefined;
  const deletingOwed =
    (owedOfGroup(deletingGroup)?.count ?? 0) > 0 ? owedOfGroup(deletingGroup) : undefined;
  const moveTargets = groups.filter((g) => g !== deletingGroup).map((g) => g.primary);

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
            {groups.map((group) => {
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
                      {balanceReadout(
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
                          // The row's Edit carries the fix: pick who this is there.
                          <span className="text-warning">
                            {t('miningTax.payees.verify.notFoundShort')}
                          </span>
                        )}
                      </span>
                    </p>
                    {group.members.length > 1 && (
                      <p className="mt-0.5 text-[0.6875rem] text-text-dim">
                        {t('miningTax.payees.sharedByCharacters', {
                          count: group.members.length,
                        })}
                      </p>
                    )}
                    {group.variants.length > 1 && (
                      <div className="mt-1 space-y-1">
                        <p className="text-[0.6875rem] text-warning">
                          {t('miningTax.payees.termsDiffer')}
                        </p>
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
            })}
          </ul>
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
                <Button
                  variant="danger"
                  disabled={!moveTargetId}
                  onClick={() => confirmDelete(true)}
                >
                  {t('miningTax.payees.moveAndDelete')}
                </Button>
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
