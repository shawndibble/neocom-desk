/**
 * The Plan tab's "Make more from my planets" view model: `PlanAdvice` shaped
 * for drawing, and nothing more.
 *
 * Every figure here is read straight off `buildPlanAdvice` (or a sum of its
 * figures); the only arithmetic is presentation: a gain split into what the
 * quick wins add and what the rebuild adds on top, an alternative compared
 * with the pick, a meter as a percentage. Components format and translate;
 * they never compute.
 */

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

/** A commodity's name from the SDE payload: a P1+ schematic's product, else a raw resource. */
export function piItemName(typeId: number, pi: PiData): string {
  return (
    pi.schematics[String(typeId)]?.name ??
    pi.raw.find((resource) => resource.typeID === typeId)?.name ??
    `#${typeId}`
  );
}

export type QuickWinAction = 'restart' | 'storage' | 'idle' | 'extractors' | 'factories';

export interface QuickWinRow {
  /** Stable per colony and win; the tick key. */
  id: string;
  planetId: number;
  planetName: string;
  planetType: PlanetType;
  action: QuickWinAction;
  detail: QuickWinDetail;
  /** The item the row is about, for its icon. */
  iconTypeId: number | null;
  /** The raw or product the sentence names. */
  subject: string | null;
  /** Storage wins save stalled income ("saves", in no total); the others add to today. */
  gainKind: 'adds' | 'saves';
  gainPerDay: number | null;
  minutes: number;
}

export interface PlanetStrip {
  planetId: number;
  name: string;
  planetType: PlanetType;
  /** Null when the colony has no quick win that adds. */
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
  /** Against the card's own recommendation; negative earns less. */
  iskPerDayDelta: number;
  /** How many times less (>1) or more (<1) it hauls than the recommendation; null when either is zero. */
  haulRatio: number | null;
}

/**
 * Why a colony gets no rebuild advice. `link-cost`: the planet's size is not
 * on file, so a new layout's links cannot be costed, while what it earns today
 * is still real (and counted). `other`: the colony itself could not be measured.
 */
export type RebuildRefusal = 'link-cost' | 'other';

function refusalOf(reason: string): RebuildRefusal {
  return reason === 'needs-link-cost' ? 'link-cost' : 'other';
}

export interface RebuildCardView {
  planetId: number;
  name: string;
  planetType: PlanetType;
  /** The element id deep links (`#plan-hek-vi`) scroll to. */
  anchor: string;
  status: 'change' | 'keep' | 'unknown';
  /** What the colony sells today. */
  sells: NamedItem[];
  /** Everything it sells is raw P0: a keep card must not endorse that (scope decision 20261005-114103). */
  sellsRaw: boolean;
  /** A basic-factory quick win refines what it sells. */
  hasRefineWin: boolean;
  /** The recommended product; for a keep, the model's best. */
  target: NamedItem | null;
  /** Today after its quick wins, the figure the rebuild is measured against. */
  fromPerDay: number | null;
  /** What the rebuilt colony earns; for a keep, the same as `fromPerDay`. */
  toPerDay: number | null;
  gainPerDay: number | null;
  minutes: number | null;
  hasQuickWin: boolean;
  keepReason: 'already-best' | 'gain-too-small' | 'no-candidates' | 'no-haul-saving' | null;
  /** Set only when `status` is 'unknown'. */
  refusal: RebuildRefusal | null;
  alternative: AlternativeView | null;
}

export interface ChecklistStep {
  /** Stable per colony, recommendation and position; the tick key. */
  id: string;
  verb: 'upgrade' | 'remove' | 'place' | 'set' | 'route';
  /** The pin kind the step is about; null for an upgrade or a route. */
  pin: PiPinKind | null;
  typeId: number | null;
  /** The product or raw a set step names. */
  subject: string | null;
  count: number | null;
  /** An upgrade's target level. */
  toLevel: number | null;
  /** What a route step sends. */
  carries: string | null;
  minutes: number;
}

export interface ChecklistColumn {
  planetId: number;
  index: number;
  name: string;
  planetType: PlanetType;
  /** "Reactive Metals → Precious Metals". */
  change: { from: NamedItem[]; to: NamedItem };
  minutes: number;
  steps: ChecklistStep[];
  fit: {
    level: number;
    cpuPercent: number;
    powerPercent: number;
    /** Set when the pilot must upgrade first: the colony's own level. */
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
  /** There is nothing to recommend yet: no colony has a figure. */
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

/**
 * @param fallbackName Names a colony the planet-name lookup has not resolved.
 */
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
    quickWinGainPerDay: colony.quickWins.some((win) => !isSaving(win.detail))
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
      // Only the rebuild is unknown: the colony runs as it is, at today's figure.
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
      index: checklist.length + 1,
      name: nameOf(colony),
      planetType: colony.planetType,
      change: { from: colony.sells.map(named), to: { typeId: pick.typeId, name: pick.name } },
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

/**
 * Tick state that survives only while its row does. A quick win that
 * disappears (the pilot fixed it, so the colony no longer has it) takes its
 * tick with it, and one that comes back starts unticked. Only colonies the
 * view covers are pruned: ticks are per device, so another character's rows
 * are not this view's to drop.
 */
export function pruneTicks(
  ticked: readonly string[],
  liveIds: ReadonlySet<string>,
  coveredPlanetIds: ReadonlySet<number>
): string[] {
  return ticked.filter((id) => liveIds.has(id) || !coveredPlanetIds.has(Number.parseInt(id, 10)));
}

/** Every tickable id in the view: each quick win and each checklist step. */
export function tickableIds(view: PlanView): Set<string> {
  return new Set([
    ...view.quickWins.map((win) => win.id),
    ...view.checklist.flatMap((column) => column.steps.map((step) => step.id)),
  ]);
}

/** The colonies the view has a figure for: the ones whose ticks it may prune. */
export function coveredPlanets(view: PlanView): Set<number> {
  return new Set(view.strips.map((strip) => strip.planetId));
}
