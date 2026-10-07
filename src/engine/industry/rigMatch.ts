/**
 * Works out which rigs a structure carries from the Structure Role Bonus
 * lines a pilot reads off the Industry window's material and job-duration
 * tooltips. ESI never exposes a structure's fit, so the pilot types the two
 * numbers in and this finds every fit that produces them. Pure.
 *
 * On a rig-less structure that line is the hull's own bonus (checked in game).
 * Whether fitted rigs fold into the same line is not verified, so each fit is
 * tried both ways: the rig bonus alone, and the rig bonus combined with the
 * structure hull's own bonus (multiplicatively, as the plan math does). A
 * match says which reading it used.
 */
import {
  FACILITY_PRESETS,
  RIG_KIND_OPTIONS,
  RIG_SLOT_COUNT,
  rigBonusPct,
  type FacilityKind,
  type RigFit,
  type RigKind,
  type SecurityBand,
} from './types';

/** The two percents the pilot reads, as the game prints them (positive = a reduction). */
export interface RigReading {
  me: number;
  te: number;
}

export type RigMatchBasis = 'rigOnly' | 'withHull';

export interface RigMatch {
  fit: RigFit;
  basis: RigMatchBasis;
}

/** The game prints two decimals, so a typed value is right when it rounds the same. */
const READING_TOLERANCE_PCT = 0.0051;

/** Combines a hull reduction and a rig reduction the way the plan math multiplies them. */
function withHullPct(hullPct: number, rigPct: number): number {
  return 100 * (1 - (1 - hullPct / 100) * (1 - rigPct / 100));
}

/** What a fit reads as in game, both ways: rig bonus alone, and combined with the hull's. */
export function rigReadingFor(fit: RigFit, facility: FacilityKind, security: SecurityBand) {
  const preset = FACILITY_PRESETS[facility];
  const me = rigBonusPct(fit, 'me', preset.activity, security);
  const te = rigBonusPct(fit, 'te', preset.activity, security);
  return {
    rigOnly: { me, te },
    withHull: {
      me: withHullPct(preset.materialBonusPct, me),
      te: withHullPct(preset.timeBonusPct, te),
    },
  };
}

/** Every distinct fit, slot order ignored: each is a sorted pick of `RIG_SLOT_COUNT` kinds. */
function allFits(): RigFit[] {
  const fits: RigFit[] = [];
  const kinds = RIG_KIND_OPTIONS;
  for (let a = 0; a < kinds.length; a++) {
    for (let b = a; b < kinds.length; b++) {
      for (let c = b; c < kinds.length; c++) {
        const fit = [kinds[a], kinds[b], kinds[c]] as RigKind[];
        if (fit.length === RIG_SLOT_COUNT) fits.push(fit as unknown as RigFit);
      }
    }
  }
  return fits;
}

const ALL_FITS = allFits();

const close = (a: number, b: number) => Math.abs(a - b) <= READING_TOLERANCE_PCT;

export function matchRigFits(input: {
  facility: FacilityKind;
  security: SecurityBand;
  reading: RigReading;
}): RigMatch[] {
  if (!FACILITY_PRESETS[input.facility].structure) return [];
  const matches: RigMatch[] = [];
  for (const fit of ALL_FITS) {
    const read = rigReadingFor(fit, input.facility, input.security);
    for (const basis of ['rigOnly', 'withHull'] as const) {
      if (close(read[basis].me, input.reading.me) && close(read[basis].te, input.reading.te)) {
        matches.push({ fit, basis });
      }
    }
  }
  return matches;
}

/**
 * A percent as a pilot types it — "2.4", "2,4", "2.40%" — or null when it is
 * not a number. The tooltips print a reduction as "-20.0%" (or with a true
 * minus sign), so a leading sign is dropped: the reading is the size of the cut.
 */
export function parseReadingPct(text: string): number | null {
  const cleaned = text.trim().replace(/^[-−]/, '').replace('%', '').replace(',', '.').trim();
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 && value < 100 ? value : null;
}
