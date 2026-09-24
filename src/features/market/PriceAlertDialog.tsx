/**
 * The item context menu's price alert entry (issue #1427): the menu item and
 * the dialog it opens. A context menu closes on select, so the form can't live
 * in a popover anchored to it.
 *
 * Both halves own their Quickbar read (`useQuickbar` is a Dexie live query)
 * rather than `ItemContextMenu` doing it at its top level, where it would
 * mount one query per row of every table that wraps its rows in the menu. The
 * item mounts only while the menu is open; the dialog only while it is.
 */
import { useTranslation } from 'react-i18next';
import { MenuItem, Modal } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { PriceAlertForm } from './PriceAlertForm';
import { useQuickbar } from './useQuickbar';

function useQuickbarItem(typeId: number) {
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const quickbar = useQuickbar(activeCharacterId);
  return { quickbar, item: quickbar.items.find((i) => i.typeId === typeId) };
}

export function PriceAlertMenuItem({
  typeId,
  available,
  onSelect,
}: {
  typeId: number;
  available: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const { item } = useQuickbarItem(typeId);
  const hasTarget = item?.targetPrice !== undefined && item.targetDirection !== undefined;
  return (
    <MenuItem
      disabled={!available}
      title={available ? undefined : t('market.contextMenu.quickbarNoCharacter')}
      onSelect={onSelect}
    >
      {t(hasTarget ? 'market.contextMenu.editPriceAlert' : 'market.contextMenu.setPriceAlert')}
    </MenuItem>
  );
}

export function PriceAlertDialog({
  typeId,
  itemName,
  onClose,
}: {
  typeId: number;
  itemName: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { quickbar, item } = useQuickbarItem(typeId);
  return (
    <Modal open onClose={onClose} title={t('market.priceAlert.dialogTitle', { name: itemName })}>
      <PriceAlertForm
        typeId={typeId}
        targetPrice={item?.targetPrice}
        targetDirection={item?.targetDirection}
        onSave={(target) => quickbar.pinWithTarget(typeId, itemName, target)}
        onClear={() => quickbar.pinWithTarget(typeId, itemName, null)}
        onClose={onClose}
      />
    </Modal>
  );
}
