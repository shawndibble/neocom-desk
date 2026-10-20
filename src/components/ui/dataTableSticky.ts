const STICKY_START_BASE = 'sticky left-0 z-10 max-md:border-r max-md:border-line';
const STICKY_START = `${STICKY_START_BASE} bg-bg`;
// For a table sitting on a Panel body, where `bg-bg` reads as a darker strip.
const STICKY_START_ON_PANEL = `${STICKY_START_BASE} bg-panel`;

export function stickyStartClass(column: { stickyStartOnPanel?: boolean }) {
  return column.stickyStartOnPanel ? STICKY_START_ON_PANEL : STICKY_START;
}
