import { isP0 } from '@/engine/pi/chain';
import type { PlanetType } from '@/engine/pi/goalTypes';
import {
  isSaving,
  type BuildStep,
  type QuickWinDetail,
  type RebuildOption,
} from '@/engine/pi/planAdvice';
import type { ShipClass } from '@/engine/pi/planHaul';
import type { PiData, PiPinKind } from '@/sde/types';
import type { PlanAdvice, PlanColonyAdvice } from './planAdviceModel';

export function piItemName(typeId: number, pi: PiData): string {
  return (
    pi.schematics[String(typeId)]?.name ??
    pi.raw.find((resource) => resource.typeID === typeId)?.name ??
    `#${typeId}`
  );
}

export type QuickWinAction = 'restart' | 'storage' | 'idle' | 'extractors' | 'factories';

export interface QuickWinRow {
  id: string;
  planetId: number;
  planetName: string;
  planetType: PlanetType;
  action: QuickWinAction;
  detail: QuickWinDetail;
  iconTypeId: number | null;
  subject: string | null;
  gainKind: 'adds' | 'saves';
  gainPerDay: number | null;
  minutes: number;
}

export interface PlanetStrip {
  planetId: number;
  name: string;
  planetType: PlanetType;
  quickWinGainPerDay: number | null;
  rebuild:
    | { kind: 'change'; gainPerDay: number }
    | { kind: 'keep' }
    | { kind: 'unknown'; reason: RebuildRefusal };
}

export interface NamedItem {
  typeId: number;
  name: string;
}

export interface AlternativeView {
  typeId: number;
  name: string;
  tier: number;
  iskPerDayDelta: number;
  haulRatio: number | null;
}

export type RebuildRefusal = 'link-cost' | 'other';

function refusalOf(reason: string): RebuildRefusal {
  return reason === 'needs-link-cost' ? 'link-cost' : 'other';
}

export interface RebuildCardView {
  planetId: number;
  name: string;
  planetType: PlanetType;
  anchor: string;
  status: 'change' | 'keep' | 'unknown';
  sells: NamedItem[];
  sellsRaw: boolean;
  hasRefineWin: boolean;
  target: NamedItem | null;
  fromPerDay: number | null;
  toPerDay: number | null;
  gainPerDay: number | null;
  minutes: number | null;
  hasQuickWin: boolean;
  keepReason: 'already-best' | 'gain-too-small' | 'no-candidates' | 'no-haul-saving' | null;
  refusal: RebuildRefusal | null;
  alternative: AlternativeView | null;
}

export interface ChecklistStep {
  id: string;
  verb: 'upgrade' | 'remove' | 'place' | 'set' | 'route';
  pin: PiPinKind | null;
  typeId: number | null;
  subject: string | null;
  count: number | null;
  toLevel: number | null;
  carries: string | null;
  minutes: number;
}

export interface ChecklistColumn {
  planetId: number;
  name: string;
  minutes: number;
  steps: ChecklistStep[];
  fit: {
    level: number;
    cpuPercent: number;
    powerPercent: number;
    upgradeFromLevel: number | null;
  } | null;
}

export interface HaulView {
  m3PerTrip: number | null;
  todayM3PerTrip: number | null;
  tripsPerWeek: number;
  restartDays: number;
  haulDays: number;
  complete: boolean;
  route: PlanAdvice['haul']['route'];
  rebuildMinutes: number;
  fit: {
    kind: 'unknown' | 'one-trip';
    smallest: ShipClass | null;
    industrialTrips: number;
    ships: { id: ShipClass; fits: boolean }[];
  };
}

export interface PlanView {
  empty: boolean;
  headline: {
    quickWinPerDay: number;
    quickWinMinutes: number;
    unpricedQuickWins: number;
    rebuildGainPerDay: number;
    rebuildCount: number;
    colonyCount: number;
  };
  stats: {
    todayPerDay: number | null;
    afterQuickWinsPerDay: number | null;
    afterRebuildPerDay: number | null;
    m3PerWeek: number | null;
    unknownColonies: number;
  };
  strips: PlanetStrip[];
  quickWins: QuickWinRow[];
  rebuilds: RebuildCardView[];
  hauling: HaulView;
  checklist: ChecklistColumn[];
  slots: PlanAdvice['slots'];
  excluded: PlanAdvice['excluded'];
}

function quickWinAction(detail: QuickWinDetail): QuickWinAction {
  switch (detail.kind) {
    case 'restart':
      return 'restart';
    case 'idle-factories':
      return 'idle';
    case 'storage':
      return 'storage';
    case 'spare-room':
      return detail.what === 'extractors' ? 'extractors' : 'factories';
  }
}

function quickWinSubject(detail: QuickWinDetail): number | null {
  switch (detail.kind) {
    case 'restart':
      return detail.resourceTypeIds[0] ?? null;
    case 'idle-factories':
      return detail.resourceTypeId;
    case 'storage':
      return null;
    case 'spare-room':
      return detail.what === 'extractors' ? detail.resourceTypeId : detail.productTypeId;
  }
}

function planetName(colony: PlanColonyAdvice, fallback: (planetId: number) => string): string {
  return colony.name ?? fallback(colony.planetId);
}

function percent(used: number, budget: number): number {
  return Math.min(100, Math.round((used / budget) * 100));
}

function alternativeOf(primary: RebuildOption, alternative: RebuildOption): AlternativeView {
  return {
    typeId: alternative.typeId,
    name: alternative.name,
    tier: alternative.tier,
    iskPerDayDelta: alternative.iskPerDay - primary.iskPerDay,
    haulRatio:
      primary.m3PerDay > 0 && alternative.m3PerDay > 0
        ? primary.m3PerDay / alternative.m3PerDay
        : null,
  };
}

function stepView(step: BuildStep, id: string, pi: PiData, carries: string | null): ChecklistStep {
  const base = { id, minutes: step.minutes, carries: null, toLevel: null, count: null };
  switch (step.verb) {
    case 'upgrade':
      return {
        ...base,
        verb: 'upgrade',
        pin: null,
        typeId: null,
        subject: null,
        toLevel: step.toLevel,
      };
    case 'remove':
    case 'place':
      return {
        ...base,
        verb: step.verb,
        pin: step.pin,
        typeId: null,
        subject: null,
        count: step.count,
      };
    case 'set':
      return {
        ...base,
        verb: 'set',
        pin: step.pin,
        typeId: step.typeId,
        subject: piItemName(step.typeId, pi),
        count: step.count,
      };
    case 'route':
      return {
        ...base,
        verb: 'route',
        pin: null,
        typeId: null,
        subject: null,
        count: step.count,
        carries,
      };
  }
}

export function buildPlanView(
  advice: PlanAdvice,
  pi: PiData,
  fallbackName: (planetId: number) => string
): PlanView {
  const nameOf = (colony: PlanColonyAdvice) => planetName(colony, fallbackName);
  const named = (typeId: number): NamedItem => ({ typeId, name: piItemName(typeId, pi) });
  const byPlanet = new Map(advice.colonies.map((colony) => [colony.planetId, colony]));

  const quickWins: QuickWinRow[] = advice.quickWins.flatMap((win) => {
    const colony = byPlanet.get(win.planetId);
    if (!colony) return [];
    const subjectId = quickWinSubject(win.detail);
    return [
      {
        id: win.id,
        planetId: win.planetId,
        planetName: nameOf(colony),
        planetType: colony.planetType,
        action: quickWinAction(win.detail),
        detail: win.detail,
        iconTypeId: subjectId,
        subject: subjectId === null ? null : piItemName(subjectId, pi),
        gainKind: isSaving(win.detail) ? 'saves' : 'adds',
        gainPerDay: win.gainPerDay,
        minutes: win.minutes,
      },
    ];
  });

  const strips: PlanetStrip[] = advice.colonies.map((colony) => ({
    planetId: colony.planetId,
    name: nameOf(colony),
    planetType: colony.planetType,
    quickWinGainPerDay:
      colony.quickWins.some((win) => !isSaving(win.detail)) && colony.quickWinGainPerDay > 0
        ? colony.quickWinGainPerDay
        : null,
    rebuild:
      colony.rebuild.status === 'change'
        ? { kind: 'change', gainPerDay: colony.rebuild.gainPerDay }
        : colony.rebuild.status === 'keep'
          ? { kind: 'keep' }
          : { kind: 'unknown', reason: refusalOf(colony.rebuild.reason) },
  }));

  const rebuilds: RebuildCardView[] = advice.colonies.map((colony) => {
    const base = {
      planetId: colony.planetId,
      name: nameOf(colony),
      planetType: colony.planetType,
      anchor: colony.anchor,
      sells: colony.sells.map(named),
      sellsRaw: colony.sells.length > 0 && colony.sells.every((typeId) => isP0(typeId, pi)),
      hasQuickWin: colony.quickWins.length > 0,
      hasRefineWin: colony.quickWins.some(
        (win) => win.detail.kind === 'spare-room' && win.detail.what === 'factories'
      ),
    };
    const { rebuild } = colony;
    if (rebuild.status === 'change') {
      return {
        ...base,
        status: 'change',
        target: { typeId: rebuild.pick.typeId, name: rebuild.pick.name },
        fromPerDay: rebuild.todayPerDay,
        toPerDay: rebuild.pick.iskPerDay,
        gainPerDay: rebuild.gainPerDay,
        minutes: rebuild.minutes,
        keepReason: null,
        refusal: null,
        alternative: rebuild.alternative ? alternativeOf(rebuild.pick, rebuild.alternative) : null,
      };
    }
    if (rebuild.status === 'keep') {
      return {
        ...base,
        status: 'keep',
        target: rebuild.best ? { typeId: rebuild.best.typeId, name: rebuild.best.name } : null,
        fromPerDay: rebuild.todayPerDay,
        toPerDay: rebuild.todayPerDay,
        gainPerDay: null,
        minutes: null,
        keepReason: rebuild.reason,
        refusal: null,
        alternative:
          rebuild.best && rebuild.alternative
            ? alternativeOf(rebuild.best, rebuild.alternative)
            : null,
      };
    }
    const refusal = refusalOf(rebuild.reason);
    return {
      ...base,
      status: 'unknown',
      target: null,
      fromPerDay: colony.afterQuickWinsPerDay,
      toPerDay: refusal === 'link-cost' ? colony.afterQuickWinsPerDay : null,
      gainPerDay: null,
      minutes: null,
      keepReason: null,
      refusal,
      alternative: null,
    };
  });

  const checklist: ChecklistColumn[] = [];
  for (const colony of advice.colonies) {
    if (colony.rebuild.status !== 'change') continue;
    const { pick, steps, minutes, upgradeFromLevel } = colony.rebuild;
    const carries = pick.name;
    checklist.push({
      planetId: colony.planetId,
      name: nameOf(colony),
      minutes,
      steps: steps.map((step, i) =>
        stepView(step, `${colony.planetId}:${pick.typeId}:${i}:${step.verb}`, pi, carries)
      ),
      fit:
        colony.rebuildFit &&
        colony.rebuildFit.budget.cpu > 0 &&
        colony.rebuildFit.budget.powergrid > 0
          ? {
              level: colony.rebuildFit.level,
              cpuPercent: percent(colony.rebuildFit.used.cpu, colony.rebuildFit.budget.cpu),
              powerPercent: percent(
                colony.rebuildFit.used.powergrid,
                colony.rebuildFit.budget.powergrid
              ),
              upgradeFromLevel,
            }
          : null,
    });
  }

  const { totals, haul } = advice;
  const changed = rebuilds.filter((card) => card.status === 'change');
  const rebuildGain = changed.reduce((sum, card) => sum + (card.gainPerDay ?? 0), 0);

  return {
    empty: advice.colonies.length === 0 || advice.colonies.every((c) => c.todayPerDay === null),
    headline: {
      quickWinPerDay: advice.colonies.reduce((sum, c) => sum + c.quickWinGainPerDay, 0),
      quickWinMinutes: totals.quickWinMinutes,
      unpricedQuickWins: totals.unpricedQuickWins,
      rebuildGainPerDay: rebuildGain,
      rebuildCount: changed.length,
      colonyCount: advice.colonies.length,
    },
    stats: {
      todayPerDay: totals.todayPerDay,
      afterQuickWinsPerDay: totals.afterQuickWinsPerDay,
      afterRebuildPerDay: totals.afterRebuildPerDay,
      m3PerWeek: haul.m3PerTrip === null ? null : haul.m3PerTrip * haul.tripsPerWeek,
      unknownColonies: totals.unknownColonies,
    },
    strips,
    quickWins,
    rebuilds,
    hauling: {
      m3PerTrip: haul.m3PerTrip,
      todayM3PerTrip: haul.todayM3PerTrip,
      tripsPerWeek: haul.tripsPerWeek,
      restartDays: haul.restartDays,
      haulDays: haul.haulDays,
      complete: haul.complete,
      route: haul.route,
      rebuildMinutes: totals.rebuildMinutes,
      fit: {
        kind: haul.fit ? 'one-trip' : 'unknown',
        smallest: haul.fit?.smallest ?? null,
        industrialTrips: haul.fit?.industrialTrips ?? 1,
        ships: haul.fit
          ? (Object.entries(haul.fit.fits) as [ShipClass, boolean][]).map(([id, fits]) => ({
              id,
              fits,
            }))
          : [],
      },
    },
    checklist,
    slots: advice.slots,
    excluded: advice.excluded,
  };
}

export function pruneTicks(
  ticked: readonly string[],
  liveIds: ReadonlySet<string>,
  coveredPlanetIds: ReadonlySet<number>
): string[] {
  return ticked.filter((id) => liveIds.has(id) || !coveredPlanetIds.has(Number.parseInt(id, 10)));
}

export function tickableIds(view: PlanView): Set<string> {
  return new Set([
    ...view.quickWins.map((win) => win.id),
    ...view.checklist.flatMap((column) => column.steps.map((step) => step.id)),
  ]);
}

export function coveredPlanets(view: PlanView): Set<number> {
  return new Set(view.strips.map((strip) => strip.planetId));
}
