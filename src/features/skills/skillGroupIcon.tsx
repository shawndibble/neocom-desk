import type { ReactNode } from 'react';
import * as Icon from '@/components/ui/icons';

const GROUP_ICONS: Readonly<Record<string, ReactNode>> = {
  'Spaceship Command': <Icon.Ships />,
  Subsystems: <Icon.Ships />,
  Gunnery: <Icon.Combat />,
  Missiles: <Icon.Combat />,
  Drones: <Icon.Combat />,
  Production: <Icon.Industry />,
  'Resource Processing': <Icon.Industry />,
  'Structure Management': <Icon.Industry />,
  Rigging: <Icon.Build />,
  Science: <Icon.Reaction />,
  Trade: <Icon.Market />,
  'Corporation Management': <Icon.Corporation />,
  'Planet Management': <Icon.Planetary />,
  Navigation: <Icon.Route />,
  Leadership: <Icon.Faction />,
  'Fleet Support': <Icon.Faction />,
};

export function skillGroupIcon(groupName: string): ReactNode {
  return GROUP_ICONS[groupName] ?? <Icon.Skills />;
}
