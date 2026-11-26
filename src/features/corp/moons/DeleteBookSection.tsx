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

function useCanDeleteBook(): boolean {
  const { characterId, verdict, settings } = useBook();
  return (
    verdict.isCeo ||
    (verdict.isDirector && [settings.createdBy, settings.ownerCharacterId].includes(characterId))
  );
}

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

export function DeleteBookDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { characterId, corporationId, reload } = useBook();
  const [typed, setTyped] = useState('');
  const [exporting, setExporting] = useState(false);
  const loadTicker = useCallback(
    () =>
      getCorporationPublicInfo(corporationId).then(
        (r) => ({ isId: !r.data?.ticker, expected: r.data?.ticker || String(corporationId) }),
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
