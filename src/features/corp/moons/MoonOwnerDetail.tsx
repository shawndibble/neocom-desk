import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui';
import { moonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { setFeederMode, setFeederRate } from '../taxBook/feederClient';
import { SetRateDialog, SettledOtherwiseDialog } from './MoonOwnerDialogs';
import { MoonOwnerPage } from './MoonOwnerPage';
import { Crumb } from './moonsParts';
import { useBook } from './useBook';
import { useMoonOwners } from './useMoonOwners';

const BACK = '/corp/moons/moon-owners';

/** A moon owner's page at `/corp/moons/moon-owners/:id`, wired to the book. */
export function MoonOwnerDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const { names, canEdit, characterId, corporationId, reload } = useBook();
  const { input } = useMoonOwners();
  const [dialog, setDialog] = useState<'rate' | 'settled' | null>(null);
  const corp = Number(id);
  const detail = Number.isInteger(corp) ? moonOwnerDetail(input, corp) : undefined;
  if (!detail) {
    return (
      <div className="space-y-4">
        <Crumb to={BACK} label={t('corpTaxBook.moons.tabs.moonOwners')} />
        <EmptyState title={t('corpTaxBook.moons.moonOwners.page.notFound')} />
      </div>
    );
  }
  const name = names.corporation(corp);
  const settled = detail.row.mode === 'settled-otherwise';
  const afterEdit = async (run: () => Promise<unknown>) => {
    try {
      await run();
    } finally {
      reload();
    }
  };
  return (
    <>
      <MoonOwnerPage
        detail={detail}
        name={name}
        characterName={names.character}
        refineryName={names.refinery}
        oreName={names.ore}
        backTo={BACK}
        {...(canEdit
          ? { onSetRate: () => setDialog('rate'), onSettledOtherwise: () => setDialog('settled') }
          : {})}
      />
      {dialog === 'rate' && (
        <SetRateDialog
          initial={detail.row.theirRatePct ?? null}
          onClose={() => setDialog(null)}
          onSave={(pct) => afterEdit(() => setFeederRate(characterId, corporationId, corp, pct))}
        />
      )}
      {dialog === 'settled' && (
        <SettledOtherwiseDialog
          initialOn={settled}
          initialNote={detail.note ?? ''}
          onClose={() => setDialog(null)}
          onSave={(on, note) =>
            afterEdit(() =>
              setFeederMode(
                characterId,
                corporationId,
                corp,
                on ? 'settled-otherwise' : 'normal',
                on ? note : undefined
              )
            )
          }
        />
      )}
    </>
  );
}
