/**
 * The i18n keys each courier risk reads under (issue #944), kept out of the
 * component file so both a marker and a modal sentence name the same condition
 * from one place — and so #946 has somewhere to add its own without touching
 * rendering at all.
 *
 * Two registers per risk: a short label the row has room for, and the sentence
 * the detail modal spells out. **Neither asserts the hauler cannot complete the
 * contract.** The app cannot read a structure's access list, and probing one
 * per row is the ESI fan-out the local-snapshot approach exists to avoid, so
 * every string states a condition and its consequence rather than a verdict
 * about this player.
 */
import type { CourierRiskKind } from '@/engine/contracts/courierRisk';

/**
 * Which risks earn a marker on the row.
 *
 * `nullsec` is deliberately absent: the route cell already names each end's
 * space band (#939), which is informational text rather than a warning — which
 * is exactly what a nullsec end should be. A second marker saying the same
 * thing in a warning colour would turn a note into an alarm. It still gets its
 * sentence in the modal, where there is room to say why it is only a note.
 */
export const MARKED_RISKS: readonly CourierRiskKind[] = ['player-structure', 'no-gate-route'];

const SHORT_LABEL: Record<CourierRiskKind, string> = {
  'player-structure': 'contractSearch.risk.structureShort',
  'no-gate-route': 'contractSearch.risk.noGateRouteShort',
  nullsec: 'contractSearch.risk.nullsecShort',
};

const EXPLANATION: Record<CourierRiskKind, string> = {
  'player-structure': 'contractSearch.risk.structureDetail',
  'no-gate-route': 'contractSearch.risk.noGateRouteDetail',
  nullsec: 'contractSearch.risk.nullsecDetail',
};

export function riskShortLabelKey(kind: CourierRiskKind): string {
  return SHORT_LABEL[kind];
}

export function riskExplanationKey(kind: CourierRiskKind): string {
  return EXPLANATION[kind];
}
