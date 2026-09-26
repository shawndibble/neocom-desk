/**
 * The Fitting editor's item actions (`FittingItemActions`, what every item
 * menu and drop does), built once per change to what they read rather than
 * on every render of the page, so the menus that take them in context
 * (`FittingItemMenu`, `ModuleMenuItems`…) keep their memoization. Along with
 * them, the few edits the page itself also needs: fitting a module into a
 * slot (charged as the Add panel's are), whether an Add panel item has
 * anywhere to go, and the drone bay's size.
 *
 * Every edit goes through `edit((current) => …)`, so the callbacks read the
 * Fitting they change rather than close over the one last rendered, and
 * keep their identity across edits that leave their inputs alone.
 */
import { useCallback, useMemo, useState } from 'react';
import type { CandidateRack } from '@/engine/fittings/candidates';
import {
  addDronesWithinBay,
  addModule,
  cargoVolumeUsed,
  copyToAllOfType,
  droneGroups,
  droneRoom,
  fillRack,
  firstFreeSlotIndex,
  launchDrones,
  moveModule,
  recallDrones,
  removeAllOfType,
  removeModule,
  setCargoQuantity,
  setDroneCounts,
  setModuleCharge,
  setModuleState,
  swapModuleType,
  type DroneBay,
  type DroneLaunchLimits,
} from '@/engine/fittings/fittingEdit';
import type { Fitting, FittingSlotKind, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { buildVariationIndex, getVariations } from '@/engine/market/variations';
import type { AddTarget } from './addTarget';
import { chargeGroupIdsFor, checkCharges } from './dogmaFittingEngine';
import type { FittingDragPayload, FittingDropTarget } from './fittingDrag';
import type { FittingItemActions } from './fittingItemActions';
import type { ChargeLoading } from './useChargeLoading';
import { catalogueTypeName, catalogueVolume, type FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';

interface EditorItemActionsInput {
  fitting: Fitting | null;
  stats: FittingStats | null;
  edit: (change: FittingChange, coalesceKey?: string) => void;
  engineReady: boolean;
  profile: PilotProfile | null;
  catalogue: FittingCatalogue | null;
  charges: ChargeLoading;
  /** The Add panel's chosen slot — an Add panel item always has room there. */
  target: AddTarget | null;
  /** The Drones rack is shown: a drone has somewhere to go. */
  dronesShown: boolean;
  /** Drag is pointer-only: without one, every drop is off. */
  dragEnabled: boolean;
  /** Stable (a `useCallback` over state setters), as the next two are. */
  showInfo: (typeId: number, name: string) => void;
  selectTarget: (target: AddTarget) => void;
  /** Opens the quantity dialog for a cargo item. */
  openCargoQuantity: (typeId: number) => void;
}

export interface EditorItemActions {
  /** Null with no Fitting open. */
  itemActions: FittingItemActions | null;
  /** A module into `slotIndex`, or its rack's first free slot with `'firstFree'`; charged as the Add panel's are. */
  fitAt: (rack: FittingSlotKind, slotIndex: number | 'firstFree', typeId: number) => void;
  /** Whether an Add panel item has anywhere to go: the chosen slot, a free one in its rack, room in the bay. */
  canPlace: (rack: CandidateRack, typeId: number) => boolean;
  /** Null before the ship data, so nothing is capped yet. */
  droneBay: DroneBay | null;
  /** The types last fitted to a rack, newest first; `fitAt` notes them itself. */
  noteRecent: (rack: FittingSlotKind, typeId: number) => void;
  /** Charges a not-yet-fitted `typeId` could default to at `rack` on `shipTypeId`. */
  defaultCharges: (shipTypeId: number, rack: FittingSlotKind, typeId: number) => number[];
  /** A drop on the List (the Ring's module drops come through its own props). */
  drop: (payload: FittingDragPayload, target: FittingDropTarget, alt: boolean) => void;
}

const RECENT_PER_RACK = 5;

export function useEditorItemActions({
  fitting,
  stats,
  edit,
  engineReady,
  profile,
  catalogue,
  charges,
  target,
  dronesShown,
  dragEnabled,
  showInfo,
  selectTarget,
  openCargoQuantity,
}: EditorItemActionsInput): EditorItemActions {
  // The types last fitted to each rack, newest first — an empty slot's
  // "Add module ▸" and "Fill rack with last used".
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
  // "Copy module", for "Paste module" into an empty slot of the same rack.
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
    () =>
      stats === null
        ? null
        : {
            bandwidthTotal: stats.droneBandwidthTotal,
            maxActive: stats.maxActiveDrones,
            // A drone the engine gave no bandwidth for stays in the bay rather than launching unlimited.
            bandwidthOf: (typeId) => stats.droneBandwidthByType[typeId] ?? Number.POSITIVE_INFINITY,
          },
    [stats]
  );

  /**
   * The charges a not-yet-fitted `typeId` could default to at `rack` — its
   * own charge groups (calculated alone, since it has no fitted result yet),
   * narrowed to what the hull and skills accept, alphabetical to match the
   * Charges tab's own ordering (issue #1728's "first charge listed").
   */
  const defaultCharges = useCallback(
    (shipTypeId: number, rack: FittingSlotKind, typeId: number): number[] => {
      if (!engineReady || profile === null || catalogue === null) return [];
      const groupIds = chargeGroupIdsFor(shipTypeId, rack, typeId);
      if (groupIds.length === 0) return [];
      const candidates = [
        ...new Set(groupIds.flatMap((id) => catalogue.typeIdsByGroup.get(id) ?? [])),
      ];
      const accepted = checkCharges(shipTypeId, { slot: rack, typeId }, candidates, profile);
      return candidates
        .filter((id) => accepted.has(id))
        .sort((a, b) =>
          catalogueTypeName(catalogue, a).localeCompare(catalogueTypeName(catalogue, b))
        );
    },
    [engineReady, profile, catalogue]
  );

  const fitAt = useCallback(
    (rack: FittingSlotKind, slotIndex: number | 'firstFree', typeId: number) => {
      const count = slotCounts?.[rack];
      edit((f) => {
        const index =
          slotIndex === 'firstFree'
            ? count === undefined
              ? null
              : firstFreeSlotIndex(f, rack, count)
            : slotIndex;
        if (index === null) return f;
        noteRecent(rack, typeId);
        return addModule(f, rack, index, typeId, () => defaultCharges(f.shipTypeId, rack, typeId));
      });
    },
    [edit, slotCounts, noteRecent, defaultCharges]
  );

  const canPlace = useCallback(
    (rack: CandidateRack, typeId: number): boolean => {
      if (rack === 'drone') {
        // Room for one more of this drone beside what the bay already holds.
        return dronesShown && fitting !== null && droneRoom(fitting, typeId, droneBay) >= 1;
      }
      if (fitting === null || slotCounts === null) return false;
      if (target?.kind === 'slot' && target.slot === rack) return true;
      return firstFreeSlotIndex(fitting, rack, slotCounts[rack]) !== null;
    },
    [dronesShown, fitting, droneBay, slotCounts, target]
  );

  /**
   * A drop on the List: a charge loads — into every module that takes it,
   * or with Alt only the one it landed on — a module goes in, or moves, and
   * a drone launches.
   */
  const drop = useCallback(
    (payload: FittingDragPayload, onto: FittingDropTarget, alt: boolean) => {
      if (payload.kind === 'charge') {
        charges.load(payload.typeId, {
          fromCargo: payload.fromCargo,
          only:
            alt && onto.kind === 'slot' ? { slot: onto.rack, slotIndex: onto.index } : undefined,
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
          // From the Add panel, one more goes in the bay first.
          const stocked = payload.kind === 'type' ? addDronesWithinBay(f, typeId, 1, droneBay) : f;
          return launchLimits === null ? stocked : launchDrones(stocked, launchLimits, typeId);
        });
        return;
      }
      const { rack, typeId } = payload;
      if (onto.kind === 'drones' || rack !== onto.rack) return;
      // A rack heading takes it into the rack's first free slot.
      fitAt(rack, onto.kind === 'slot' ? onto.index : 'firstFree', typeId);
    },
    [charges, edit, droneBay, launchLimits, fitAt]
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
  // The hold as fitted (a cargo expander counts), read off the stats already
  // worked out under the conditions (All V, skill overrides…); null before them.
  const cargoCapacity = stats?.holds.cargo ?? null;
  const open = fitting !== null;

  const itemActions = useMemo<FittingItemActions | null>(
    () =>
      !open
        ? null
        : {
            typeName: (typeId) => catalogueTypeName(catalogue, typeId),
            showInfo,
            charges,
            setState: (rack, index, state) => edit((f) => setModuleState(f, rack, index, state)),
            unloadCharge: (rack, index) => edit((f) => setModuleCharge(f, rack, index, null)),
            copyToAllOfType: (rack, index) => edit((f) => copyToAllOfType(f, rack, index)),
            variantsOf: (typeId) =>
              variationIndex === null
                ? []
                : getVariations(variationIndex, typeId)
                    .members.filter((member) => member.typeId !== typeId)
                    .map((member) => ({
                      typeId: member.typeId,
                      name: catalogueTypeName(catalogue, member.typeId),
                    })),
            swapType: (rack, index, typeId) => edit((f) => swapModuleType(f, rack, index, typeId)),
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
            // Drag is pointer-only: a touch screen has the menus instead.
            dropHandlers: dragEnabled
              ? { addType: true, moveModule: true, loadCharge: true, launchDrone: true }
              : {},
            drop,
          },
    [
      open,
      catalogue,
      showInfo,
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
      canPlace,
      droneBay,
      dragEnabled,
      drop,
    ]
  );

  return { itemActions, fitAt, canPlace, droneBay, noteRecent, defaultCharges, drop };
}
