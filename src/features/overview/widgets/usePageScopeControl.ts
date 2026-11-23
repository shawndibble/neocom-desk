/**
 * The props that make `CharacterFilterControl` the page's scope control on the Overview and the
 * Corp Board: it reads the scope the drawn widgets share (or Mixed) and writes a choice onto
 * every widget that can take it (`setAllScopes`, one Undo). Scope itself stays per widget; this
 * is its bulk edit, so the picker is the same one every other page has.
 *
 * `null` when there is nothing to choose between: one Character on the Overview, fewer than two
 * corporations on the Corp Board.
 */
import type {
  CharacterFilterControlProps,
  PickerChoice,
} from '@/features/character/CharacterFilterControl';
import { useCharacters } from '@/features/character/useCharacters';
import { useAccountCorporations } from '@/features/corp/accountCorporations';
import { useIsPhone } from '@/lib/useIsPhone';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { readScope, useWidgetBoard } from './board';
import { kindSumsAcrossCharacters } from './data/models';
import { useOverviewEdit } from './editContext';
import { type WidgetScope } from './layout';
import { pageScope } from './pageScope';
import { visibleWidgets } from './visibility';

type PageScopeProps = Pick<
  CharacterFilterControlProps<PickerChoice>,
  'activeCharacterId' | 'value' | 'onChange' | 'mixed' | 'corporations' | 'characterCount'
>;

/** A widget's scope as the picker names it: the header Character is `'current'`. */
const toChoice = (scope: WidgetScope): PickerChoice => (scope === 'header' ? 'current' : scope);
const toScope = (choice: PickerChoice): WidgetScope =>
  choice === 'current' ? 'header' : (choice as WidgetScope);

export function usePageScopeControl(): PageScopeProps | null {
  const board = useWidgetBoard();
  const edit = useOverviewEdit();
  const isPhone = useIsPhone();
  const characters = useCharacters();
  const corporations = useAccountCorporations();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);

  const onCorpBoard = board.id === 'corp';
  if (onCorpBoard ? corporations.length < 2 : characters.length < 2) return null;

  const shown = visibleWidgets(edit.layout.widgets, isPhone, board.canDraw);
  const value = pageScope(
    shown,
    (widget) => readScope(board, widget),
    (widget) => kindSumsAcrossCharacters(widget.kind, widget)
  );
  return {
    activeCharacterId,
    value: value === 'mixed' ? 'current' : toChoice(value),
    mixed: value === 'mixed',
    characterCount: characters.length,
    corporations: onCorpBoard
      ? corporations.map((c) => ({ id: c.id, name: c.label.name }))
      : undefined,
    onChange: (next) => edit.setAllScopes(toScope(next)),
  };
}
