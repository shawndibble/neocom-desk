import type { ComponentType } from 'react';
import * as Icon from '@/components/ui/icons';
import type { NavPagePath } from './navDestinations';

/**
 * One glyph per nav page, beside its label in the rail and on its More-sheet
 * tile. Kept out of `navDestinations.ts`, which stays plain data; typed over
 * every page path, so a page added without an icon fails typecheck.
 */
export const NAV_ICONS: Record<NavPagePath, ComponentType<Icon.IconProps>> = {
  '/overview': Icon.NavOverview,
  '/alerts': Icon.NavAlerts,
  '/corp': Icon.NavCorp,
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
  '/travel': Icon.NavTravel,
  '/pilot-lookup': Icon.NavPilotLookup,
  '/settings': Icon.NavSettings,
  '/help': Icon.NavHelp,
  '/characters': Icon.NavCharacters,
};

/** The same map, read by any route path: a path that is not a nav page has no icon. */
export const NAV_ICON_BY_PATH: Readonly<Partial<Record<string, ComponentType<Icon.IconProps>>>> =
  NAV_ICONS;
