export interface ScrollMetrics {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

export interface ScrollEdges {
  before: boolean;
  after: boolean;
}

const EDGE_SLACK_PX = 1;

export function scrollEdges({ scrollLeft, clientWidth, scrollWidth }: ScrollMetrics): ScrollEdges {
  return {
    before: scrollLeft > EDGE_SLACK_PX,
    after: scrollLeft + clientWidth < scrollWidth - EDGE_SLACK_PX,
  };
}

const LINE_HEIGHT_PX = 16;

export function wheelScrollDelta(
  wheel: { deltaX: number; deltaY: number; deltaMode: number },
  edges: ScrollEdges
): number | null {
  if (Math.abs(wheel.deltaX) >= Math.abs(wheel.deltaY)) return null;
  if (wheel.deltaY < 0 ? !edges.before : !edges.after) return null;
  return wheel.deltaMode === 1 ? wheel.deltaY * LINE_HEIGHT_PX : wheel.deltaY;
}

export function pageScrollDelta(direction: 'before' | 'after', clientWidth: number): number {
  const distance = Math.round(clientWidth * 0.75);
  return direction === 'after' ? distance : -distance;
}

export function revealScrollDelta(
  bar: { start: number; end: number },
  item: { left: number; right: number }
): number {
  if (item.left < bar.start) return item.left - bar.start;
  if (item.right > bar.end) return item.right - bar.end;
  return 0;
}

export function revealInScroller(scroller: HTMLElement, item: Element): void {
  const rect = scroller.getBoundingClientRect();
  const style = getComputedStyle(scroller);
  const start = rect.left + (parseFloat(style.scrollPaddingLeft) || 0);
  const end = rect.right - (parseFloat(style.scrollPaddingRight) || 0);
  scroller.scrollLeft += revealScrollDelta({ start, end }, item.getBoundingClientRect());
}
