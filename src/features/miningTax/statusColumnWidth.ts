export interface StatusPillText {
  text: string;
  marked?: boolean;
}

const OVERLAP_MARK_CHARS = 2;

const TIERS: readonly (readonly [number, string])[] = [
  [6, 'sm:w-24'],
  [9, 'sm:w-28'],
  [11, 'sm:w-32'],
  [13, 'sm:w-36'],
  [17, 'sm:w-44'],
];
const WIDEST = 'sm:w-48';

export function statusColumnWidthClass(pills: readonly StatusPillText[]): string {
  const longest = Math.max(
    0,
    ...pills.map((p) => p.text.length + (p.marked ? OVERLAP_MARK_CHARS : 0))
  );
  return TIERS.find(([max]) => longest <= max)?.[1] ?? WIDEST;
}
