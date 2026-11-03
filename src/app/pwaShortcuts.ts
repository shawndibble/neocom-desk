/** Home-screen app shortcuts (long-press the installed icon). Pure so it is testable. */
export interface PwaShortcutStrings {
  alerts: string;
  mail: string;
  wallet: string;
  orders: string;
}

export interface PwaShortcut {
  name: string;
  short_name: string;
  url: string;
  icons: { src: string; sizes: string; type: string }[];
}

const ICON = { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' };

/**
 * Android shows at most four; order is the long-press menu order. The four are
 * the pages phone users open more than desktop users do and the phone's default
 * tab bar does not already reach — see docs/context/decisions/ (pwa shortcuts
 * from mobile usage). `/alerts` redirects to Overview with the bell panel open.
 */
export function buildPwaShortcuts(strings: PwaShortcutStrings): PwaShortcut[] {
  const entries: [string, string][] = [
    [strings.alerts, '/alerts'],
    [strings.mail, '/mail'],
    [strings.wallet, '/wallet/balance'],
    [strings.orders, '/market/orders'],
  ];
  return entries.map(([name, url]) => ({ name, short_name: name, url, icons: [ICON] }));
}
