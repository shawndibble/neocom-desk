/**
 * The three groups the Command Palette ships with (#2318): Pages, Commands
 * and Characters, in that order. Pure factories — the live reads they need
 * (nav locks, the Character list, `navigate`) are passed in by
 * `CommandPalette`, so each is testable without a router or Dexie.
 */
import { rankedSearch } from '@/lib/rankedSearch';
import type { NavDestination } from '@/app/navDestinations';
import { GROUP_LIMIT, type PaletteProvider, type PaletteResult } from './types';

type Navigate = (path: string) => void;

export interface PagesProviderOptions {
  /** `listNavDestinations(...)`: already filtered for corp visibility and marked for locks. */
  readonly destinations: readonly NavDestination[];
  readonly navigate: Navigate;
}

/**
 * Every page and tab from the shared nav descriptor (#2317). A tab matches on
 * its own name ("opp" → "Industry › Opportunities") and, below that, on its
 * breadcrumb, so typing a page's name also offers its tabs. An empty query
 * lists the pages alone, uncapped: the palette doubles as a quick navigator.
 */
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
      if (!query) {
        return destinations.filter((destination) => destination.kind === 'page').map(toResult);
      }
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
  /** The add-a-Character login (`beginAddCharacterLogin`). */
  readonly addCharacter: () => void;
}

export interface PaletteCommand {
  readonly id: string;
  /** Literal keys, so the locale split's source scan finds them. */
  readonly labelKey: string;
  readonly run: (context: CommandContext) => void;
}

/** The starter commands. Adding one is a row here. */
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
    // The Notification Feed is the Alerts page's list.
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
  /** Shown beside the Character already active. */
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
