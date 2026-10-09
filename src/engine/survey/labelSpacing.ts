/**
 * Which chart labels to draw when scans bunch up. Every scan keeps its dot,
 * but a label needs room, so in a cluster only some can be shown. Pure: the
 * chart hands in each label's pixel position and a weight (bigger = more
 * worth showing) and gets back the indices to draw.
 */
export interface SpacedLabel {
  /** Horizontal pixel position of the label's centre. */
  x: number;
  /** Higher wins a collision. */
  weight: number;
}

/**
 * The last label always wins (it is the latest scan); then the heaviest, each
 * kept only if it is at least `minGap` px from every label already kept.
 */
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
