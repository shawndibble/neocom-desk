/**
 * The Miners table's row menu (right-click, touch-and-hold, ⋮): the actions the
 * Miner's page header carries, reachable from the row. Open miner page is the
 * row click, so it is not repeated here. Officers only: without edit rights the
 * row has Show info alone, which is not worth a menu (DESIGN.md §6c).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DisabledMenuItem, MenuItem, RowActionsMenu } from '@/components/ui';
import { minerDetail, type MinerRow } from '@/engine/corpTaxBook/bookView';
import { EntityShowInfoMenuItem } from '../corpRowMenus';
import { useBook } from './useBook';
import {
  manualRemindersSent,
  mailTarget,
  remindersStopped,
  useCorporationName,
} from './statementMailing';

/** "Send reminder": queues the same mail the Miner's page does, for the Miner's open Statement. */
function RemindMenuItem({
  miner,
  onNotice,
}: {
  miner: MinerRow;
  onNotice: (text: string) => void;
}) {
  const { t } = useTranslation();
  const ctx = useBook();
  const { view, names, corporationId, characterId } = ctx;
  const corporationName = useCorporationName();
  const detail = minerDetail(view, miner.id);
  const openStatement = detail?.statements.find(
    (s) => !view.internals.byMiner.get(miner.id)?.allocation.byStatement.get(s.id)?.settled
  );
  const label = t('corpTaxBook.moons.miner.remind');
  if (!openStatement) {
    return (
      <DisabledMenuItem reason={t('corpTaxBook.moons.miner.remindNone')}>{label}</DisabledMenuItem>
    );
  }
  if (corporationName === null) {
    return (
      <DisabledMenuItem reason={t('corpTaxBook.moons.miner.remindNoCorporation')}>
        {label}
      </DisabledMenuItem>
    );
  }
  return (
    <MenuItem
      onSelect={() => {
        void (async () => {
          const { enqueueReminder } = await import('@/features/corpTaxBook/mailQueue');
          const result = await enqueueReminder({
            corporationId,
            corporationName,
            senderCharacterId: characterId,
            refineryName: (sid) => names.refinery(sid),
            statement: mailTarget(ctx, openStatement, miner, {
              amountDue: miner.owed,
              carried: 0,
            }),
            remindersStopped: remindersStopped(openStatement),
            manualRemindersSent: manualRemindersSent(openStatement),
          });
          onNotice(
            result.ok
              ? t('corpTaxBook.moons.needs.reminderQueued', {
                  name: names.character(miner.mainCharacterId),
                })
              : t(`corpTaxBook.moons.needs.reminderRefused.${result.reason}`)
          );
          ctx.reload();
        })();
      }}
    >
      {label}
    </MenuItem>
  );
}

export function MinerRowMenu({
  miner,
  onRecord,
  onDismiss,
  onNotice,
  onCloseAutoFocus,
  children,
}: {
  miner: MinerRow;
  /** Both open their dialog after the menu closes (`useOpenAfterMenu`'s `run`, bound by the caller). */
  onRecord: (miner: MinerRow) => void;
  onDismiss: (miner: MinerRow) => void;
  onNotice: (text: string) => void;
  onCloseAutoFocus: (event: Event) => void;
  children: ReactElement;
}) {
  const { t } = useTranslation();
  const { names, canEdit } = useBook();
  if (!canEdit) return children;
  const name = names.character(miner.mainCharacterId);
  return (
    <RowActionsMenu
      name={name}
      onCloseAutoFocus={onCloseAutoFocus}
      items={
        <>
          <MenuItem onSelect={() => onRecord(miner)}>
            {t('corpTaxBook.moons.miner.record')}
          </MenuItem>
          <RemindMenuItem miner={miner} onNotice={onNotice} />
          <MenuItem onSelect={() => onDismiss(miner)}>
            {t('corpTaxBook.moons.miner.dismissAll')}
          </MenuItem>
          <EntityShowInfoMenuItem entity={{ kind: 'character', id: miner.mainCharacterId }} />
        </>
      }
    >
      {children}
    </RowActionsMenu>
  );
}
