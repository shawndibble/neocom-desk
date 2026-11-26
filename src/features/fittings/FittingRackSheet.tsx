import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui';
import type { FittingSlotKind } from '@/engine/fittings/types';
import { DroneSection } from './FittingDroneSection';
import { RackSlots } from './FittingRackList';

type RackSlotsProps = ComponentProps<typeof RackSlots>;

interface FittingRackSheetProps {
  rack: FittingSlotKind | 'drone' | null;
  onClose: () => void;
  fitting: RackSlotsProps['fitting'];
  catalogue: RackSlotsProps['catalogue'];
  context: RackSlotsProps['context'];
  edit: RackSlotsProps['edit'];
  stats: RackSlotsProps['stats'];
  moduleResults: RackSlotsProps['moduleResults'];
  target: RackSlotsProps['target'];
  onSelectTarget: RackSlotsProps['onSelectTarget'];
  unusableModuleKeys?: ReadonlySet<string>;
}

export function FittingRackSheet({
  rack,
  onClose,
  fitting,
  catalogue,
  context,
  edit,
  stats,
  moduleResults,
  target,
  onSelectTarget,
  unusableModuleKeys,
}: FittingRackSheetProps) {
  const { t } = useTranslation();
  return (
    <Modal
      open={rack !== null}
      onClose={onClose}
      title={
        rack === 'drone' ? t('fittings.list.drones') : t(`fittings.list.rack.${rack ?? 'high'}`)
      }
      placement="sheet"
    >
      {rack === 'drone' && (
        <DroneSection
          fitting={fitting}
          catalogue={catalogue}
          stats={stats}
          edit={edit}
          target={target}
          onSelectTarget={onSelectTarget}
          variant="panel"
        />
      )}
      {rack && rack !== 'drone' && (
        <RackSlots
          rack={rack}
          hideLabel
          fitting={fitting}
          catalogue={catalogue}
          context={context}
          edit={edit}
          stats={stats}
          moduleResults={moduleResults}
          target={target}
          onSelectTarget={onSelectTarget}
          unusableModuleKeys={unusableModuleKeys}
        />
      )}
    </Modal>
  );
}
