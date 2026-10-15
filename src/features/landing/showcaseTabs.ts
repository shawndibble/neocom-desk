import type { ComponentType } from 'react';
import {
  Clones,
  Container,
  Contracts,
  Corporation,
  Industry,
  MailInbox,
  Market,
  MoonMining,
  NavTravel,
  Notifications,
  Orders,
  Planetary,
  ScheduledPush,
  Ships,
  Skills,
  Social,
  Wallet,
  type IconProps,
} from '@/components/ui/icons';
import { DESKTOP_SIZE, PHONE_SIZE, type Screenshot } from './screenshots';

/** One catalog entry: its glyph and the `login.features.<key>` name. */
export interface Feature {
  icon: ComponentType<IconProps>;
  key: string;
}

/**
 * One tab of the showcase: an area of the app, the screenshot that shows it,
 * what it does (`login.showcase.<id>.<bullet>`), and the catalog entries it
 * covers. Together the tabs name every `login.features.*` row exactly once.
 * `phone` is the capture of the same area on a phone, laid over the desktop
 * frame's corner where one exists.
 */
export interface ShowcaseTab {
  id: string;
  shot: Screenshot;
  phone?: Screenshot;
  bullets: string[];
  features: Feature[];
}

const desktop = (file: string, key: string): Screenshot => ({ file, key, size: DESKTOP_SIZE });
const phone = (file: string, key: string): Screenshot => ({ file, key, size: PHONE_SIZE });

export const SHOWCASE_TABS: ShowcaseTab[] = [
  {
    id: 'industry',
    shot: desktop('desktop-build-plan', 'buildPlan'),
    bullets: ['costs', 'verdict', 'setup', 'jobs'],
    features: [{ icon: Industry, key: 'industry' }],
  },
  {
    id: 'market',
    shot: desktop('desktop-order-detail', 'orderDetail'),
    phone: phone('phone-market-jumps', 'phoneMarketJumps'),
    bullets: ['orders', 'market', 'wallet', 'assets'],
    features: [
      { icon: Market, key: 'market' },
      { icon: Orders, key: 'orders' },
      { icon: Wallet, key: 'walletOrders' },
      { icon: Container, key: 'assets' },
    ],
  },
  {
    id: 'ships',
    shot: desktop('desktop-ship-tree', 'shipTree'),
    phone: phone('phone-route-safety', 'phoneRouteSafety'),
    bullets: ['tree', 'fitting', 'skills', 'travel'],
    features: [
      { icon: Ships, key: 'ships' },
      { icon: Skills, key: 'skills' },
      { icon: Clones, key: 'clones' },
      { icon: NavTravel, key: 'travel' },
    ],
  },
  {
    id: 'planetary',
    shot: desktop('desktop-planetary-colonies', 'planetaryColonies'),
    bullets: ['colonies', 'logIn', 'plan', 'mining'],
    features: [
      { icon: Planetary, key: 'planetary' },
      { icon: MoonMining, key: 'miningTax' },
    ],
  },
  {
    id: 'corp',
    shot: desktop('desktop-corporation', 'corporation'),
    bullets: ['board', 'deadlines', 'tables', 'access'],
    features: [{ icon: Corporation, key: 'corp' }],
  },
  {
    id: 'comms',
    shot: desktop('desktop-mail', 'mail'),
    bullets: ['mail', 'calendar', 'contracts', 'contacts'],
    features: [
      { icon: MailInbox, key: 'social' },
      { icon: Contracts, key: 'contracts' },
      { icon: Social, key: 'contacts' },
    ],
  },
  {
    id: 'alerts',
    shot: desktop('desktop-overview-alerts', 'overviewAlerts'),
    bullets: ['bell', 'record', 'choose', 'closed'],
    features: [
      { icon: Notifications, key: 'alerts' },
      { icon: ScheduledPush, key: 'notifications' },
    ],
  },
];
