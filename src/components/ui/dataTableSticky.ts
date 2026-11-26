const STICKY_START_BASE = 'sticky left-0 z-10 max-md:border-r max-md:border-line';
const STICKY_START = `${STICKY_START_BASE} bg-bg`;
const STICKY_START_ON_PANEL = `${STICKY_START_BASE} bg-panel`;

export function stickyStartClass(column: { stickyStartOnPanel?: boolean }) {
  return column.stickyStartOnPanel ? STICKY_START_ON_PANEL : STICKY_START;
}
