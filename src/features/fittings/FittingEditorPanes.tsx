import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel, SegmentedControl } from '@/components/ui';
import { moveModule, droneTotals } from '@/engine/fittings/fittingEdit';
import { MakeItFitContext } from './makeItFitContext';
import { DroneSection } from './FittingDroneSection';
import { FittingFightersPanel } from './FittingFightersPanel';
import { FittingRackList } from './FittingRackList';
import { FittingRing } from './FittingRing';
import { catalogueTypeName } from './useFittingCatalogue';
import type { FittingView } from './fittingViewPreference';
import type { useFittingHardpoints } from './useFittingHardpoints';
import type { AddTarget } from './addTarget';
import type { FittingSlotKind } from '@/engine/fittings/types';

type RingProps = ComponentProps<typeof FittingRing>;
type RackListProps = ComponentProps<typeof FittingRackList>;

interface FittingEditorPanesProps {
  view: FittingView;
  /** Present on desktop and tablet: the Ring | List switch then replaces the panel's title. Absent on the phone, whose tab bar switches. */
  onViewChange?: (view: FittingView) => void;
  fitting: RackListProps['fitting'];
  stats: RackListProps['stats'];
  moduleResults: RackListProps['moduleResults'];
  catalogue: RackListProps['catalogue'];
  context: RackListProps['context'];
  edit: RackListProps['edit'];
  target: AddTarget | null;
  onSelectTarget: RackListProps['onSelectTarget'];
  unusableModuleKeys?: ReadonlySet<string>;
  typeName: RingProps['typeName'];
  onSlotSelect: RingProps['onSlotSelect'];
  /** Drag-to-fit and drag-to-move are pointer-only: a touch tablet taps a slot and picks instead. */
  dragEnabled: boolean;
  onDropType: NonNullable<RingProps['onDropType']>;
  isPhone: boolean;
  onRackOpen: (rack: FittingSlotKind | 'drone') => void;
  hardpoints: ReturnType<typeof useFittingHardpoints>;
  /** The page's "+ Add module" button; absent when the browser is docked. */
  addButton: ReactNode;
  dronesShown: boolean;
  fightersShown: boolean;
  onOpenMakeItFit: ComponentProps<typeof MakeItFitContext.Provider>['value'];
}

/** The editor column: the Ring or the List (per `view`), the drones panel beside the Ring, and the fighters panel. */
export function FittingEditorPanes({
  view,
  onViewChange,
  fitting,
  stats,
  moduleResults,
  catalogue,
  context,
  edit,
  target,
  onSelectTarget,
  unusableModuleKeys,
  typeName,
  onSlotSelect,
  dragEnabled,
  onDropType,
  isPhone,
  onRackOpen,
  hardpoints,
  addButton,
  dronesShown,
  fightersShown,
  onOpenMakeItFit,
}: FittingEditorPanesProps) {
  const { t } = useTranslation();
  const titleSwitch = onViewChange && (
    <SegmentedControl
      label={t('fittings.view.label')}
      size="sm"
      value={view}
      onChange={onViewChange}
      options={[
        { value: 'ring', label: t('fittings.view.ring') },
        { value: 'list', label: t('fittings.view.list') },
      ]}
    />
  );
  const body =
    view === 'ring' ? (
      <div className="min-w-0 space-y-3">
        <FittingRing
          fitting={fitting}
          stats={stats}
          moduleResults={moduleResults}
          unusableModuleKeys={unusableModuleKeys}
          typeName={typeName}
          onSlotSelect={onSlotSelect}
          onDropType={dragEnabled ? onDropType : undefined}
          onMoveModule={
            dragEnabled ? (rack, from, to) => edit((f) => moveModule(f, rack, from, to)) : undefined
          }
          compact={isPhone}
          onRackOpen={onRackOpen}
          hardpointsUsed={hardpoints.used}
          hardpointKindOf={hardpoints.kindOf}
          selectedSlot={
            target?.kind === 'slot' ? { rack: target.slot, index: target.slotIndex } : null
          }
          actions={addButton}
          titleSwitch={titleSwitch}
          droneButton={
            dronesShown ? (
              <Button
                size="md"
                className="w-full justify-between"
                onClick={() => onRackOpen('drone')}
              >
                <span>{t('fittings.list.drones')}</span>
                <span className="text-xs font-normal text-text-dim tabular-nums">
                  {t('fittings.ring.droneCount', droneTotals(fitting))}
                </span>
              </Button>
            ) : undefined
          }
        />
        {/* The phone overview has its Drones button among the rack buttons instead. */}
        {!isPhone && dronesShown && (
          <Panel title={t('fittings.list.drones')}>
            <DroneSection
              fitting={fitting}
              catalogue={catalogue}
              stats={stats}
              edit={edit}
              target={target}
              onSelectTarget={onSelectTarget}
              variant="panel"
            />
          </Panel>
        )}
      </div>
    ) : (
      <FittingRackList
        fitting={fitting}
        stats={stats}
        moduleResults={moduleResults}
        catalogue={catalogue}
        context={context}
        edit={edit}
        target={target}
        onSelectTarget={onSelectTarget}
        unusableModuleKeys={unusableModuleKeys}
        actions={addButton}
        titleSwitch={titleSwitch}
      />
    );

  return (
    <div className="min-w-0 space-y-3">
      <MakeItFitContext.Provider value={onOpenMakeItFit}>{body}</MakeItFitContext.Provider>
      {fightersShown && (
        <Panel title={t('fittings.fighters.title')}>
          <FittingFightersPanel
            fitting={fitting}
            stats={stats}
            onChange={edit}
            typeName={(typeId) => catalogueTypeName(catalogue, typeId)}
          />
        </Panel>
      )}
    </div>
  );
}
