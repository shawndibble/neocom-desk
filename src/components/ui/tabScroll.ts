/**
 * The pointer-only half of a scrolling `Tabs` bar: which ends still have tabs
 * beyond them, how a vertical wheel maps onto the bar, and how far a chevron
 * click travels. Pure so the rules are testable without a laid-out DOM.
 */

export interface ScrollMetrics {
  scrollLeft: number;
  clientWidth: number;
  scrollWidth: number;
}

/** Which ends of the bar still have tabs hidden past them. */
export interface ScrollEdges {
  before: boolean;
  after: boolean;
}

/** Sub-pixel scroll positions round either way; a pixel of slack stops a flickering chevron. */
const EDGE_SLACK_PX = 1;

export function scrollEdges({ scrollLeft, clientWidth, scrollWidth }: ScrollMetrics): ScrollEdges {
  return {
    before: scrollLeft > EDGE_SLACK_PX,
    after: scrollLeft + clientWidth < scrollWidth - EDGE_SLACK_PX,
  };
}

/** Firefox reports a mouse wheel in lines, not pixels. */
const LINE_HEIGHT_PX = 16;

/**
 * Sideways distance for a wheel event over the bar, or `null` to leave the
 * event to the browser. A vertical wheel has no other use over a tab bar, so
 * it travels the bar, but only while the bar can still move that way: at the
 * end it hands the wheel back, so the page keeps scrolling. A gesture that is
 * already sideways (a trackpad, shift+wheel) is native and left alone.
 */
export function wheelScrollDelta(
  wheel: { deltaX: number; deltaY: number; deltaMode: number },
  edges: ScrollEdges
): number | null {
  if (Math.abs(wheel.deltaX) >= Math.abs(wheel.deltaY)) return null;
  if (wheel.deltaY < 0 ? !edges.before : !edges.after) return null;
  return wheel.deltaMode === 1 ? wheel.deltaY * LINE_HEIGHT_PX : wheel.deltaY;
}

/** A chevron click: most of a bar's width, so the tab at the edge stays visible as an anchor. */
export function pageScrollDelta(direction: 'before' | 'after', clientWidth: number): number {
  const distance = Math.round(clientWidth * 0.75);
  return direction === 'after' ? distance : -distance;
}
