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
  Orders,
  Planetary,
  Ships,
  Skills,
  Social,
  Wallet,
  type IconProps,
} from '@/components/ui/icons';
import type { TourVideoId } from './promoVideoConfig';
import { DESKTOP_SIZE, type Screenshot } from './screenshots';

export interface Feature {
  icon: ComponentType<IconProps>;
  key: string;
}

export interface ShowcaseTab {
  id: string;
  shot: Screenshot;
  items: string[];
  features: Feature[];
  videos: TourVideoId[];
}

const desktop = (file: string, key: string): Screenshot => ({ file, key, size: DESKTOP_SIZE });

export const SHOWCASE_TABS: ShowcaseTab[] = [
  {
    id: 'trade',
    shot: desktop('desktop-market', 'market'),
    items: ['cheapest', 'orders', 'courier'],
    features: [
      { icon: Market, key: 'market' },
      { icon: Orders, key: 'orders' },
      { icon: Wallet, key: 'walletOrders' },
      { icon: Container, key: 'assets' },
      { icon: Contracts, key: 'contracts' },
    ],
    videos: ['evening'],
  },
  {
    id: 'build',
    shot: desktop('desktop-industry-jobs', 'industryJobs'),
    items: ['blueprint', 'jobs', 'colony'],
    features: [
      { icon: Industry, key: 'industry' },
      { icon: MoonMining, key: 'miningTax' },
      { icon: Planetary, key: 'planetary' },
    ],
    videos: ['industry'],
  },
  {
    id: 'fly',
    shot: desktop('desktop-fitting', 'fitting'),
    items: ['fit', 'route', 'pilot'],
    features: [
      { icon: Skills, key: 'skills' },
      { icon: Ships, key: 'ships' },
      { icon: Clones, key: 'clones' },
      { icon: NavTravel, key: 'travel' },
    ],
    videos: ['skills', 'undock'],
  },
  {
    id: 'corp',
    shot: desktop('desktop-corporation', 'corporation'),
    items: ['board', 'tax', 'share'],
    features: [
      { icon: Corporation, key: 'corp' },
      { icon: NavCorpMoons, key: 'corpTaxBook' },
      { icon: NavCorpSrp, key: 'srp' },
      { icon: NavCommunities, key: 'communities' },
    ],
    videos: ['corp'],
  },
  {
    id: 'social',
    shot: desktop('desktop-mail', 'mail'),
    items: ['mail', 'calendar', 'contacts'],
    features: [
      { icon: MailInbox, key: 'social' },
      { icon: Social, key: 'contacts' },
    ],
    videos: [],
  },
];
