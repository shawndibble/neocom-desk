export interface ToleranceExemption {
  id: string;
  minerId: string;
  date: string;
  forgive: number;
  reason: string;
  by: number;
  at: string;
}

export function exemptionsOf(
  exemptions: readonly ToleranceExemption[] | undefined,
  minerId: string
): Map<string, number> {
  const newest = new Map<string, ToleranceExemption>();
  for (const e of exemptions ?? []) {
    if (e.minerId !== minerId) continue;
    const held = newest.get(e.date);
    if (!held || e.at > held.at || (e.at === held.at && e.id > held.id)) newest.set(e.date, e);
  }
  return new Map([...newest].map(([date, e]) => [date, e.forgive]));
}
