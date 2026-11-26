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
  NavCommunities,
  NavCorpMoons,
  NavCorpSrp,
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
import { DESKTOP_SIZE, type Screenshot } from './screenshots';

export interface Feature {
  icon: ComponentType<IconProps>;
  key: string;
}

export interface ShowcaseTab {
  id: string;
  shot: Screenshot;
  bullets: string[];
  features: Feature[];
}

const desktop = (file: string, key: string): Screenshot => ({ file, key, size: DESKTOP_SIZE });

export const SHOWCASE_TABS: ShowcaseTab[] = [
  {
    id: 'market',
    shot: desktop('desktop-wallet-journal', 'walletJournal'),
    bullets: ['orders', 'market', 'wallet', 'assets'],
    features: [
      { icon: Market, key: 'market' },
      { icon: Orders, key: 'orders' },
      { icon: Wallet, key: 'walletOrders' },
      { icon: Container, key: 'assets' },
    ],
  },
  {
    id: 'industry',
    shot: desktop('desktop-industry-jobs', 'industryJobs'),
    bullets: ['costs', 'verdict', 'setup', 'jobs'],
    features: [{ icon: Industry, key: 'industry' }],
  },
  {
    id: 'skills',
    shot: desktop('desktop-skills', 'skills'),
    bullets: ['queue', 'plans', 'tree', 'clones'],
    features: [
      { icon: Skills, key: 'skills' },
      { icon: Ships, key: 'ships' },
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
    bullets: ['board', 'pages', 'moons', 'access'],
    features: [
      { icon: Corporation, key: 'corp' },
      { icon: NavCorpMoons, key: 'corpTaxBook' },
      { icon: NavCorpSrp, key: 'srp' },
    ],
  },
  {
    id: 'comms',
    shot: desktop('desktop-mail', 'mail'),
    bullets: ['mail', 'calendar', 'contracts', 'contacts'],
    features: [
      { icon: MailInbox, key: 'social' },
      { icon: Contracts, key: 'contracts' },
      { icon: Social, key: 'contacts' },
      { icon: NavCommunities, key: 'communities' },
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
