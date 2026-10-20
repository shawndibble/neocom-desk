import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { deleteBook } from '../taxBook/bookClient';
import { DialogShell } from './BookDialogs';
import { useBook } from './useBook';

/**
 * "Delete the book": whoever turned it on (a Director) or the CEO wipes it, so
 * the corp can start over, e.g. when its payment flow doesn't fit the book yet.
 * Destructive, so a confirm step says what goes first (§6c). The callable
 * re-checks the role live and stays the gate.
 */
export function DeleteBookSection() {
  const { t } = useTranslation();
  const { characterId, corporationId, verdict, settings, reload } = useBook();
  const [confirming, setConfirming] = useState(false);
  const opener = verdict.isDirector && settings.ownerCharacterId === characterId;
  if (!verdict.isCeo && !opener) return null;

  const remove = async () => {
    try {
      await deleteBook(characterId, corporationId);
    } finally {
      // Even a refusal may mean the screen is stale (the book or the role changed).
      reload();
    }
  };

  return (
    <section aria-labelledby="delete-book-heading" className="space-y-2">
      <h3 id="delete-book-heading" className={eyebrowClassName}>
        {t('corpTaxBook.moons.settings.delete.title')}
      </h3>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.settings.delete.hint')}</p>
      <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
        {t('corpTaxBook.moons.settings.delete.open')}
      </Button>
      {confirming && (
        <DialogShell
          open
          onClose={() => setConfirming(false)}
          title={t('corpTaxBook.moons.settings.delete.confirmTitle')}
          confirmLabel={t('corpTaxBook.moons.settings.delete.confirm')}
          canConfirm
          danger
          run={remove}
        >
          <p>{t('corpTaxBook.moons.settings.delete.body')}</p>
        </DialogShell>
      )}
    </section>
  );
}
