import { rankedSearch } from '@/lib/rankedSearch';
import type { NavDestination } from '@/app/navDestinations';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

type Navigate = (path: string) => void;

export interface PagesProviderOptions {
  readonly destinations: readonly NavDestination[];
  readonly navigate: Navigate;
}

export function createPagesProvider({
  destinations,
  navigate,
}: PagesProviderOptions): PaletteProvider {
  const toResult = (destination: NavDestination): PaletteResult => ({
    id: destination.path,
    label: destination.breadcrumb,
    locked: destination.locked,
    run: () => navigate(destination.path),
  });
  return {
    id: 'pages',
    labelKey: 'commandPalette.groups.pages',
    order: 0,
    search: (query) => {
      if (!query) return [];
      return rankedSearch(destinations, query, {
        primary: (destination) => destination.label,
        secondary: [
          (destination) => destination.breadcrumb,
          (destination) => destination.keywords?.join(' ') ?? '',
        ],
        limit: GROUP_LIMIT,
      }).map(toResult);
    },
  };
}

export interface CommandContext {
  readonly navigate: Navigate;
  readonly addCharacter: () => void;
}

export interface PaletteCommand {
  readonly id: string;
  readonly labelKey: string;
  readonly run: (context: CommandContext) => void;
}

export const PALETTE_COMMANDS: readonly PaletteCommand[] = [
  {
    id: 'open-settings',
    labelKey: 'commandPalette.commands.openSettings',
    run: ({ navigate }) => navigate('/settings'),
  },
  {
    id: 'keyboard-shortcuts',
    labelKey: 'commandPalette.commands.keyboardShortcuts',
    run: ({ navigate }) => navigate('/help/shortcuts'),
  },
  {
    id: 'add-character',
    labelKey: 'commandPalette.commands.addCharacter',
    run: ({ addCharacter }) => addCharacter(),
  },
  {
    id: 'notification-feed',
    labelKey: 'commandPalette.commands.notificationFeed',
    run: ({ navigate }) => navigate('/alerts'),
  },
];

export interface CommandsProviderOptions extends CommandContext {
  readonly t: (key: string) => string;
}

export function createCommandsProvider({
  t,
  ...context
}: CommandsProviderOptions): PaletteProvider {
  const commands = PALETTE_COMMANDS.map((command) => ({ command, label: t(command.labelKey) }));
  return {
    id: 'commands',
    labelKey: 'commandPalette.groups.commands',
    order: 1,
    minQueryLength: 1,
    search: (query) =>
      rankedSearch(commands, query, { primary: (entry) => entry.label, limit: GROUP_LIMIT }).map(
        ({ command, label }) => ({ id: command.id, label, run: () => command.run(context) })
      ),
  };
}

export interface CharactersProviderOptions {
  readonly characters: readonly { readonly characterId: number; readonly name: string }[];
  readonly activeCharacterId: number | null;
  readonly activeHint: string;
  readonly onSelect: (characterId: number) => void;
}

export function createCharactersProvider({
  characters,
  activeCharacterId,
  activeHint,
  onSelect,
}: CharactersProviderOptions): PaletteProvider {
  return {
    id: 'characters',
    labelKey: 'commandPalette.groups.characters',
    order: 2,
    minQueryLength: 1,
    search: (query) =>
      rankedSearch(characters, query, {
        primary: (character) => character.name,
        limit: GROUP_LIMIT,
      }).map((character) => ({
        id: String(character.characterId),
        label: character.name,
        hint: character.characterId === activeCharacterId ? activeHint : undefined,
        run: () => onSelect(character.characterId),
      })),
  };
}
