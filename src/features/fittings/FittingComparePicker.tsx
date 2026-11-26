import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { FittingStartScreen } from './FittingStartScreen';
import { useFittingPicker } from './useFittingPicker';

interface FittingComparePickerProps {
  open: boolean;
  onClose: () => void;
  characterId: number | null;
  onAdd: (code: string) => void;
}

export function FittingComparePicker({
  open,
  onClose,
  characterId,
  onAdd,
}: FittingComparePickerProps) {
  const { t } = useTranslation();
  const source = useFittingPicker((code) => {
    onAdd(code);
    onClose();
  });

  return (
    <Modal open={open} onClose={onClose} title={t('fittings.compare.picker.title')}>
      <FittingStartScreen
        variant="dialog"
        importInline
        rowMenus={false}
        workspace={source}
        catalogue={null}
        characterId={characterId}
        inGameKey={0}
      />
    </Modal>
  );
}
