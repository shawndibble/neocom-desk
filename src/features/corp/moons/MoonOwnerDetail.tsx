import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import {
  canPayMoonOwner,
  deriveOwnerRateHistory,
  moonOwnerDetail,
} from '@/engine/corpTaxBook/moonOwners';
import { markFeederPayout, setFeederMode, setFeederRate } from '../taxBook/feederClient';
import { PayMoonOwnerHost } from './PayMoonOwnerHost';
import { RemoveMoonOwnerDialog, SetRateDialog, SettledOtherwiseDialog } from './MoonOwnerDialogs';
import { MoonOwnerPage } from './MoonOwnerPage';
import { agreedRateChange, mailRateChange } from './rateChangeNotice';
import { Crumb } from './moonsParts';
import {
  cancelRemovalAndMail,
  recordRemovalNoticeSent,
  startRemovalAndMail,
  type RemovalContext,
} from './removalFlow';
import { useCorporationName } from './statementMailing';
import { useBook } from './useBook';
import { useMoonOwners } from './useMoonOwners';

const BACK = '/corp/moons/moon-owners';

/** A moon owner's page at `/corp/moons/moon-owners/:id`, wired to the book. */
export function MoonOwnerDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const { names, canEdit, characterId, corporationId, reload, data } = useBook();
  const grantedScopes = useGrantedScopes();
  const accountingName = useCorporationName();
  const { input } = useMoonOwners();
  const [dialog, setDialog] = useState<'rate' | 'settled' | 'remove' | 'pay' | 'add' | null>(null);
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
        {...(accountingName ? { accountingName } : {})}
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
                afterEdit(() => recordRemovalNoticeSent(characterId, corporationId, corp)),
              onAddPayment: () => setDialog('add'),
              onMarkPayout: (payoutId: string, notAPayout: boolean) =>
                afterEdit(() =>
                  markFeederPayout(characterId, corporationId, corp, payoutId, notAPayout)
                ),
              ...(canPayMoonOwner(detail.row) ? { onPay: () => setDialog('pay') } : {}),
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
      {(dialog === 'pay' || dialog === 'add') && (
        <PayMoonOwnerHost
          corporationId={corp}
          manual={dialog === 'add'}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'rate' && (
        <SetRateDialog
          initial={detail.row.theirRatePct ?? null}
          onClose={() => setDialog(null)}
          onSave={(pct) =>
            afterEdit(async () => {
              const feeder = data.feeders?.find((f) => f.corporationId === corp);
              const change = feeder
                ? agreedRateChange(deriveOwnerRateHistory(feeder), pct, new Date())
                : undefined;
              await setFeederRate(characterId, corporationId, corp, pct);
              // After the save, and never awaited: the rate change does not wait on the mail.
              if (change && accountingName) {
                void mailRateChange({
                  grantedScopes,
                  characterId,
                  corporationId,
                  accountingCorporationName: accountingName,
                  feederCorporationId: corp,
                  ...(feeder?.payee ? { payee: feeder.payee } : {}),
                  change,
                });
              }
            })
          }
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
