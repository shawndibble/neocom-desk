import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TypeIcon } from '@/components/ui';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import {
  droneBayUsed,
  droneCarried,
  droneCarriedMax,
  droneGroups,
  droneLaunchedMax,
  launchLimitsFrom,
  setDroneCounts,
  setDronesCarried,
  setDronesLaunched,
  type DroneBay,
} from '@/engine/fittings/fittingEdit';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { showsDrones } from '@/engine/fittings/stats';
import { DroneMenuItems } from './FittingItemMenu';
import { useFittingDropTarget, useFittingItemActions } from './fittingItemActions';
import { MutationBadge } from './MutationBadge';
import type { AddTarget } from './addTarget';
import { catalogueTypeName, catalogueVolume, type FittingCatalogue } from './useFittingCatalogue';
import {
  AddSlotButton,
  CountInput,
  RACK_LABEL_CLASS,
  ResourceBar,
  SlotCard,
  SlotName,
  type EditContext,
} from './RackListParts';

/** Squares a drone row always shows — a full flight at Drones V. */
const LAUNCH_SQUARES = 5;

/**
 * A drone type's launch squares: one lit per drone of it in space. Clicking
 * a square launches up to it; clicking the highest lit one recalls it. A
 * square past what the Fitting carries, or past what bandwidth and the
 * pilot's drone count allow, is disabled — `aria-disabled` rather than the
 * native attribute, so its tooltip saying why stays reachable by hover, focus
 * and touch-and-hold.
 */
function LaunchSquares({
  name,
  inSpace,
  max,
  onLaunch,
}: {
  name: string;
  inSpace: number;
  max: number;
  onLaunch: (count: number) => void;
}) {
  const { t } = useTranslation();
  const squares = Math.max(LAUNCH_SQUARES, inSpace);
  return (
    <div role="group" aria-label={t('fittings.edit.launched', { name })} className="flex">
      {Array.from({ length: squares }, (_, index) => {
        const count = index + 1;
        const lit = count <= inSpace;
        const blocked = !lit && count > max;
        const square = (
          <button
            type="button"
            aria-label={t('fittings.edit.launchCount', { count })}
            aria-pressed={lit}
            aria-disabled={blocked || undefined}
            onClick={() => {
              if (!blocked) onLaunch(count === inSpace ? count - 1 : count);
            }}
            className={cx(
              'group flex size-9 items-center justify-center rounded-xs aria-disabled:cursor-not-allowed md:size-6',
              interactiveClassName,
              focusRingClassName
            )}
          >
            <span
              className={`size-3.5 rounded-xs border ${lit ? 'border-accent bg-accent' : blocked ? 'border-line-bright opacity-40' : 'border-line-bright group-hover:border-accent'}`}
            />
          </button>
        );
        return (
          <Fragment key={count}>
            {blocked ? (
              <Tooltip content={t('fittings.edit.launchBlocked')}>{square}</Tooltip>
            ) : (
              square
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

interface DroneSectionProps {
  fitting: Fitting;
  catalogue: FittingCatalogue | null;
  stats: FittingStats | null;
  edit: EditContext['edit'];
  target: AddTarget | null;
  onSelectTarget: (target: AddTarget) => void;
  /**
   * `list`: a section of the List, headed "Drones" under the List's own
   * resource bars. `panel`: the Ring's drone panel or the phone's sheet —
   * titled already, so no heading, and carrying its own bandwidth and bay bars.
   */
  variant?: 'list' | 'panel';
}

/**
 * The Fitting's drones: each type with how many it carries (the bay count,
 * capped at what the bay holds — launched drones included) and launch
 * squares for how many of those are in space (these count toward DPS and
 * bandwidth, capped by it), and a way to add more. The List's Drones
 * section, the Ring's drone panel, and the phone Ring's Drones sheet.
 * Nothing on a hull that takes no drones.
 */
export function DroneSection({
  fitting,
  catalogue,
  stats,
  edit,
  target,
  onSelectTarget,
  variant = 'list',
}: DroneSectionProps) {
  const { t } = useTranslation();
  const actions = useFittingItemActions();
  const drop = useFittingDropTarget({ kind: 'drones' });
  const drones = droneGroups(fitting);
  const droneVolume = (typeId: number) => catalogueVolume(catalogue, typeId);
  // Before the ship data the bay's size is unknown, so nothing is capped yet.
  const bay: DroneBay | null =
    stats === null ? null : { capacity: stats.droneCapacity, volumeOf: droneVolume };
  const launch = launchLimitsFrom(stats);
  if (!showsDrones(stats, drones.length)) return null;
  return (
    // A drone dragged here (from the bay below, or the Add panel) launches.
    <div
      className={`space-y-1.5 rounded-xs ${drop.over ? 'ring-2 ring-accent/60' : drop.accepts ? 'outline-1 outline-dashed outline-accent' : ''}`}
      {...drop.props}
    >
      {variant === 'list' && <p className={RACK_LABEL_CLASS}>{t('fittings.list.drones')}</p>}
      {variant === 'panel' && (
        <div className="space-y-1.5">
          <ResourceBar
            label={t('fittings.list.droneBandwidth')}
            used={stats?.droneBandwidthUsed ?? null}
            total={stats?.droneBandwidthTotal ?? null}
          />
          <ResourceBar
            label={t('fittings.list.droneBay')}
            used={catalogue === null ? null : droneBayUsed(fitting, droneVolume)}
            total={stats?.droneCapacity ?? null}
          />
        </div>
      )}
      {drones.length > 0 && (
        <p className="text-xs text-text-dim">{t('fittings.edit.dronesHint')}</p>
      )}
      <div className="space-y-1.5">
        {drones.map((group) => {
          const name = catalogueTypeName(catalogue, group.typeId);
          return (
            <SlotCard
              key={group.typeId}
              menu={
                actions && {
                  name,
                  items: (
                    <DroneMenuItems
                      typeId={group.typeId}
                      inSpace={group.inSpace}
                      inBay={group.inBay}
                    />
                  ),
                }
              }
              grip={
                group.inBay > 0 && actions?.dropHandlers.launchDrone
                  ? {
                      payload: { kind: 'drone', typeId: group.typeId },
                      label: t('fittings.item.dragToLaunch', { name }),
                    }
                  : undefined
              }
              identity={
                <>
                  <TypeIcon typeId={group.typeId} size={32} width={24} height={24} />
                  <SlotName typeId={group.typeId} name={name} />
                  <MutationBadge
                    items={fitting.drones.filter((drone) => drone.typeId === group.typeId)}
                    fixable={false}
                  />
                </>
              }
              removeLabel={t('fittings.edit.remove', { name })}
              onRemove={() =>
                edit((f) => setDroneCounts(f, group.typeId, { inSpace: 0, inBay: 0 }))
              }
            >
              <LaunchSquares
                name={name}
                inSpace={group.inSpace}
                max={droneLaunchedMax(fitting, group.typeId, launch)}
                onLaunch={(count) => edit((f) => setDronesLaunched(f, group.typeId, count, launch))}
              />
              <CountInput
                label={t('fittings.edit.inBay')}
                value={droneCarried(group)}
                max={droneCarriedMax(fitting, group.typeId, bay)}
                onCommit={(count) =>
                  edit(
                    (f) => setDronesCarried(f, group.typeId, count, bay),
                    `drone-bay-${group.typeId}`
                  )
                }
              />
            </SlotCard>
          );
        })}
        <AddSlotButton
          label={t('fittings.edit.addDrones')}
          selected={target?.kind === 'drone'}
          onClick={() => onSelectTarget({ kind: 'drone' })}
        />
      </div>
    </div>
  );
}
