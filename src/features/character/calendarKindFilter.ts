import { createLocalSetting } from '@/lib/useLocalSetting';
import { CHARACTER_BOARD_ITEM_KINDS, type CharacterBoardItemKind } from '@/engine/character/board';

export const CALENDAR_HIDDEN_KINDS_KEY = 'calendarHiddenKinds';

export const DEFAULT_HIDDEN_KINDS: readonly CharacterBoardItemKind[] = [];

const KNOWN_KINDS = new Set<string>(CHARACTER_BOARD_ITEM_KINDS);

function isKind(raw: unknown): raw is CharacterBoardItemKind {
  return typeof raw === 'string' && KNOWN_KINDS.has(raw);
}

export const useCalendarHiddenKinds = createLocalSetting<readonly CharacterBoardItemKind[]>({
  key: CALENDAR_HIDDEN_KINDS_KEY,
  defaultValue: DEFAULT_HIDDEN_KINDS,
  parse: (raw) => {
    if (!Array.isArray(raw)) return null;
    return [...new Set(raw.filter(isKind))];
  },
});

export function shownKinds(hidden: readonly CharacterBoardItemKind[]): Set<CharacterBoardItemKind> {
  const hiddenSet = new Set(hidden);
  return new Set(CHARACTER_BOARD_ITEM_KINDS.filter((kind) => !hiddenSet.has(kind)));
}

export const OPT_IN_KINDS: ReadonlySet<CharacterBoardItemKind> = new Set([
  'structureTimer',
  'structureFuel',
  'corpJob',
  'moonChunk',
  'sharedMoonPop',
  'skyhookRaid',
  'mercenaryDen',
]);

export function kindHasFilterRow(
  kind: CharacterBoardItemKind,
  state: {
    hidden: ReadonlySet<CharacterBoardItemKind>;
    readable: ReadonlySet<CharacterBoardItemKind>;
    reauth: ReadonlySet<CharacterBoardItemKind>;
  }
): boolean {
  if (state.hidden.has(kind) || state.reauth.has(kind)) return true;
  return state.readable.has(kind) || !OPT_IN_KINDS.has(kind);
}

export function toggleHiddenKind(
  hidden: readonly CharacterBoardItemKind[],
  kind: CharacterBoardItemKind
): CharacterBoardItemKind[] {
  return hidden.includes(kind) ? hidden.filter((existing) => existing !== kind) : [...hidden, kind];
}
