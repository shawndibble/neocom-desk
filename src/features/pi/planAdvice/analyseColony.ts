import type { PlanetPin } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { extractorState, EFFICIENT_WINDOW_FRACTION } from '@/engine/pi/colonyStatus';
import { hasYieldBaseline, pastEfficientWindow } from '@/engine/pi/extraction';
import {
  colonyAdvice,
  HOURS_PER_DAY,
  quickWin,
  spendRoomOnce,
  type QuickWin,
  type RebuildPreference,
  type SellBooks,
} from '@/engine/pi/planAdvice';
import { restartCadenceYield } from '@/engine/pi/restartCadence';
import { extractorProgramsFromPins } from '@/engine/pi/colonyPins';
import { colonyPlan } from '../colonyPlan';
import { type BuiltColonyAdvice } from '../systemPlanetModel';
import { builtColonyEarnings, saleableOutputPerHour } from '../colonyEarningsModel';
import { colonyHoursToFull } from '../colonyThroughput';
import { plannerPolicy, type PlannerColonyRow } from '../goalPlannerModel';
import { currentProductTypeIds } from '../stopTierModel';
import { rebuildFacts, safeVolume } from './rebuild';
import type { ColonyWork } from './types';

function sellsOf(colony: BuiltColonyAdvice, pi: PiData): number[] {
  const made = currentProductTypeIds(colony, pi);
  return made.length > 0 ? [...new Set(made)] : colony.extractedPerHour.map((e) => e.typeId);
}

export function analyseColony(args: {
  row: PlannerColonyRow & { advice: BuiltColonyAdvice };
  pins: readonly PlanetPin[];
  books: SellBooks;
  pi: PiData;
  nowMs: number;
  restartHours: number;
  haulHours: number;
  preference: RebuildPreference;
  ccSkill: number | null;
  /** The pilot's saved richness pick for this planet (`richnessOverride.ts`). */
  picked: readonly number[] | undefined;
  factoryWins: readonly QuickWin[];
}): ColonyWork {
  const { row, pins, books, pi, nowMs, restartHours, haulHours, preference } = args;
  const colony = row.advice;
  const planetId = row.planetId;
  const earnOpts = {
    prices: books.prices,
    revenuePrices: books.revenuePrices,
    taxRate: row.taxRate,
    salesTaxPct: books.salesTaxPct,
  };

  // Every extractor stopped is a colony earning nothing, which is a
  // measurement, not an unknown.
  const allStopped =
    colony.extractors.length > 0 &&
    colony.stoppedExtraction !== null &&
    colony.stoppedExtraction.count >= colony.extractors.length;

  const earningsOf = (a: BuiltColonyAdvice) => builtColonyEarnings(a, pi, earnOpts);
  const baseEarnings = earningsOf(colony);
  const nominalPerHour: number | null = allStopped ? 0 : baseEarnings.iskPerHour;
  // A figure that leaves a product out because the hub does not price it is not
  // today's income, it is part of it.
  const unknownReason =
    nominalPerHour === null
      ? 'no-measured-extraction'
      : !allStopped && baseEarnings.unpriced.length > 0
        ? 'unpriced'
        : null;
  const nominal = unknownReason === null ? nominalPerHour : null;

  /** What the colony would earn per hour with extra P0 an hour of each type. */
  const earnWith = (extra: ReadonlyMap<number, number>): number | null => {
    if (extra.size === 0) return nominal;
    const merged = new Map(colony.extractedPerHour.map((l) => [l.typeId, l.unitsPerHour]));
    for (const [typeId, units] of extra) merged.set(typeId, (merged.get(typeId) ?? 0) + units);
    const result = earningsOf({
      ...colony,
      extractedPerHour: [...merged].map(([typeId, unitsPerHour]) => ({ typeId, unitsPerHour })),
      stoppedExtraction: null,
    });
    return result.unpriced.length > 0 ? null : result.iskPerHour;
  };
  const gainPerDay = (after: number | null, before: number | null): number | null =>
    after === null || before === null ? null : (after - before) * HOURS_PER_DAY;
  const real = (gain: number | null): boolean => gain === null || gain > 0;

  const wins: QuickWin[] = [];

  // Restart: stopped extractors first, then decayed ones, each priced on top of the last.
  const programs = new Map(extractorProgramsFromPins(pins).map((p) => [p.pinId, p]));
  const stoppedAdd = new Map<number, number>();
  const decayedAdd = new Map<number, number>();
  const stoppedResources = new Set<number>();
  const decayedResources = new Set<number>();
  let stoppedCount = 0;
  let decayedCount = 0;
  for (const extractor of colony.extractors) {
    const program = programs.get(extractor.pinId);
    if (!program || !hasYieldBaseline(program) || extractor.productTypeId === null) continue;
    const restartRate = restartCadenceYield({ program, cadences: [restartHours] })[0]?.unitsPerHour;
    if (restartRate === undefined || !(restartRate > 0)) continue;
    const product = extractor.productTypeId;
    if (extractor.expiryMs !== null && extractorState(extractor.expiryMs, nowMs) === 'expired') {
      stoppedAdd.set(product, (stoppedAdd.get(product) ?? 0) + restartRate);
      stoppedResources.add(product);
      stoppedCount += 1;
    } else if (
      extractor.ratePerHour !== null &&
      restartRate > extractor.ratePerHour &&
      pastEfficientWindow(program, nowMs, EFFICIENT_WINDOW_FRACTION)
    ) {
      decayedAdd.set(product, (decayedAdd.get(product) ?? 0) + restartRate - extractor.ratePerHour);
      decayedResources.add(product);
      decayedCount += 1;
    }
  }
  const afterStopped = stoppedCount > 0 ? earnWith(stoppedAdd) : nominal;
  if (stoppedCount > 0) {
    const gain = gainPerDay(afterStopped, nominal);
    if (real(gain)) {
      wins.push(
        quickWin(
          planetId,
          {
            kind: 'restart',
            reason: 'stopped',
            extractors: stoppedCount,
            resourceTypeIds: [...stoppedResources].sort((a, b) => a - b),
          },
          gain
        )
      );
    }
  }
  if (decayedCount > 0) {
    const both = new Map(stoppedAdd);
    for (const [typeId, units] of decayedAdd) both.set(typeId, (both.get(typeId) ?? 0) + units);
    const gain = gainPerDay(earnWith(both), afterStopped);
    if (real(gain)) {
      wins.push(
        quickWin(
          planetId,
          {
            kind: 'restart',
            reason: 'decayed',
            extractors: decayedCount,
            resourceTypeIds: [...decayedResources].sort((a, b) => a - b),
          },
          gain
        )
      );
    }
  }

  // Storage that fills before the pilot's haul: extraction stalls for the rest of the window.
  const hoursToFull = colonyHoursToFull(colony, pins, pi, haulHours);
  const stall =
    hoursToFull !== null && hoursToFull < haulHours ? 1 - Math.max(0, hoursToFull) / haulHours : 0;
  if (hoursToFull !== null && stall > 0) {
    const gain = nominal === null ? null : nominal * stall * HOURS_PER_DAY;
    if (real(gain)) {
      wins.push(quickWin(planetId, { kind: 'storage', hoursToFull, haulHours }, gain));
    }
  }

  // Idle factories, and the heads that would feed them.
  const plan = colonyPlan(colony, pi);
  if (plan.idle) {
    const { idle } = plan;
    const pinCount = idle.lines.reduce((sum, line) => sum + line.line.surplusPins, 0);
    const freed = idle.lines.reduce(
      (sum, line) => ({
        cpu: sum.cpu + line.freed.cpu,
        powergrid: sum.powergrid + line.freed.powergrid,
      }),
      { cpu: 0, powergrid: 0 }
    );
    const shortfall = idle.lines.find((line) => line.gap !== null)?.gap ?? null;
    const feeds =
      (idle.upgrade.status === 'fits' || idle.upgrade.status === 'needs-removal') &&
      idle.upgrade.heads > 0 &&
      idle.wouldFeed > 0 &&
      shortfall !== null;
    // Only a P0 the colony already extracts can be topped up by more heads.
    const extractsIt =
      shortfall !== null && colony.extractedPerHour.some((l) => l.typeId === shortfall.typeId);
    const gain =
      feeds && extractsIt
        ? gainPerDay(earnWith(new Map([[shortfall.typeId, idle.upgrade.extraPerHour]])), nominal)
        : null;
    if (real(gain)) {
      wins.push(
        quickWin(
          planetId,
          {
            kind: 'idle-factories',
            pinCount,
            freed,
            wouldFeed: idle.wouldFeed,
            headsToAdd: feeds ? idle.upgrade.heads : null,
            resourceTypeId: shortfall?.typeId ?? null,
          },
          gain
        )
      );
    }
  }

  // Raw P0 sold as it comes out of the ground: basic factories refine it to P1.
  // Priced against what the raw earns today (never against zero), so a refinement
  // that would pay less than the ore is not offered, and a colony is never
  // steered towards selling raw.
  let basicRoom = plan.headroom.basic ?? 0;
  let refined = colony;
  let refinedEarnings = nominal;
  const rawsByRate = [...colony.extractedPerHour].sort(
    (a, b) => b.unitsPerHour - a.unitsPerHour || a.typeId - b.typeId
  );
  for (const raw of rawsByRate) {
    if (basicRoom <= 0 || refinedEarnings === null) break;
    const found = Object.entries(pi.schematics).find(
      ([, s]) =>
        s.facility === 'basic' && s.inputs.length === 1 && s.inputs[0].typeID === raw.typeId
    );
    if (!found || found[1].cycleTime <= 0) continue;
    const [productKey, schematic] = found;
    const productTypeId = Number(productKey);
    const running = new Set(refined.production.map((group) => group.schematicId));
    const refinesItAlready = Object.values(pi.schematics).some(
      (s) => running.has(s.schematicId) && s.inputs.some((i) => i.typeID === raw.typeId)
    );
    if (refinesItAlready) continue;
    const drawPerFactory = (schematic.inputs[0].quantity * 3600) / schematic.cycleTime;
    const factories = Math.min(basicRoom, Math.ceil(raw.unitsPerHour / drawPerFactory));
    if (factories <= 0) continue;
    const candidate: BuiltColonyAdvice = {
      ...refined,
      production: [...refined.production, { schematicId: schematic.schematicId, count: factories }],
    };
    const after = earningsOf(candidate);
    if (after.unpriced.length > 0 || after.iskPerHour === null) continue;
    const gain = gainPerDay(after.iskPerHour, refinedEarnings);
    if (gain === null || !(gain > 0)) continue;
    wins.push(
      quickWin(
        planetId,
        {
          kind: 'spare-room',
          what: 'factories',
          productTypeId,
          factories,
          source: 'local',
          routedFrom: [],
          needsRemoval: plan.idle !== null,
        },
        gain
      )
    );
    basicRoom -= factories;
    refined = candidate;
    refinedEarnings = after.iskPerHour;
  }

  // Spare room for more extractors. Priced only for a colony on one resource:
  // with two, no figure says which one a new ECU would pull.
  const ecus = colony.pinLoad.counts.extractorControlUnit ?? 0;
  const room = plan.headroom.extractorControlUnit ?? 0;
  const maxEcus = plannerPolicy({ maxP0Types: 1, buyTiers: [] }).maxEcusPerColony;
  const extraEcus = Math.min(room, Math.max(0, maxEcus - ecus));
  // Competes for the same room as the heads and factories: `spendRoomOnce` below picks one.
  if (extraEcus > 0 && ecus > 0 && colony.extractedPerHour.length === 1) {
    const only = colony.extractedPerHour[0];
    const perEcu = only.unitsPerHour / ecus;
    // The same flat falloff the rebuild scorer applies to every ECU after the first.
    const extra =
      perEcu * extraEcus * plannerPolicy({ maxP0Types: 1, buyTiers: [] }).extraEcuFactor;
    const gain = gainPerDay(earnWith(new Map([[only.typeId, extra]])), nominal);
    if (gain !== null && gain > 0) {
      wins.push(
        quickWin(
          planetId,
          { kind: 'spare-room', what: 'extractors', extraEcus, resourceTypeId: only.typeId },
          gain
        )
      );
    }
  }

  // A network factory win for a product this colony already refines locally is the same gain.
  const localProducts = new Set(
    wins.flatMap((win) =>
      win.detail.kind === 'spare-room' && win.detail.what === 'factories'
        ? [win.detail.productTypeId]
        : []
    )
  );
  wins.push(
    ...args.factoryWins
      .filter(
        (win) =>
          win.detail.kind !== 'spare-room' ||
          win.detail.what !== 'factories' ||
          !localProducts.has(win.detail.productTypeId)
      )
      .map((win) => ({ ...win, planetId }))
  );
  const counted = spendRoomOnce(wins);

  // Today is what the colony actually delivers: nominal less the stalled share.
  const todayPerDay = nominal === null ? null : nominal * (1 - stall) * HOURS_PER_DAY;

  // Today's m3 a day: what the colony ships out as it runs now.
  const outputUnits = saleableOutputPerHour(colony, pi);
  let todayM3PerDay: number | null = null;
  if (nominal !== null) {
    let sum = 0;
    let ok = true;
    for (const [typeId, units] of outputUnits) {
      const volume = safeVolume(typeId, pi);
      if (volume === null) ok = false;
      else sum += units * volume * HOURS_PER_DAY;
    }
    todayM3PerDay = ok ? sum * (1 - stall) : null;
  }

  const rebuild = rebuildFacts({
    row,
    colony,
    pi,
    books,
    haulHours,
    ccSkill: args.ccSkill,
    picked: args.picked,
    todayM3PerDay,
  });

  return {
    advice: colonyAdvice({
      planetId,
      planetType: row.planetType,
      todayPerDay,
      ...(unknownReason ? { unknownReason } : {}),
      quickWins: counted,
      rebuild,
      preference,
    }),
    sells: sellsOf(colony, pi),
    m3PerDay: todayM3PerDay,
    todayM3PerDay,
  };
}
