import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useCallback, useState } from 'react';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { useTranslation } from 'react-i18next';
import { Button, TextInput } from '@/components/ui';
import { getCorporationPublicInfo } from '@/esi/endpoints/corp';
import { deleteBook } from '../taxBook/bookClient';
import { DialogShell, Label } from './BookDialogs';
import { ExportFirst } from './ExportBook';
import { useBook } from './useBook';

/** Whoever turned the book on (a Director) or the CEO may delete it. The callable stays the gate. */
function useCanDeleteBook(): boolean {
  const { characterId, verdict, settings } = useBook();
  return (
    verdict.isCeo ||
    (verdict.isDirector && [settings.createdBy, settings.ownerCharacterId].includes(characterId))
  );
}

/**
 * "Delete the book" in the settings' Access tab: only the entry point. `onDelete` closes the
 * settings and opens `DeleteBookDialog`, so the confirmation is the one dialog on screen.
 */
export function DeleteBookSection({ onDelete }: { onDelete: () => void }) {
  const { t } = useTranslation();
  const allowed = useCanDeleteBook();
  if (!allowed) return null;
  return (
    <section aria-labelledby="delete-book-heading" className="space-y-2">
      <h3 id="delete-book-heading" className={eyebrowClassName}>
        {t('corpTaxBook.moons.settings.delete.title')}
      </h3>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.settings.delete.hint')}</p>
      <Button size="sm" variant="danger" onClick={onDelete}>
        {t('corpTaxBook.moons.settings.delete.open')}
      </Button>
    </section>
  );
}

/**
 * The one confirmation for deleting the book (§6c: destructive, so what goes is said first).
 * The officer types the corporation's ticker; the id stands in only if the ticker cannot be read.
 */
export function DeleteBookDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { characterId, corporationId, reload } = useBook();
  const [typed, setTyped] = useState('');
  const [exporting, setExporting] = useState(false);
  // The id stands in when the ticker is unreadable: the label then names it as the id.
  const loadTicker = useCallback(
    () =>
      getCorporationPublicInfo(corporationId).then(
        (r) => ({ isId: !r.data?.ticker, expected: r.data?.ticker || String(corporationId) }),
        // Resolved, not failed: a retry landing mid-typing would swap the word being typed.
        () => ({ isId: true, expected: String(corporationId) })
      ),
    [corporationId]
  );
  const ticker = useAsyncLoad(loadTicker).data;
  const expected = ticker?.expected ?? null;
  const isId = ticker?.isId ?? false;

  const remove = async () => {
    try {
      await deleteBook(characterId, corporationId);
    } finally {
      // Even a refusal may mean the screen is stale (the book or the role changed).
      reload();
    }
  };

  return (
    <DialogShell
      open
      onClose={onClose}
      title={t('corpTaxBook.moons.settings.delete.confirmTitle')}
      confirmLabel={t('corpTaxBook.moons.settings.delete.confirm')}
      canConfirm={
        !exporting && expected !== null && typed.trim().toUpperCase() === expected.toUpperCase()
      }
      danger
      showLogged={false}
      run={remove}
    >
      <p>{t('corpTaxBook.moons.settings.delete.body')}</p>
      <ExportFirst onBusyChange={setExporting} />
      <Label
        text={
          isId
            ? t('corpTaxBook.moons.settings.delete.typeCorpId', { id: expected })
            : t('corpTaxBook.moons.settings.delete.typeTicker', { ticker: expected ?? '…' })
        }
      >
        <TextInput
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
        />
      </Label>
    </DialogShell>
  );
}
