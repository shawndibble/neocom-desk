import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, TypeIcon } from '@/components/ui';
import {
  arcEndPoint,
  buildRingSlots,
  ringSlotPosition,
  type RingSlot,
} from '@/engine/fittings/ringLayout';
import { moduleKey } from '@/engine/fittings/skillGaps';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import { typeIconUrl, typeRenderUrl } from '@/lib/eveImages';
import { useOverBudgetFlash } from './useOverBudgetFlash';

const GAUGE_RADIUS = 19;

interface FittingRingProps {
  fitting: Fitting;
  stats: FittingStats | null;
  /** `moduleKey`s the active Character lacks the skills for. */
  unusableModuleKeys?: ReadonlySet<string>;
  /** Tapping a slot — the module and add panels hang off this once editing lands (#1533). */
  onSlotSelect?: (rack: FittingSlotKind, index: number) => void;
}

/** One half-circle gauge: a track, plus the used share drawn over it. */
function GaugeArc({
  side,
  used,
  total,
  overBudget,
}: {
  side: 'left' | 'right';
  used: number | null;
  total: number | null;
  overBudget: boolean;
}) {
  const sweep = side === 'left' ? 0 : 1;
  const top = arcEndPoint(side, 0, GAUGE_RADIUS);
  const bottom = arcEndPoint(side, 1, GAUGE_RADIUS);
  const fraction = used !== null && total !== null && total > 0 ? Math.min(1, used / total) : 0;
  const end = arcEndPoint(side, fraction, GAUGE_RADIUS);
  return (
    <>
      <path
        d={`M ${top.x} ${top.y} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 ${sweep} ${bottom.x} ${bottom.y}`}
        className="fill-none stroke-panel-2"
        strokeWidth={3}
        strokeLinecap="round"
      />
      {fraction > 0 && (
        <path
          d={`M ${top.x} ${top.y} A ${GAUGE_RADIUS} ${GAUGE_RADIUS} 0 0 ${sweep} ${end.x} ${end.y}`}
          className={`fill-none ${overBudget ? 'stroke-danger' : 'stroke-accent'}`}
          strokeWidth={3}
          strokeLinecap="round"
        />
      )}
    </>
  );
}

function GaugeReadout({
  label,
  used,
  total,
  flash,
}: {
  label: string;
  used: number | null;
  total: number | null;
  flash: ReturnType<typeof useOverBudgetFlash>;
}) {
  const { t } = useTranslation();
  const { overage, overBudget, flashKey } = flash;
  const known = used !== null && total !== null;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={known ? used : undefined}
      aria-valuemax={known ? total : undefined}
      className="min-w-0 flex-1 text-center text-xs"
    >
      <p className="text-text-dim">{label}</p>
      <p
        key={flashKey}
        className={`rounded-xs font-semibold ${overBudget ? 'text-danger' : 'text-text'} ${flashKey > 0 && overBudget ? 'flash-danger' : ''}`}
      >
        {known ? `${used.toFixed(1)} / ${total.toFixed(1)}` : '…'}
      </p>
      {overBudget && (
        <p className="text-danger">{t('fittings.list.overBy', { amount: overage.toFixed(1) })}</p>
      )}
    </div>
  );
}

function SlotButton({
  slot,
  cantUse,
  onSelect,
  style,
}: {
  slot: RingSlot;
  cantUse: boolean;
  onSelect?: (rack: FittingSlotKind, index: number) => void;
  style?: React.CSSProperties;
}) {
  const { t } = useTranslation();
  const { module } = slot;
  const rackLabel = t(`fittings.list.rack.${slot.rack}`);
  const label = module
    ? t('fittings.ring.slotFitted', {
        rack: rackLabel,
        index: slot.index + 1,
        state: t(`fittings.list.moduleState.${module.state}`),
      })
    : t('fittings.ring.slotEmpty', { rack: rackLabel, index: slot.index + 1 });
  const className = `absolute flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-panel-2 ${
    cantUse ? 'border-danger' : module ? 'border-border' : 'border-dashed border-border'
  }`;
  const content = (
    <>
      {module && <TypeIcon typeId={module.typeId} size={32} width={28} height={28} />}
      {module?.chargeTypeId !== undefined && (
        <span className="absolute -right-0.5 -bottom-0.5 rounded-full bg-panel p-px">
          <TypeIcon typeId={module.chargeTypeId} size={32} width={14} height={14} />
        </span>
      )}
      {cantUse && (
        <span className="absolute -top-1 -right-1 rounded-xs bg-danger px-0.5 text-[0.625rem] leading-tight font-bold text-bg">
          !
        </span>
      )}
    </>
  );
  return onSelect ? (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${className} cursor-pointer hover:border-accent`}
      style={style}
      onClick={() => onSelect(slot.rack, slot.index)}
    >
      {content}
    </button>
  ) : (
    <span role="img" aria-label={label} title={label} className={className} style={style}>
      {content}
    </span>
  );
}

/** The ship's own render, falling back to its icon when the image server has none. */
function ShipRender({ typeId }: { typeId: number }) {
  const [failed, setFailed] = useState(false);
  const [renderedTypeId, setRenderedTypeId] = useState(typeId);
  if (typeId !== renderedTypeId) {
    setRenderedTypeId(typeId);
    setFailed(false);
  }
  return (
    <img
      src={failed ? typeIconUrl(typeId, 128) : typeRenderUrl(typeId, 256)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      onError={() => setFailed(true)}
      className="absolute top-1/2 left-1/2 h-[30%] w-[30%] -translate-x-1/2 -translate-y-1/2 rounded-full object-cover"
    />
  );
}

/**
 * The game-style Ring view (issue #1536): the hull's render in the middle,
 * module icons on the ring by rack, and CPU/powergrid arc gauges with numeric
 * readouts underneath. Subsystems (T3s) aren't on the ring — they sit in a row
 * below it. Slot buttons are 44px regardless of the ring's own size.
 */
export function FittingRing({
  fitting,
  stats,
  unusableModuleKeys,
  onSlotSelect,
}: FittingRingProps) {
  const { t } = useTranslation();
  const slots = buildRingSlots(fitting, stats?.slotLayout ?? null);
  const countByRack = new Map<FittingSlotKind, number>();
  for (const slot of slots) countByRack.set(slot.rack, (countByRack.get(slot.rack) ?? 0) + 1);

  const cpuUsed = stats?.cpuUsed ?? null;
  const cpuTotal = stats?.cpuTotal ?? null;
  const pgUsed = stats?.powergridUsed ?? null;
  const pgTotal = stats?.powergridTotal ?? null;
  const cpu = useOverBudgetFlash(cpuUsed, cpuTotal);
  const pg = useOverBudgetFlash(pgUsed, pgTotal);

  const ringSlots = slots.filter((slot) => slot.rack !== 'subsystem');
  const subsystems = slots.filter((slot) => slot.rack === 'subsystem');
  const cantUse = (slot: RingSlot) =>
    slot.module !== undefined && (unusableModuleKeys?.has(moduleKey(slot.module)) ?? false);

  return (
    <Panel title={t('fittings.ring.title')}>
      <div className="space-y-3">
        <div className="relative mx-auto aspect-square w-full max-w-md">
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <GaugeArc side="left" used={cpuUsed} total={cpuTotal} overBudget={cpu.overBudget} />
            <GaugeArc side="right" used={pgUsed} total={pgTotal} overBudget={pg.overBudget} />
          </svg>
          <ShipRender typeId={fitting.shipTypeId} />
          {ringSlots.map((slot) => {
            const { x, y } = ringSlotPosition(
              slot.rack,
              slot.index,
              countByRack.get(slot.rack) ?? 1
            );
            return (
              <SlotButton
                key={`${slot.rack}-${slot.index}`}
                slot={slot}
                cantUse={cantUse(slot)}
                onSelect={onSlotSelect}
                style={{ left: `${x}%`, top: `${y}%` }}
              />
            );
          })}
        </div>

        <div className="flex gap-3">
          <GaugeReadout
            label={t('fittings.list.cpu')}
            used={cpuUsed}
            total={cpuTotal}
            flash={cpu}
          />
          <GaugeReadout
            label={t('fittings.list.powergrid')}
            used={pgUsed}
            total={pgTotal}
            flash={pg}
          />
        </div>

        {subsystems.length > 0 && (
          <div>
            <p className="mb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('fittings.list.rack.subsystem')}
            </p>
            <div className="relative flex flex-wrap gap-2">
              {subsystems.map((slot) => (
                <div key={slot.index} className="relative h-11 w-11">
                  <SlotButton
                    slot={slot}
                    cantUse={cantUse(slot)}
                    onSelect={onSlotSelect}
                    style={{ left: '50%', top: '50%' }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
