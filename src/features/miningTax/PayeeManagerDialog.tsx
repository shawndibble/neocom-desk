import { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { formatIsk } from '@/lib/isk';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { deletePayee } from './ledgerActions';
import { createPayee, loadPayees, updatePayee } from './payees';
import { payeeSystemNames } from './payeeSystemNames';
import { hubForPayee } from './pricing';
import type { TrackedCharacter } from './snapshot';

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
  /**
   * Carried through the edit round-trip untouched. `updatePayee` deletes any
   * field its input omits, so not carrying this would make an ordinary rename
   * silently forget the system `AssignDialog`'s "remember this system"
   * checkbox learned.
   */
  systemId?: number;
}

const EMPTY_DRAFT: DraftPayee = {
  id: null,
  name: '',
  defaultTaxPct: '',
  hubId: DEFAULT_TRADE_HUB.id,
};

/**
 * Manage Payees (decision doc): create/edit/remove the corps and people a
 * character owes a moon-rental tax to. Payees are shared across every
 * tracked character — a landlord doesn't change depending on which alt is
 * looking — so this lists the union of all of them rather than gating on one
 * character at a time. Name, default tax %, and the trade hub the Payee's ore
 * is valued at — the moon/system tag (CONTEXT.md's Payee entry) is set from
 * `AssignDialog`'s "remember this system" checkbox instead, at the moment
 * it's actually useful, rather than asking for a system id here.
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
}: PayeeManagerDialogProps) {
  const { t } = useTranslation();
  const formId = useId();
  const [payeesByCharacterState, setPayeesByCharacterState] = useState(payeesByCharacter);
  const [draft, setDraft] = useState<DraftPayee>(EMPTY_DRAFT);
  // The add/edit form stays out of the way until asked for — the list is what
  // the dialog is for. An empty list shows it regardless (see `showForm`).
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Shown above the list: the add/edit form (and its own error line) may be closed.
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingPayee, setDeletingPayee] = useState<PayeeRecord | null>(null);
  const [moveTargetId, setMoveTargetId] = useState<string>('');
  // Set by the row menu's Delete item, acted on once the menu has closed: the
  // menu hands focus back to its trigger as it closes, which would pull focus
  // out of a confirmation opened any earlier (and Escape with it).
  const deleteChosen = useRef<PayeeRecord | null>(null);

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

  const showForm = formOpen || payees.length === 0;

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
    setDraft(EMPTY_DRAFT);
    setError(null);
    setFormOpen(false);
  }

  function startAdd() {
    setDraft(EMPTY_DRAFT);
    setError(null);
    setFormOpen(true);
  }

  function startEdit(payee: PayeeRecord) {
    setDraft({
      id: payee.id,
      name: payee.name,
      defaultTaxPct: String(payee.defaultTaxPct),
      // A stored hub this build doesn't know reads as Jita here exactly as it
      // does when pricing — the picker never opens on a blank selection.
      hubId: hubForPayee(payee.hubId).id,
      systemId: payee.systemId,
    });
    setError(null);
    setFormOpen(true);
  }

  async function handleSave() {
    const name = draft.name.trim();
    const pct = Number(draft.defaultTaxPct);
    if (!name) {
      setError(t('miningTax.payeeNameRequired'));
      return;
    }
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError(t('miningTax.payeeTaxPctInvalid'));
      return;
    }
    // The default hub is stored as *no* hub, which is what every Payee
    // predating this field already means — so "Jita" never becomes a second
    // way of saying the same thing that only some records carry.
    const input = {
      name,
      defaultTaxPct: pct,
      systemId: draft.systemId,
      ...(draft.hubId === DEFAULT_TRADE_HUB.id ? {} : { hubId: draft.hubId }),
    };
    const existing = draft.id ? payees.find((p) => p.id === draft.id) : undefined;
    if (existing) {
      await updatePayee(existing, input);
    } else {
      await createPayee(initialCharacterId, input);
    }
    closeForm();
    await refresh();
    onChanged();
  }

  async function handleDelete(payee: PayeeRecord, moveToPayeeId?: string) {
    // One transaction: a failure leaves the Payee and every entry's label intact.
    setDeleteError(null);
    if (!(await deletePayee(payee, moveToPayeeId)).ok) {
      setDeleteError(t('miningTax.payees.deleteFailed', { name: payee.name }));
      return;
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
    const owed = owedByPayee?.get(payee.id);
    void handleDelete(payee, moveAndDelete && owed && moveTargetId ? moveTargetId : undefined);
  }

  const deletingOwed =
    deletingPayee && (owedByPayee?.get(deletingPayee.id)?.count ?? 0) > 0
      ? owedByPayee?.get(deletingPayee.id)
      : undefined;
  const moveTargets = deletingPayee ? payees.filter((p) => p.id !== deletingPayee.id) : [];

  return (
    <Modal
      open={open}
      onClose={() => {
        closeForm();
        onClose();
      }}
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

        {deleteError && (
          <p role="alert" className="text-xs text-danger">
            {deleteError}
          </p>
        )}
        {payees.length === 0 ? (
          <p className="text-xs text-text-dim">{t('miningTax.payeesEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {payees.map((payee) => {
              const owed = owedByPayee?.get(payee.id);
              const systems = payeeSystemNames(systemsByPayee?.get(payee.id), systemNames);
              const hub = hubForPayee(payee.hubId).systemName;
              return (
                <li key={payee.id} className="flex items-center gap-1 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <Tooltip content={payee.name}>
                        <p className="min-w-0 flex-1 truncate text-sm">{payee.name}</p>
                      </Tooltip>
                      {owed && owed.amount > 0 ? (
                        <span className="shrink-0 text-xs text-isk-neg tabular-nums">
                          {t('miningTax.payees.owed', { amount: formatIsk(owed.amount, 0) })}
                        </span>
                      ) : owedByPayee ? (
                        <span className="shrink-0 text-xs text-text-dim">
                          {t('miningTax.payees.settled')}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[0.6875rem] text-text-dim">
                      {systems.length > 0
                        ? t('miningTax.payees.detailWithSystems', {
                            pct: payee.defaultTaxPct,
                            hub,
                            systems: systems.join(', '),
                          })
                        : t('miningTax.payees.detail', { pct: payee.defaultTaxPct, hub })}
                    </p>
                  </div>
                  <IconButton
                    variant="plain"
                    size="row"
                    icon={<Icon.Rename />}
                    label={t('miningTax.editPayee', { name: payee.name })}
                    onClick={() => startEdit(payee)}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton
                        variant="plain"
                        size="row"
                        icon={<Icon.More />}
                        label={t('common.moreActionsLabel', { name: payee.name })}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      onCloseAutoFocus={(e) => {
                        const chosen = deleteChosen.current;
                        if (!chosen) return;
                        e.preventDefault();
                        deleteChosen.current = null;
                        openDelete(chosen);
                      }}
                    >
                      <DropdownMenuItem
                        className="text-danger data-[highlighted]:text-danger"
                        onSelect={() => {
                          deleteChosen.current = payee;
                        }}
                      >
                        {t('miningTax.deletePayeeAction')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}

        {showForm && (
          <div className="space-y-3 border-t border-line pt-3">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {draft.id ? t('miningTax.editPayeeTitle') : t('miningTax.addPayeeTitle')}
            </p>
            <Fields>
              <Field label={t('miningTax.payees.nameLabel')} htmlFor={`${formId}-name`}>
                <TextInput
                  id={`${formId}-name`}
                  className="w-full"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder={t('miningTax.payeeNamePlaceholder')}
                />
              </Field>
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
            </Fields>
            {error && (
              <p role="alert" className="text-xs text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {payees.length > 0 && (
                <Button size="sm" onClick={closeForm}>
                  {t('filters.cancel')}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => void handleSave()}>
                {t('common.save')}
              </Button>
            </div>
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
                  size="sm"
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
            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={() => setDeletingPayee(null)}>
                {t('filters.cancel')}
              </Button>
              <Button size="sm" onClick={() => confirmDelete(false)}>
                {t('miningTax.payees.deleteAnyway')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-text-dim">
              {t('miningTax.deletePayeeConfirm', { name: deletingPayee?.name ?? '' })}
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" onClick={() => setDeletingPayee(null)}>
                {t('filters.cancel')}
              </Button>
              <Button variant="danger" size="sm" onClick={() => confirmDelete(false)}>
                {t('miningTax.deletePayeeAction')}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Modal>
  );
}
