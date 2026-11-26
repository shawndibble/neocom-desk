export interface SpacedLabel {
  x: number;
  weight: number;
}

export function spacedLabels(labels: readonly SpacedLabel[], minGap: number): Set<number> {
  const order = labels
    .map((_, i) => i)
    .sort((a, b) => labels[b].weight - labels[a].weight || b - a);
  const last = labels.length - 1;
  if (last >= 0) {
    order.splice(order.indexOf(last), 1);
    order.unshift(last);
  }
  const kept = new Set<number>();
  for (const i of order) {
    let clear = true;
    for (const k of kept) {
      if (Math.abs(labels[k].x - labels[i].x) < minGap) {
        clear = false;
        break;
      }
    }
    if (clear) kept.add(i);
  }
  return kept;
}
