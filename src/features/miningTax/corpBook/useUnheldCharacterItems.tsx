import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import { resolveNames } from '@/features/character/names';
import { formatList } from '@/lib/listFormat';
import type { AttentionItem } from '@/features/miningTax/AttentionStrip';
import type { CorpBookView } from './corpBookView';
import { unheldCharacters } from './unheldCharacters';

/**
 * The Tax tab's warning, one per corporation, when a book counts a character the pilot does not
 * hold in Neocom Desk (`unheldCharacters`), with "Not yours? Tell {corp}", which declines the
 * link for each held character grouped with them (`declineLink`). It goes once each listed
 * character is added or declined.
 */
export function useUnheldCharacterItems(
  corpView: CorpBookView | null,
  heldIds: readonly number[],
  reloadCorpBooks: () => void
): AttentionItem[] {
  const { t } = useTranslation();
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<number | null>(null);
  const found = useMemo(
    () =>
      unheldCharacters(
        (corpView?.books ?? []).map((b) => ({
          corporationId: b.loaded.corporationId,
          corpName: b.corpName,
          miners: b.loaded.miners,
        })),
        new Set(heldIds)
      ),
    [corpView, heldIds]
  );
  const ids = found.flatMap((f) => f.characterIds).join(',');
  useEffect(() => {
    if (ids === '') return;
    let cancelled = false;
    void resolveNames(ids.split(',').map(Number))
      .catch(() => new Map<number, string>())
      .then((resolved) => {
        if (!cancelled) setNames(resolved);
      });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  const decline = async (entry: (typeof found)[number]) => {
    setBusy(true);
    setFailed(null);
    try {
      const { declineLink } = await import('@/features/corpTaxBook/playerApi');
      for (const d of entry.declines)
        await declineLink(d.characterId, {
          corporationId: entry.corporationId,
          minerId: d.minerId,
        });
      reloadCorpBooks();
    } catch {
      setFailed(entry.corporationId);
    } finally {
      setBusy(false);
    }
  };

  return found.map((entry) => ({
    id: `unheld-${entry.corporationId}`,
    tone: 'warning',
    title: t('miningTax.corpBook.unheld.title', {
      corp: entry.corpName,
      character: formatList(entry.characterIds.map((id) => names.get(id) ?? `#${id}`)),
    }),
    ...(failed === entry.corporationId
      ? { detail: <p role="alert">{t('miningTax.corpBook.unheld.failed')}</p> }
      : {}),
    action: (
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void decline(entry)}>
        {t('miningTax.corpBook.unheld.decline', { corp: entry.corpName })}
      </Button>
    ),
  }));
}
