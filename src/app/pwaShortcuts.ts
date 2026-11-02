/** Home-screen app shortcuts (long-press the installed icon). Pure so it is testable. */
export interface PwaShortcutStrings {
  route: string;
  pilot: string;
  alerts: string;
  orders: string;
}

export interface PwaShortcut {
  name: string;
  short_name: string;
  url: string;
  icons: { src: string; sizes: string; type: string }[];
}

const ICON = { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' };

/** Android shows at most four; order is the long-press menu order. */
export function buildPwaShortcuts(strings: PwaShortcutStrings): PwaShortcut[] {
  const entries: [string, string][] = [
    [strings.route, '/travel'],
    [strings.pilot, '/travel/pilot'],
    [strings.alerts, '/alerts'],
    [strings.orders, '/market/orders'],
  ];
  return entries.map(([name, url]) => ({ name, short_name: name, url, icons: [ICON] }));
}
