import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import {
  canPayMoonOwner,
  deriveOwnerRateHistory,
  moonOwnerDetail,
} from '@/engine/corpTaxBook/moonOwners';
import { payeeChangeNotice, payeeNoticeKey } from '@/engine/corpTaxBook/payeeChange';
import {
  markFeederPayout,
  setBookFeederPayee,
  setFeederMode,
  setFeederRate,
  setRefineryArchive,
  setRefineryLabel,
} from '../taxBook/feederClient';
import { minerIdFor } from '@/engine/corpTaxBook/charges';
import { ArchivedRefineries } from './ArchivedRefineries';
import { minerPath, refineryPath } from './moonsPaths';
import { refineryMeta, offerLabel } from './refineryText';
import { useOwnerRefineries } from './useOwnerRefineries';
import { ChangePayeeDialog, PayeeChangeStrip } from './MoonOwnerPayee';
import { enqueuePayeeChangeMail } from '@/features/corpTaxBook/mailQueue';
import { canSendMail, queueOfficerMail } from '@/features/corpTaxBook/officerMail';
import { PayMoonOwnerHost } from './PayMoonOwnerHost';
import { RemoveMoonOwnerDialog, SetRateDialog, SettledOtherwiseDialog } from './MoonOwnerDialogs';
import { MoonOwnerPage } from './MoonOwnerPage';
import { earliestAsOf } from '@/engine/corpTaxBook/ownerRate';
import { utcDay } from '@/engine/localDay';
import { agreedRateChange, mailModeChange, mailRateChange } from './rateChangeNotice';
import { Crumb } from './moonsParts';
import {
  cancelRemovalAndMail,
  recordRemovalNoticeSent,
  startRemovalAndMail,
  type RemovalContext,
} from './removalFlow';
import { useCorporationName } from './lateNoticeMailing';
import { useBook } from './useBook';
import { useMoonOwnersInput } from './useMoonOwners';

const BACK = '/corp/moons/moon-owners';

export function MoonOwnerDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const { names, canEdit, characterId, corporationId, reload, data, view } = useBook();
  const refineries = useOwnerRefineries(Number(id));
  const grantedScopes = useGrantedScopes();
  const accountingName = useCorporationName();
  const input = useMoonOwnersInput();
  const [dialog, setDialog] = useState<
    'rate' | 'settled' | 'remove' | 'pay' | 'add' | 'payee' | null
  >(null);
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
  const feeder = data.feeders?.find((f) => f.corporationId === corp);
  const payeeName =
    detail.payee.kind === 'character'
      ? names.character(detail.payee.id)
      : names.corporation(detail.payee.id);
  const payeeOpen = feeder?.status === 'active' || feeder?.status === 'pending-removal';
  const notice = payeeChangeNotice({
    payee: feeder?.payee,
    payeeSetBy: feeder?.payeeSetBy,
    viewer: 'accounting',
  });
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
        minerPath={(miner) => minerPath(minerIdFor(miner, view.input.miners))}
        refineries={{
          ids: refineries.active.map((r) => r.structureId),
          info: (structureId) => {
            const r = refineries.active.find((x) => x.structureId === structureId)!;
            return {
              to: refineryPath(structureId),
              meta: refineryMeta(t, r, r.moonId === undefined ? undefined : names.moon(r.moonId)),
              ...(r.offer ? { offer: offerLabel(t, r.offer) } : {}),
            };
          },
          archived: (
            <ArchivedRefineries
              rows={refineries.archived}
              name={names.ownerRefinery}
              moonName={(r) => (r.moonId === undefined ? undefined : names.moon(r.moonId))}
              pathOf={refineryPath}
              byName={names.character}
              {...(canEdit && feeder?.status !== 'left' && feeder?.status !== 'removed'
                ? {
                    onRestore: async (structureId: number) => {
                      try {
                        await setRefineryArchive(
                          characterId,
                          corporationId,
                          corp,
                          structureId,
                          false
                        );
                      } finally {
                        reload();
                      }
                    },
                  }
                : {})}
            />
          ),
        }}
        refineryName={names.ownerRefinery}
        oreName={names.ore}
        backTo={BACK}
        payee={{ ...detail.payee, name: payeeName }}
        {...(notice && feeder?.status !== 'left' && feeder?.status !== 'removed'
          ? {
              payeeNotice: (
                <PayeeChangeStrip
                  storageKey={payeeNoticeKey(corporationId, corp)}
                  at={notice.at}
                  payeeName={payeeName}
                  byName={name}
                />
              ),
            }
          : {})}
        {...(canEdit
          ? {
              refineryEdit: {
                current: (structureId: number) =>
                  data.feeders?.find((f) => f.corporationId === corp)?.refineryLabels?.[
                    String(structureId)
                  ]?.label ?? '',
                onSave: async (structureId: number, label: string | null) => {
                  await setRefineryLabel(characterId, corporationId, corp, structureId, label);
                  reload();
                },
              },
              onSetRate: () => setDialog('rate'),
              ...(payeeOpen ? { onChangePayee: () => setDialog('payee') } : {}),
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
      {dialog === 'payee' && (
        <ChangePayeeDialog
          characterId={characterId}
          onClose={() => setDialog(null)}
          onSave={(payee, newPayeeName) =>
            afterEdit(async () => {
              const out = await setBookFeederPayee(
                characterId,
                corporationId,
                corp,
                payee,
                canSendMail(grantedScopes)
              );
              if (out.changed && out.at !== undefined) {
                const at = out.at;
                void queueOfficerMail({
                  senderCharacterId: characterId,
                  grantedScopes,
                  recipients: out.recipients ?? [],
                  enqueue: (recipients) =>
                    enqueuePayeeChangeMail({
                      corporationId,
                      senderCharacterId: characterId,
                      feederCorporationId: corp,
                      at,
                      changedByName: accountingName ?? names.corporation(corporationId),
                      moonOwnerName: name,
                      payeeName: newPayeeName,
                      recipients,
                    }),
                });
              }
            })
          }
        />
      )}
      {dialog === 'rate' && (
        <SetRateDialog
          initial={detail.row.theirRatePct ?? null}
          today={utcDay()}
          earliest={earliestAsOf(utcDay(), feeder ? utcDay(feeder.joinedAt) : '0000-00-00')}
          onClose={() => setDialog(null)}
          onSave={(pct, asOf) =>
            afterEdit(async () => {
              const change = feeder
                ? agreedRateChange(deriveOwnerRateHistory(feeder), pct, new Date(), asOf)
                : undefined;
              await setFeederRate(characterId, corporationId, corp, pct, asOf);
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
            afterEdit(async () => {
              const mode = on ? 'settled-otherwise' : 'normal';
              await setFeederMode(characterId, corporationId, corp, mode, on ? note : undefined);
              if (on !== settled && accountingName && !detail.row.sameOwner) {
                void mailModeChange({
                  grantedScopes,
                  characterId,
                  corporationId,
                  accountingCorporationName: accountingName,
                  feederCorporationId: corp,
                  ...(feeder?.payee ? { payee: feeder.payee } : {}),
                  mode,
                  at: Date.now(),
                });
              }
            })
          }
        />
      )}
    </>
  );
}
