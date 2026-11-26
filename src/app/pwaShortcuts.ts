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
  icons: { src: string; sizes: string; type: string; purpose?: string }[];
}

const icon = (name: string) => ({
  src: `icons/shortcut-${name}.png`,
  sizes: '192x192',
  type: 'image/png',
});

const maskableIcon = (name: string) => ({
  src: `icons/shortcut-${name}-maskable.png`,
  sizes: '192x192',
  type: 'image/png',
  purpose: 'maskable',
});

export function buildPwaShortcuts(strings: PwaShortcutStrings): PwaShortcut[] {
  const entries: [string, string, string][] = [
    [strings.alerts, '/alerts', 'alerts'],
    [strings.mail, '/mail', 'mail'],
    [strings.wallet, '/wallet/balance', 'wallet'],
    [strings.orders, '/market/orders', 'orders'],
  ];
  return entries.map(([name, url, glyph]) => ({
    name,
    short_name: name,
    url,
    icons: [icon(glyph), maskableIcon(glyph)],
  }));
}
