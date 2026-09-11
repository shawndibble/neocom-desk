import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  IconButton,
  Modal,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { PayeeRecord } from '@/db';
import { DEFAULT_TRADE_HUB, TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { createPayee, deletePayee, loadPayees, updatePayee } from './payees';
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
}: PayeeManagerDialogProps) {
  const { t } = useTranslation();
  const [payeesByCharacterState, setPayeesByCharacterState] = useState(payeesByCharacter);
  const [draft, setDraft] = useState<DraftPayee>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [deletingPayee, setDeletingPayee] = useState<PayeeRecord | null>(null);

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
    setDraft(EMPTY_DRAFT);
    setError(null);
    await refresh();
    onChanged();
  }

  async function handleDelete(payee: PayeeRecord) {
    await deletePayee(payee);
    if (draft.id === payee.id) setDraft(EMPTY_DRAFT);
    await refresh();
    onChanged();
  }

  function confirmDelete() {
    const payee = deletingPayee;
    setDeletingPayee(null);
    if (payee) void handleDelete(payee);
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setDraft(EMPTY_DRAFT);
        setError(null);
        onClose();
      }}
      title={t('miningTax.managePayeesTitle')}
    >
      <div className="space-y-3">
        {payees.length === 0 ? (
          <p className="text-xs text-text-dim">{t('miningTax.payeesEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {payees.map((payee) => (
              <li key={payee.id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{payee.name}</p>
                  <p className="mt-0.5 text-[0.6875rem] text-text-dim">
                    {t('miningTax.payeeSummary', {
                      pct: payee.defaultTaxPct,
                      hub: hubForPayee(payee.hubId).systemName,
                    })}
                  </p>
                </div>
                <IconButton
                  variant="plain"
                  size="sm"
                  icon={<Icon.Rename />}
                  label={t('miningTax.editPayee', { name: payee.name })}
                  onClick={() => startEdit(payee)}
                />
                <IconButton
                  variant="plain"
                  size="sm"
                  tone="danger"
                  icon={<Icon.Close />}
                  label={t('miningTax.deletePayee', { name: payee.name })}
                  onClick={() => setDeletingPayee(payee)}
                />
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {draft.id ? t('miningTax.editPayeeTitle') : t('miningTax.addPayeeTitle')}
          </p>
          <TextInput
            className="w-full"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t('miningTax.payeeNamePlaceholder')}
            aria-label={t('miningTax.payeeNamePlaceholder')}
          />
          <TextInput
            className="w-full"
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={draft.defaultTaxPct}
            onChange={(e) => setDraft({ ...draft, defaultTaxPct: e.target.value })}
            placeholder={t('miningTax.defaultTaxPctPlaceholder')}
            aria-label={t('miningTax.defaultTaxPctPlaceholder')}
          />
          <div className="space-y-1">
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
            <p className="text-[0.6875rem] text-text-dim">{t('miningTax.payeeHubHint')}</p>
          </div>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={() => void handleSave()}>
              {draft.id ? t('common.save') : t('miningTax.addPayee')}
            </Button>
            {draft.id && (
              <Button
                size="sm"
                onClick={() => {
                  setDraft(EMPTY_DRAFT);
                  setError(null);
                }}
              >
                {t('filters.cancel')}
              </Button>
            )}
          </div>
        </div>
      </div>
      <Modal
        open={deletingPayee !== null}
        onClose={() => setDeletingPayee(null)}
        title={t('miningTax.deletePayeeAction')}
      >
        <p className="text-xs text-text-dim">
          {t('miningTax.deletePayeeConfirm', { name: deletingPayee?.name ?? '' })}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeletingPayee(null)}>
            {t('filters.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={confirmDelete}>
            {t('miningTax.deletePayeeAction')}
          </Button>
        </div>
      </Modal>
    </Modal>
  );
}
