/**
 * Device-local: the three Plan-tab controls that describe *how the pilot
 * operates*, rather than what they happen to be pricing right now — the hub
 * they buy and sell at, whether they run one planet or one per tier, and the
 * sourcing floor they start from.
 *
 * `PlanPanel` is mounted through a ternary on the tab, so it genuinely
 * unmounts: before this, switching to Colonies and back put the panel on Jita,
 * one planet, P1 again, every time. None of those three change with the
 * product, so re-answering them per visit is the page forgetting an answer
 * that was still true.
 *
 * ## One key, not three
 *
 * They are read and written together, by one panel, and a half-restored rail
 * (the pilot's hub with somebody else's layout) is worse than a fully default
 * one. So one record, rejected as a whole — `parse` returns null if any field
 * is unusable, exactly like `market/locationMode.ts` and
 * `corp/assetsExpandPreference.ts`.
 *
 * ## What is deliberately not here
 *
 * - **Colony space**, and with it the customs rate. `PlanPanel` clears a rate
 *   override whenever the band changes, because an override carried across a
 *   band silently misprices the new one. Restoring a band from disk is that
 *   same carry, one reload wide, and it would arrive with no visible edit to
 *   explain it.
 * - **Units per day** and the extraction-rate override. Both are quantities
 *   about one run of one product, not standing facts about the pilot, and the
 *   panel already refuses to invent them (`parsePositive` → null → no verdict).
 *
 * A floor the selected product does not admit is safe to store: `PlanPanel`
 * derives `effectiveFloor` from `validFloors`, so a P4 pilot's P3 floor simply
 * falls back when they open a P1 product, and returns when they open a P4 one.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { ChainLayout, SourcingFloor } from '@/engine/pi/chain';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';

export const PI_PLAN_CONTROLS_KEY = 'piPlanControls';

export interface PiPlanControls {
  hubId: TradeHub['id'];
  layout: ChainLayout;
  floor: SourcingFloor;
}

/** The panel's opening state: Jita, one planet, and the P1 floor — answerable with no colonies at all. */
export const DEFAULT_PI_PLAN_CONTROLS: PiPlanControls = {
  hubId: DEFAULT_TRADE_HUB.id,
  layout: 'single-planet',
  floor: 'P1',
};

/** The layout options, here rather than in `PlanPanel` so the control and the parser cannot disagree. */
export const CHAIN_LAYOUTS: readonly ChainLayout[] = ['single-planet', 'planet-per-tier'];

const SOURCING_FLOORS: readonly SourcingFloor[] = ['P0', 'P1', 'P2', 'P3'];

export function parsePiPlanControls(raw: unknown): PiPlanControls | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { hubId, layout, floor } = raw as Partial<PiPlanControls>;
  // A hub retired between releases is still a valid string, so `typeof` is not
  // enough — it has to still name a hub (same check as `market/hub.ts`).
  if (typeof hubId !== 'string' || !getTradeHub(hubId as TradeHub['id'])) return null;
  if (!CHAIN_LAYOUTS.includes(layout as ChainLayout)) return null;
  if (!SOURCING_FLOORS.includes(floor as SourcingFloor)) return null;
  return {
    hubId: hubId as TradeHub['id'],
    layout: layout as ChainLayout,
    floor: floor as SourcingFloor,
  };
}

export const usePlanControls = createLocalSetting<PiPlanControls>({
  key: PI_PLAN_CONTROLS_KEY,
  defaultValue: DEFAULT_PI_PLAN_CONTROLS,
  parse: parsePiPlanControls,
});
