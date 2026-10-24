/**
 * The Miners table's row menu (right-click, touch-and-hold, ⋮): the actions the
 * Miner's page header carries, reachable from the row. Open miner page is the
 * row click, so it is not repeated here. Officers only: without edit rights the
 * row has Show info alone, which is not worth a menu (DESIGN.md §6c).
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { DisabledMenuItem, MenuItem, RowActionsMenu } from '@/components/ui';
import type { MinerRow } from '@/engine/corpTaxBook/bookView';
import { EntityShowInfoMenuItem } from '../corpRowMenus';
import { useBook } from './useBook';
import { useMinerReminder } from './statementMailing';

/** "Send reminder": the same mail the Miner's page queues; inert with its reason when it cannot go. */
function RemindMenuItem({
  minerId,
  onNotice,
}: {
  minerId: string;
  onNotice: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { block, send } = useMinerReminder(minerId, onNotice);
  const label = t('corpTaxBook.moons.miner.remind');
  return block ? (
    <DisabledMenuItem reason={block}>{label}</DisabledMenuItem>
  ) : (
    <MenuItem onSelect={() => void send()}>{label}</MenuItem>
  );
}

export function MinerRowMenu({
  miner,
  onRecord,
  onDismiss,
  onNotice,
  onCloseAutoFocus,
  onOpenChange,
  children,
}: {
  miner: MinerRow;
  /** Both open their dialog after the menu closes (`useOpenAfterMenu`'s `run`, bound by the caller). */
  onRecord: (miner: MinerRow) => void;
  onDismiss: (miner: MinerRow) => void;
  onNotice: (text: string) => void;
  onCloseAutoFocus: (event: Event) => void;
  onOpenChange?: (open: boolean) => void;
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
      onOpenChange={onOpenChange}
      items={
        <>
          <MenuItem onSelect={() => onRecord(miner)}>
            {t('corpTaxBook.moons.miner.record')}
          </MenuItem>
          <RemindMenuItem minerId={miner.id} onNotice={onNotice} />
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
