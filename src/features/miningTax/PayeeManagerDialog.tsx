import { useState } from 'react';
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
import { createPayee, deletePayee, loadPayees, updatePayee } from './payees';
import type { TrackedCharacter } from './snapshot';

interface PayeeManagerDialogProps {
  open: boolean;
  onClose: () => void;
  characters: readonly TrackedCharacter[];
  /** Every tracked character's current Payees, already loaded by the parent route's snapshot — the initial list here is seeded from this rather than a fresh Dexie read. */
  payeesByCharacter: ReadonlyMap<number, PayeeRecord[]>;
  /** Preselected on open — usually whichever character the "Manage Payees" action was pressed from. */
  initialCharacterId: number;
  onChanged: () => void;
}

interface DraftPayee {
  id: string | null;
  name: string;
  defaultTaxPct: string;
}

const EMPTY_DRAFT: DraftPayee = { id: null, name: '', defaultTaxPct: '' };

/**
 * Manage Payees (decision doc): create/edit/remove the corps and people a
 * character owes a moon-rental tax to. Per-character, like the character
 * whose ledger it's opened from. Name + default tax % only — the moon/system
 * tag (CONTEXT.md's Payee entry) is set from `AssignDialog`'s "remember this
 * system" checkbox instead, at the moment it's actually useful, rather than
 * asking for a system id here.
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
  // No mount-time reset effect needed: the route only renders this dialog
  // while `payeeManagerCharacterId !== null`, so it remounts fresh (new
  // `useState` initializers) every time it opens — `characterId` only moves
  // afterward, via the in-dialog character switcher below.
  const [characterId, setCharacterId] = useState(initialCharacterId);
  const [payees, setPayees] = useState<PayeeRecord[]>(
    () => payeesByCharacter.get(initialCharacterId) ?? []
  );
  const [draft, setDraft] = useState<DraftPayee>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  // Render-time adjustment (not an effect) for the in-dialog character
  // switcher: the parent route's snapshot already loaded every character's
  // Payees, so switching here re-reads that map instead of firing a fresh
  // Dexie query the data already answers.
  const [payeesLoadedFor, setPayeesLoadedFor] = useState(characterId);
  if (payeesLoadedFor !== characterId) {
    setPayeesLoadedFor(characterId);
    setPayees(payeesByCharacter.get(characterId) ?? []);
  }

  // A genuinely fresh read after a mutation, since the parent's snapshot map
  // is a point-in-time seed and won't reflect this dialog's own edit until
  // its next full refresh.
  async function refresh() {
    setPayees(await loadPayees(characterId));
  }

  function startEdit(payee: PayeeRecord) {
    setDraft({ id: payee.id, name: payee.name, defaultTaxPct: String(payee.defaultTaxPct) });
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
    const existing = draft.id ? payees.find((p) => p.id === draft.id) : undefined;
    if (existing) {
      await updatePayee(existing, { name, defaultTaxPct: pct });
    } else {
      await createPayee(characterId, { name, defaultTaxPct: pct });
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

  const characterName = characters.find((c) => c.characterId === characterId)?.characterName ?? '';

  return (
    <Modal
      open={open}
      onClose={() => {
        setDraft(EMPTY_DRAFT);
        setError(null);
        onClose();
      }}
      title={t('miningTax.managePayeesTitle', { character: characterName })}
    >
      <div className="space-y-3">
        {characters.length > 1 && (
          <div className="space-y-1">
            <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('miningTax.characterColumn')}
            </p>
            <Select
              value={String(characterId)}
              onValueChange={(value) => setCharacterId(Number(value))}
            >
              <SelectTrigger aria-label={t('miningTax.characterColumn')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {characters.map((c) => (
                  <SelectItem key={c.characterId} value={String(c.characterId)}>
                    {c.characterName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {payees.length === 0 ? (
          <p className="text-xs text-text-dim">{t('miningTax.payeesEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {payees.map((payee) => (
              <li key={payee.id} className="flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{payee.name}</p>
                  <p className="text-[0.6875rem] text-text-dim">
                    {t('miningTax.defaultTaxPctValue', { pct: payee.defaultTaxPct })}
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
                  onClick={() => void handleDelete(payee)}
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
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t('miningTax.payeeNamePlaceholder')}
            aria-label={t('miningTax.payeeNamePlaceholder')}
          />
          <TextInput
            type="number"
            min={0}
            max={100}
            step="0.1"
            value={draft.defaultTaxPct}
            onChange={(e) => setDraft({ ...draft, defaultTaxPct: e.target.value })}
            placeholder={t('miningTax.defaultTaxPctPlaceholder')}
            aria-label={t('miningTax.defaultTaxPctPlaceholder')}
          />
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
    </Modal>
  );
}
