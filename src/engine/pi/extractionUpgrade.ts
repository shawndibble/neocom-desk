import type { PiInfrastructure } from '@/sde/types';
import type { PinLoad } from './types';

export const MAX_HEADS_PER_UNIT = 10;

export interface ExtractionUpgradeOptions {
  shortfallPerHour: number;
  perHeadPerHour: number | null;
  spare: PinLoad;
  newLinkCost: PinLoad | null;
  infrastructure: PiInfrastructure;
  freedByRemoval: PinLoad;
}

export interface ExtractionUpgrade {
  status: 'fits' | 'needs-removal' | 'no-room' | 'unmeasurable';
  heads: number;
  units: number;
  headsWanted: number;
  extraPerHour: number;
  load: PinLoad;
}

const EPSILON = 1e-9;

function loadOf(
  units: number,
  heads: number,
  infrastructure: PiInfrastructure,
  newLinkCost: PinLoad | null
): PinLoad {
  const unit = infrastructure.pins.extractorControlUnit;
  const head = infrastructure.extractorHead;
  const link = newLinkCost ?? { cpu: 0, powergrid: 0 };
  return {
    cpu: units * ((unit?.cpu ?? 0) + link.cpu) + heads * (head?.cpu ?? 0),
    powergrid: units * ((unit?.powergrid ?? 0) + link.powergrid) + heads * (head?.powergrid ?? 0),
  };
}

function fitHeads(
  budget: PinLoad,
  wanted: number,
  infrastructure: PiInfrastructure,
  newLinkCost: PinLoad | null
): { heads: number; units: number; load: PinLoad } {
  let best = { heads: 0, units: 0, load: { cpu: 0, powergrid: 0 } };
  for (let heads = 1; heads <= wanted; heads += 1) {
    const units = Math.ceil(heads / MAX_HEADS_PER_UNIT);
    const load = loadOf(units, heads, infrastructure, newLinkCost);
    if (load.cpu > budget.cpu + EPSILON || load.powergrid > budget.powergrid + EPSILON) break;
    best = { heads, units, load };
  }
  return best;
}

export function extractionUpgrade(opts: ExtractionUpgradeOptions): ExtractionUpgrade {
  const { shortfallPerHour, perHeadPerHour, spare, infrastructure, newLinkCost } = opts;
  const none = { heads: 0, units: 0, extraPerHour: 0, load: { cpu: 0, powergrid: 0 } };

  if (
    perHeadPerHour === null ||
    !Number.isFinite(perHeadPerHour) ||
    perHeadPerHour <= 0 ||
    !Number.isFinite(shortfallPerHour) ||
    shortfallPerHour <= 0
  ) {
    return { status: 'unmeasurable', headsWanted: 0, ...none };
  }

  const headsWanted = Math.ceil(shortfallPerHour / perHeadPerHour - EPSILON);
  const now = fitHeads(spare, headsWanted, infrastructure, newLinkCost);
  if (now.heads > 0) {
    return {
      status: 'fits',
      headsWanted,
      heads: now.heads,
      units: now.units,
      extraPerHour: now.heads * perHeadPerHour,
      load: now.load,
    };
  }

  const after = fitHeads(
    {
      cpu: spare.cpu + opts.freedByRemoval.cpu,
      powergrid: spare.powergrid + opts.freedByRemoval.powergrid,
    },
    headsWanted,
    infrastructure,
    newLinkCost
  );
  if (after.heads > 0) {
    return {
      status: 'needs-removal',
      headsWanted,
      heads: after.heads,
      units: after.units,
      extraPerHour: after.heads * perHeadPerHour,
      load: after.load,
    };
  }
  return { status: 'no-room', headsWanted, ...none };
}
