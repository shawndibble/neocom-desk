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

export interface RigReading {
  me: number;
  te: number;
}

export type RigMatchBasis = 'rigOnly' | 'withHull';

export interface RigMatch {
  fit: RigFit;
  basis: RigMatchBasis;
}

const READING_TOLERANCE_PCT = 0.0051;

function withHullPct(hullPct: number, rigPct: number): number {
  return 100 * (1 - (1 - hullPct / 100) * (1 - rigPct / 100));
}

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

export function parseReadingPct(text: string): number | null {
  const cleaned = text.trim().replace(/^[-−]/, '').replace('%', '').replace(',', '.').trim();
  if (cleaned === '') return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 && value < 100 ? value : null;
}
