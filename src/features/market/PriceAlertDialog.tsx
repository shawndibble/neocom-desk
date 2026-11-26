import { useTranslation } from 'react-i18next';
import { DisabledMenuItem, MenuItem, Modal } from '@/components/ui';
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
  const label = t(
    hasTarget ? 'market.contextMenu.editPriceAlert' : 'market.contextMenu.setPriceAlert'
  );
  if (available) {
    return <MenuItem onSelect={onSelect}>{label}</MenuItem>;
  }
  return (
    <DisabledMenuItem reason={t('market.contextMenu.quickbarNoCharacter')}>
      {label}
    </DisabledMenuItem>
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
