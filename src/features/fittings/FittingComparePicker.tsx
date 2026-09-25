/**
 * "Compare with…": adds a Fitting to an empty compare slot. The ways in are
 * `FittingLibrary`'s (minus starting from a hull), in a mode that hands back
 * the chosen Fitting's Share Link code instead of opening it.
 */
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import { FittingLibrary } from './FittingLibrary';
import { useFittingPicker } from './useFittingPicker';

interface FittingComparePickerProps {
  open: boolean;
  onClose: () => void;
  characterId: number | null;
  /** A ready-to-use Share Link code for the newly picked Fitting. */
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
      <FittingLibrary
        workspace={source}
        catalogue={null}
        characterId={characterId}
        inGameKey={0}
        layout="tabs"
        initialTab="mine"
      />
    </Modal>
  );
}
