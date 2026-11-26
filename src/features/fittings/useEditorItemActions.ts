import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CandidateRack } from '@/engine/fittings/candidates';
import {
  addCargo,
  addDronesWithinBay,
  addModule,
  cargoVolumeUsed,
  copyToAllOfType,
  droneGroups,
  droneRoom,
  fillRack,
  firstFreeSlotIndex,
  launchDrones,
  launchLimitsFrom,
  launchNewDrone,
  moveModule,
  recallDrones,
  removeAllOfType,
  removeModule,
  setCargoQuantity,
  setDroneCounts,
  setModuleCharge,
  setModuleState,
  setModulesState,
  takeCargo,
  unloadCharges,
  type DroneBay,
  type DroneLaunchLimits,
} from '@/engine/fittings/fittingEdit';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import { buildVariationIndex, getVariations } from '@/engine/market/variations';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import type { AddTarget } from './addTarget';
import type { FittingContext } from './fittingContext';
import {
  chargeSlotDropOnly,
  ringDropFor,
  type FittingDragPayload,
  type FittingDropTarget,
} from './fittingDrag';
import type { ChargePickerInput, FittingItemActions } from './fittingItemActions';
import type { ChargeLoading } from './useChargeLoading';
import { catalogueTypeName, catalogueVolume, type FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';

interface EditorItemActionsInput {
  fitting: Fitting | null;
  stats: FittingStats | null;
  currentStats: FittingStats | null;
  edit: (change: FittingChange, coalesceKey?: string) => void;
  context: FittingContext | null;
  catalogue: FittingCatalogue | null;
  charges: ChargeLoading;
  target: AddTarget | null;
  dronesShown: boolean;
  dragEnabled: boolean;
  selectTarget: (target: AddTarget) => void;
  openCargoQuantity: (typeId: number) => void;
  openVariations: (rack: FittingSlotKind, index: number) => void;
  openMutation: (rack: FittingSlotKind, index: number) => void;
}

export interface EditorItemActions {
  itemActions: FittingItemActions | null;
  fitAt: (
    rack: FittingSlotKind,
    slotIndex: number | 'firstFree',
    typeId: number,
    fromCargo?: boolean
  ) => void;
  droneBay: DroneBay | null;
  noteRecent: (rack: FittingSlotKind, typeId: number) => void;
  defaultCharges: (shipTypeId: number, rack: FittingSlotKind, typeId: number) => number[];
  drop: (payload: FittingDragPayload, target: FittingDropTarget, alt: boolean) => void;
}

const RECENT_PER_RACK = 5;

export function useEditorItemActions({
  fitting,
  stats,
  currentStats,
  edit,
  context,
  catalogue,
  charges,
  target,
  dronesShown,
  dragEnabled,
  selectTarget,
  openCargoQuantity,
  openVariations,
  openMutation,
}: EditorItemActionsInput): EditorItemActions {
  const mutaplasmids = useMutaplasmidLookup();
  const [recent, setRecent] = useState<Partial<Record<FittingSlotKind, number[]>>>({});
  const noteRecent = useCallback((rack: FittingSlotKind, typeId: number) => {
    setRecent((prev) => ({
      ...prev,
      [rack]: [typeId, ...(prev[rack] ?? []).filter((id) => id !== typeId)].slice(
        0,
        RECENT_PER_RACK
      ),
    }));
  }, []);
  const [copiedModule, setCopiedModule] = useState<{
    rack: FittingSlotKind;
    typeId: number;
  } | null>(null);

  const slotCounts = stats?.slotCounts ?? null;
  const droneCapacity = stats?.droneCapacity ?? null;
  const droneBay = useMemo<DroneBay | null>(
    () =>
      droneCapacity === null
        ? null
        : { capacity: droneCapacity, volumeOf: (typeId) => catalogueVolume(catalogue, typeId) },
    [droneCapacity, catalogue]
  );
  const launchLimits = useMemo<DroneLaunchLimits | null>(
    () => launchLimitsFrom(currentStats),
    [currentStats]
  );

  const defaultCharges = useCallback(
    (shipTypeId: number, rack: FittingSlotKind, typeId: number): number[] => {
      if (context === null) return [];
      const { engine, profile, catalogue } = context;
      const groupIds = engine.chargeGroupIdsFor(shipTypeId, rack, typeId);
      if (groupIds.length === 0) return [];
      const candidates = [
        ...new Set(groupIds.flatMap((id) => catalogue.typeIdsByGroup.get(id) ?? [])),
      ];
      const accepted = engine.checkCharges(shipTypeId, { slot: rack, typeId }, candidates, profile);
      return candidates
        .filter((id) => accepted.has(id))
        .sort((a, b) =>
          catalogueTypeName(catalogue, a).localeCompare(catalogueTypeName(catalogue, b))
        );
    },
    [context]
  );

  const fitAt = useCallback(
    (rack: FittingSlotKind, slotIndex: number | 'firstFree', typeId: number, fromCargo = false) => {
      const count = slotCounts?.[rack];
      edit((f) => {
        const index =
          slotIndex === 'firstFree'
            ? count === undefined
              ? null
              : firstFreeSlotIndex(f, rack, count)
            : slotIndex;
        if (index === null) return f;
        if (fromCargo && takeCargo(f, typeId, 1) === f) return f;
        noteRecent(rack, typeId);
        const next = addModule(f, rack, index, typeId, () =>
          defaultCharges(f.shipTypeId, rack, typeId)
        );
        return fromCargo ? takeCargo(next, typeId, 1) : next;
      });
    },
    [edit, slotCounts, noteRecent, defaultCharges]
  );

  const canPlace = useCallback(
    (rack: CandidateRack, typeId: number): boolean => {
      if (rack === 'drone') {
        return dronesShown && fitting !== null && droneRoom(fitting, typeId, droneBay) >= 1;
      }
      if (fitting === null || slotCounts === null) return false;
      if (target?.kind === 'slot' && target.slot === rack) return true;
      return firstFreeSlotIndex(fitting, rack, slotCounts[rack]) !== null;
    },
    [dronesShown, fitting, droneBay, slotCounts, target]
  );

  const drop = useCallback(
    (payload: FittingDragPayload, onto: FittingDropTarget, alt: boolean) => {
      if (onto.kind === 'ring') {
        const placed = fitting === null ? null : ringDropFor(payload, fitting.modules, slotCounts);
        const fromCargo = payload.kind === 'type' && !!payload.fromCargo;
        if (placed?.kind === 'fit') fitAt(placed.rack, 'firstFree', placed.typeId, fromCargo);
        else if (placed?.kind === 'load')
          charges.load(placed.typeId, { fromCargo: placed.fromCargo, only: placed.only });
        return;
      }
      if (onto.kind === 'cargo') {
        if (payload.kind !== 'type' && payload.kind !== 'charge') return;
        const { typeId } = payload;
        edit((f) => addCargo(f, typeId, 1));
        if (payload.kind === 'charge') openCargoQuantity(typeId);
        return;
      }
      if (payload.kind === 'charge') {
        charges.load(payload.typeId, {
          fromCargo: payload.fromCargo,
          only: onto.kind === 'slot' ? chargeSlotDropOnly(onto.rack, onto.index, alt) : undefined,
        });
        return;
      }
      if (payload.kind === 'slot') {
        if (onto.kind === 'slot') edit((f) => moveModule(f, onto.rack, payload.index, onto.index));
        return;
      }
      if (payload.kind === 'drone' || payload.rack === 'drone') {
        const { typeId } = payload;
        edit((f) => {
          if (payload.kind === 'type') return launchNewDrone(f, typeId, droneBay, launchLimits);
          return launchLimits === null ? f : launchDrones(f, launchLimits, typeId);
        });
        return;
      }
      const { rack, typeId, fromCargo } = payload;
      if (onto.kind === 'drones' || rack !== onto.rack) return;
      fitAt(rack, onto.kind === 'slot' ? onto.index : 'firstFree', typeId, fromCargo);
    },
    [charges, edit, droneBay, launchLimits, fitAt, fitting, slotCounts, openCargoQuantity]
  );

  const variationIndex = useMemo(
    () =>
      catalogue === null
        ? null
        : buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups),
    [catalogue]
  );
  const cargo = fitting?.cargo;
  const cargoUsed = useMemo(
    () =>
      catalogue === null || cargo === undefined
        ? null
        : cargoVolumeUsed({ cargo }, (typeId) => catalogueVolume(catalogue, typeId)),
    [cargo, catalogue]
  );
  const cargoCapacity = stats?.holds.cargo ?? null;
  const open = fitting !== null;
  const shipTypeId = fitting?.shipTypeId ?? null;
  const chargePickerRef = useRef<ChargePickerInput | null>(null);
  const statModules = currentStats?.modules ?? null;
  useLayoutEffect(() => {
    chargePickerRef.current =
      fitting === null || catalogue === null
        ? null
        : { fitting, context, moduleResults: statModules };
  }, [fitting, catalogue, context, statModules]);

  const itemActions = useMemo<FittingItemActions | null>(
    () =>
      !open
        ? null
        : {
            typeName: (typeId) => catalogueTypeName(catalogue, typeId),
            rackOf: (typeId) => catalogue?.rackOf[typeId] ?? null,
            charges,
            setState: (rack, index, state) => edit((f) => setModuleState(f, rack, index, state)),
            unloadCharge: (rack, index) => edit((f) => setModuleCharge(f, rack, index, null)),
            setGroupState: (at, state) => edit((f) => setModulesState(f, at, state)),
            unloadGroup: (at) => edit((f) => unloadCharges(f, at)),
            chargesFor: (module) =>
              shipTypeId === null ? [] : defaultCharges(shipTypeId, module.slot, module.typeId),
            chargePickerInput: () => chargePickerRef.current,
            copyToAllOfType: (rack, index) => edit((f) => copyToAllOfType(f, rack, index)),
            hasVariants: (typeId) =>
              variationIndex !== null &&
              getVariations(variationIndex, typeId).members.some(
                (member) => member.typeId !== typeId
              ),
            openVariations,
            canMutate: (typeId) =>
              mutaplasmids !== null &&
              (mutaplasmids.isAbyssalType(typeId) ||
                mutaplasmids.mutaplasmidsForBase(typeId).length > 0),
            openMutation,
            removeAllOfType: (typeId) => edit((f) => removeAllOfType(f, typeId)),
            remove: (rack, index) => edit((f) => removeModule(f, rack, index)),
            move: (rack, from, to) => edit((f) => moveModule(f, rack, from, to)),
            slotCount: (rack) => slotCounts?.[rack] ?? null,
            copyModule: (module) => setCopiedModule({ rack: module.slot, typeId: module.typeId }),
            recentFor: (rack) => recent[rack] ?? [],
            clipboardFor: (rack) => (copiedModule?.rack === rack ? copiedModule.typeId : null),
            addModule: (rack, index, typeId) => fitAt(rack, index, typeId),
            browseFor: (rack, index) =>
              selectTarget({ kind: 'slot', slot: rack, slotIndex: index }),
            fillRack: (rack, typeId) => {
              if (slotCounts === null) return;
              edit((f) =>
                fillRack(f, rack, slotCounts[rack], typeId, () =>
                  defaultCharges(f.shipTypeId, rack, typeId)
                )
              );
            },
            launchDrones: (typeId) => {
              if (launchLimits !== null) edit((f) => launchDrones(f, launchLimits, typeId));
            },
            recallDrones: (typeId) => edit((f) => recallDrones(f, typeId)),
            recallAllDrones: () =>
              edit((f) =>
                droneGroups(f).reduce((next, group) => recallDrones(next, group.typeId), f)
              ),
            removeDrones: (typeId) =>
              edit((f) => setDroneCounts(f, typeId, { inSpace: 0, inBay: 0 })),
            cargoCapacity,
            cargoUsed,
            openAddCargo: () => selectTarget({ kind: 'cargo' }),
            changeCargoQuantity: openCargoQuantity,
            removeCargo: (typeId) => edit((f) => setCargoQuantity(f, typeId, 0)),
            canFitFirstFree: (typeId, rack) => canPlace(rack, typeId),
            fitFirstFree: (typeId, rack) => {
              if (rack === 'drone') {
                edit((f) => addDronesWithinBay(f, typeId, 1, droneBay), `drone-add-${typeId}`);
                return;
              }
              fitAt(rack, 'firstFree', typeId);
            },
            dropHandlers: dragEnabled
              ? {
                  addType: true,
                  moveModule: true,
                  loadCharge: true,
                  launchDrone: true,
                  addCargo: true,
                }
              : {},
            drop,
          },
    [
      open,
      shipTypeId,
      catalogue,
      charges,
      edit,
      variationIndex,
      slotCounts,
      recent,
      copiedModule,
      fitAt,
      selectTarget,
      defaultCharges,
      launchLimits,
      cargoCapacity,
      cargoUsed,
      openCargoQuantity,
      openVariations,
      mutaplasmids,
      openMutation,
      canPlace,
      droneBay,
      dragEnabled,
      drop,
    ]
  );

  return { itemActions, fitAt, droneBay, noteRecent, defaultCharges, drop };
}
