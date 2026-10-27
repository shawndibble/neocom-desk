/**
 * The i18n keys each courier risk reads under (issue #944), kept out of the
 * component file so both a marker and a modal sentence name the same condition
 * from one place — and so #946 has somewhere to add its own without touching
 * rendering at all.
 *
 * Two registers per risk: a short label the row has room for, and the sentence
 * the detail modal spells out. Neither asserts the hauler cannot complete the
 * contract — see `engine/contracts/courierRisk.ts` for why that bound exists.
 */
import type { CourierRiskKind } from '@/engine/contracts/courierRisk';

/**
 * Which risks earn a marker on the row.
 *
 * `nullsec` is deliberately absent: the route cell already prints each end's
 * security status beside its system name — a `0.0` or `-0.4` says nullsec as
 * plainly as the band word it replaced (#939) — and that is informational text
 * rather than a warning, which is exactly what a nullsec end should be. A second marker saying the same
 * thing in a warning colour would turn a note into an alarm. It still gets its
 * sentence in the modal, where there is room to say why it is only a note.
 */
export const MARKED_RISKS: readonly CourierRiskKind[] = [
  'player-structure',
  'no-gate-route',
  'over-rate',
  'gank-chokepoint',
];

/**
 * Which risks head the modal's list with a warning rather than a note: every
 * marked risk, plus `high-collateral`, which warns in the modal but earns no
 * row marker — decision `20260912-172628` keeps the collateral ratio off the
 * row, where a card line below `sm` has no room for it (#1720).
 */
export const WARNING_RISKS: readonly CourierRiskKind[] = [...MARKED_RISKS, 'high-collateral'];

/** Both registers for one risk, read together at every call site. */
interface RiskCopy {
  /** The row has room for this much. */
  short: string;
  /** What the detail modal spells out, where the decision is actually made. */
  detail: string;
}

export const RISK_COPY: Record<CourierRiskKind, RiskCopy> = {
  'player-structure': {
    short: 'contractSearch.risk.structureShort',
    detail: 'contractSearch.risk.structureDetail',
  },
  'no-gate-route': {
    short: 'contractSearch.risk.noGateRouteShort',
    detail: 'contractSearch.risk.noGateRouteDetail',
  },
  nullsec: {
    short: 'contractSearch.risk.nullsecShort',
    detail: 'contractSearch.risk.nullsecDetail',
  },
  'gank-chokepoint': {
    short: 'contractSearch.risk.chokepointShort',
    detail: 'contractSearch.risk.chokepointDetail',
  },
  'over-rate': {
    short: 'contractSearch.risk.overRateShort',
    detail: 'contractSearch.risk.overRateDetail',
  },
  'high-collateral': {
    short: 'contractSearch.risk.highCollateralShort',
    detail: 'contractSearch.risk.highCollateralDetail',
  },
};
