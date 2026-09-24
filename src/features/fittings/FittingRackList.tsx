import { useTranslation } from 'react-i18next';
import { Panel, TypeIcon } from '@/components/ui';
import {
  FITTING_SLOT_KINDS,
  type Fitting,
  type FittingModule,
  type FittingSlotKind,
  type FittingStats,
} from '@/engine/fittings/types';
import { moduleKey } from '@/engine/fittings/skillGaps';
import { useOverBudgetFlash } from './useOverBudgetFlash';

interface ResourceBarProps {
  label: string;
  used: number | null;
  total: number | null;
}

/**
 * A CPU/PG/calibration/drone-bandwidth bar. `null` used/total render as a loading skeleton.
 * Over budget turns `danger` with the overage stated in words, and flashes once
 * each time the readout goes from within budget to over (a Character switch
 * that re-states it included) — the `null` gap while it recomputes doesn't count.
 */
function ResourceBar({ label, used, total }: ResourceBarProps) {
  const { t } = useTranslation();
  const { overage, overBudget, flashKey } = useOverBudgetFlash(used, total);
  const known = used !== null && total !== null;
  const pct = known && total > 0 ? Math.min(100, (used / total) * 100) : 0;

  return (
    <div>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-28 shrink-0 text-text-dim">{label}</span>
        <div
          role="meter"
          aria-label={label}
          aria-valuenow={known ? used : undefined}
          aria-valuemax={known ? total : undefined}
          className="h-2 flex-1 overflow-hidden rounded-full bg-panel-2"
        >
          {known && (
            <div
              className={`h-full rounded-full ${overBudget ? 'bg-danger' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          )}
        </div>
        <span
          key={flashKey}
          className={`w-24 shrink-0 text-right ${overBudget ? 'text-danger' : 'text-text-dim'} ${flashKey > 0 && overBudget ? 'flash-danger' : ''}`}
        >
          {known ? `${used.toFixed(1)} / ${total.toFixed(1)}` : '…'}
        </span>
      </div>
      {overBudget && (
        <p className="pl-30 text-right text-xs text-danger">
          {t('fittings.list.overBy', { amount: overage.toFixed(1) })}
        </p>
      )}
    </div>
  );
}

function RackRow({ module, cantUse }: { module: FittingModule; cantUse: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-xs bg-panel-2 p-1.5">
      <TypeIcon typeId={module.typeId} size={32} width={24} height={24} />
      {module.chargeTypeId !== undefined && (
        <TypeIcon typeId={module.chargeTypeId} size={32} width={16} height={16} />
      )}
      <span className="truncate text-xs text-text-dim">
        {t(`fittings.list.moduleState.${module.state}`)}
      </span>
      {cantUse && (
        <span className="ml-auto shrink-0 rounded-xs border border-danger px-1 text-[0.6875rem] font-semibold text-danger">
          {t('fittings.list.cantUse')}
        </span>
      )}
    </div>
  );
}

interface FittingRackListProps {
  fitting: Fitting;
  stats: FittingStats | null;
  /** `moduleKey`s the active Character lacks the skills for. */
  unusableModuleKeys?: ReadonlySet<string>;
}

export function FittingRackList({ fitting, stats, unusableModuleKeys }: FittingRackListProps) {
  const { t } = useTranslation();
  const modulesByRack = new Map<FittingSlotKind, FittingModule[]>();
  for (const rack of FITTING_SLOT_KINDS) modulesByRack.set(rack, []);
  for (const module of fitting.modules) modulesByRack.get(module.slot)?.push(module);

  return (
    <Panel title={t('fittings.list.title')}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <ResourceBar
            label={t('fittings.list.cpu')}
            used={stats?.cpuUsed ?? null}
            total={stats?.cpuTotal ?? null}
          />
          <ResourceBar
            label={t('fittings.list.powergrid')}
            used={stats?.powergridUsed ?? null}
            total={stats?.powergridTotal ?? null}
          />
          <ResourceBar
            label={t('fittings.list.calibration')}
            used={stats?.calibrationUsed ?? null}
            total={stats?.calibrationTotal ?? null}
          />
          <ResourceBar
            label={t('fittings.list.droneBandwidth')}
            used={stats?.droneBandwidthUsed ?? null}
            total={stats?.droneBandwidthTotal ?? null}
          />
        </div>

        {FITTING_SLOT_KINDS.map((rack) => {
          const modules = modulesByRack.get(rack) ?? [];
          if (modules.length === 0) return null;
          return (
            <div key={rack}>
              <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t(`fittings.list.rack.${rack}`)}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {modules.map((module) => (
                  <RackRow
                    key={moduleKey(module)}
                    module={module}
                    cantUse={unusableModuleKeys?.has(moduleKey(module)) ?? false}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {fitting.drones.length > 0 && (
          <div>
            <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('fittings.list.drones')}
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {fitting.drones.map((drone, index) => (
                <div key={index} className="flex items-center gap-2 rounded-xs bg-panel-2 p-1.5">
                  <TypeIcon typeId={drone.typeId} size={32} width={24} height={24} />
                  <span className="text-xs text-text-dim">
                    x{drone.quantity} · {t(`fittings.list.droneState.${drone.state}`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
