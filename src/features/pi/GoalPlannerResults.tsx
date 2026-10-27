/**
 * The Goal Planner's answer, in the order a pilot reads it: is it worth it
 * (Headline — the **Lift** over the **Baseline**, never a gross margin), what
 * stops it (Shortfalls), what to set up (Changes), whether it fits (Colony
 * fit), what it costs to move (Hauling), and the whole demand (Flow).
 *
 * Every section is fed a computed answer; nothing here prices or plans.
 */
export { Changes } from './goalPlanResults/Changes';
export { ColonyFit } from './goalPlanResults/ColonyFit';
export { Flow } from './goalPlanResults/Flow';
export { Hauling } from './goalPlanResults/Hauling';
export { Headline, type HeadlineProps } from './goalPlanResults/Headline';
export { Shortfalls } from './goalPlanResults/Shortfalls';
export type { PlanNames } from './goalPlanResults/format';
