interface FitPillsInput {
  pills: readonly number[];
  more: number;
  trailing: number;
  available: number;
  gap: number;
}

export function fitPills({ pills, more, trailing, available, gap }: FitPillsInput): number {
  const n = pills.length;
  if (n === 0 || available <= 0) return n;
  const widthOf = (items: readonly number[]) =>
    items.reduce((sum, width) => sum + width, 0) + gap * Math.max(items.length - 1, 0);
  if (widthOf([...pills, trailing]) <= available) return n;
  for (let k = n - 1; k > 1; k -= 1) {
    if (widthOf([...pills.slice(0, k), more, trailing]) <= available) return k;
  }
  return 1;
}
