import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Toast } from '@/components/ui';
import { reclaimBook } from '../taxBook/bookClient';
import { DialogShell } from './BookDialogs';
import { useBook } from './useBook';

/**
 * The CEO's "Reclaim the book" (ADR 0023, issue #4269): the CEO becomes the
 * book's owner and every other officer must re-verify. Destructive, so a
 * confirm step says what happens first (§6c). Only the CEO sees it; the
 * callable re-checks the role live and stays the gate.
 */
export function ReclaimBookSection() {
  const { t } = useTranslation();
  const { characterId, corporationId, verdict, reload } = useBook();
  const [confirming, setConfirming] = useState(false);
  const [revoked, setRevoked] = useState<number | null>(null);
  if (!verdict.isCeo) return null;

  const reclaim = async () => {
    try {
      const { officersRevoked } = await reclaimBook(characterId, corporationId);
      setRevoked(officersRevoked);
    } finally {
      // Even a refusal may mean the screen is stale (the book or the role changed).
      reload();
    }
  };

  return (
    <section aria-labelledby="reclaim-book-heading" className="space-y-2">
      <h3 id="reclaim-book-heading" className={eyebrowClassName}>
        {t('corpTaxBook.moons.settings.reclaim.title')}
      </h3>
      <p className="text-xs text-text-dim">{t('corpTaxBook.moons.settings.reclaim.hint')}</p>
      <Button size="sm" variant="danger" onClick={() => setConfirming(true)}>
        {t('corpTaxBook.moons.settings.reclaim.open')}
      </Button>
      {confirming && (
        <DialogShell
          open
          onClose={() => setConfirming(false)}
          title={t('corpTaxBook.moons.settings.reclaim.confirmTitle')}
          confirmLabel={t('corpTaxBook.moons.settings.reclaim.confirm')}
          canConfirm
          danger
          run={reclaim}
        >
          <p>{t('corpTaxBook.moons.settings.reclaim.body')}</p>
        </DialogShell>
      )}
      {revoked !== null && (
        <Toast
          message={t('corpTaxBook.moons.settings.reclaim.done', { count: revoked })}
          onClose={() => setRevoked(null)}
        />
      )}
    </section>
  );
}
