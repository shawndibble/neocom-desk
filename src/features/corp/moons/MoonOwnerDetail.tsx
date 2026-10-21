import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui';
import { moonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { recordFeederRemovalSent, setFeederMode, setFeederRate } from '../taxBook/feederClient';
import { RemoveMoonOwnerDialog, SetRateDialog, SettledOtherwiseDialog } from './MoonOwnerDialogs';
import { MoonOwnerPage } from './MoonOwnerPage';
import { Crumb } from './moonsParts';
import { cancelRemovalAndMail, startRemovalAndMail, type RemovalContext } from './removalFlow';
import { useCorporationName } from './statementMailing';
import { useBook } from './useBook';
import { useMoonOwners } from './useMoonOwners';

const BACK = '/corp/moons/moon-owners';

/** A moon owner's page at `/corp/moons/moon-owners/:id`, wired to the book. */
export function MoonOwnerDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const { names, canEdit, characterId, corporationId, reload } = useBook();
  const { input } = useMoonOwners();
  const [dialog, setDialog] = useState<'rate' | 'settled' | 'remove' | null>(null);
  const accountingName = useCorporationName();
  const corp = Number(id);
  const detail = /^\d+$/.test(id) ? moonOwnerDetail(input, corp) : undefined;
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
  const removal: RemovalContext | null = accountingName
    ? {
        characterId,
        corporationId,
        feederCorporationId: corp,
        accountingName,
        ownerName: name,
        officerName: names.character(characterId),
      }
    : null;
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
          ? {
              onSetRate: () => setDialog('rate'),
              onSettledOtherwise: () => setDialog('settled'),
              ...(removal
                ? {
                    onRemove: () => setDialog('remove'),
                    onCancelRemoval: () => afterEdit(() => cancelRemovalAndMail(removal)),
                  }
                : {}),
              onNoticeSent: () =>
                afterEdit(() => recordFeederRemovalSent(characterId, corporationId, corp)),
            }
          : {})}
      />
      {dialog === 'remove' && removal && (
        <RemoveMoonOwnerDialog
          ownerName={name}
          accountingName={removal.accountingName}
          hasPayee={detail.hasPayee}
          onClose={() => setDialog(null)}
          onStart={() => afterEdit(() => startRemovalAndMail(removal))}
        />
      )}
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
