/**
 * Tick times for the Survey charts' shared time axis: on the clock (whole
 * hours, half hours, five minutes), with a step chosen so no more than about
 * six ticks fit the span.
 */
const STEPS_MIN = [5, 10, 15, 30, 60, 120, 240];

export function timeTicks(from: number, to: number): number[] {
  const steps = STEPS_MIN.map((m) => m * 60_000);
  const step = steps.find((s) => (to - from) / s <= 6) ?? steps[steps.length - 1];
  const ticks: number[] = [];
  for (let t = Math.ceil(from / step) * step; t <= to; t += step) ticks.push(t);
  return ticks;
}
