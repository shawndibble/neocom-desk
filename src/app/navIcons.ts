import type { ComponentType } from 'react';
import * as Icon from '@/components/ui/icons';
import type { NavPagePath } from './navDestinations';

export const NAV_ICONS: Record<NavPagePath, ComponentType<Icon.IconProps>> = {
  '/overview': Icon.NavOverview,
  '/alerts': Icon.NavAlerts,
  '/corp': Icon.NavCorp,
  '/corp/members': Icon.NavCorpMembers,
  '/corp/wallet': Icon.NavCorpWallet,
  '/corp/assets': Icon.NavCorpAssets,
  '/corp/structures': Icon.NavCorpStructures,
  '/corp/moons': Icon.NavCorpMoons,
  '/corp/srp': Icon.NavCorpSrp,
  '/corp/vetting': Icon.NavCorpVetting,
  '/skills': Icon.NavSkills,
  '/industry': Icon.NavIndustry,
  '/ships': Icon.NavShips,
  '/mining': Icon.NavMining,
  '/planetary-industry': Icon.NavPlanetaryIndustry,
  '/market': Icon.NavMarket,
  '/wallet': Icon.NavWallet,
  '/assets': Icon.NavAssets,
  '/contracts': Icon.NavContracts,
  '/mail': Icon.NavMail,
  '/calendar': Icon.NavCalendar,
  '/contacts': Icon.NavContacts,
  '/communities': Icon.NavCommunities,
  '/travel': Icon.NavTravel,
  '/settings': Icon.NavSettings,
  '/help': Icon.NavHelp,
  '/characters': Icon.NavCharacters,
};

export const NAV_ICON_BY_PATH: Readonly<Partial<Record<string, ComponentType<Icon.IconProps>>>> =
  NAV_ICONS;
