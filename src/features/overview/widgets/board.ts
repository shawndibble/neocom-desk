import { createContext, useContext } from 'react';
import {
  boardKinds,
  KIND_CATEGORIES,
  type BoardId,
  type KindCategory,
  type WidgetKindDef,
} from './kinds';
import {
  scopeCorporation,
  type MakeId,
  type OverviewLayout,
  type Widget,
  type WidgetScope,
} from './layout';
import { defaultLayout } from './roles';

export interface WidgetBoard {
  id: BoardId;
  kinds: readonly WidgetKindDef[];
  categories: readonly KindCategory[];
  canDraw: (kind: WidgetKindDef) => boolean;
  characterScope: 'always' | 'summable';
  allScopeOffered: (kind: string) => boolean;
  opensOnAll: ReadonlySet<string>;
  defaultLayout: (makeId: MakeId) => OverviewLayout;
}

export function readScope(board: WidgetBoard, widget: Pick<Widget, 'kind' | 'scope'>): WidgetScope {
  if (scopeCorporation(widget.scope) !== null) return board.id === 'corp' ? widget.scope : 'header';
  return widget.scope === 'all' && board.allScopeOffered(widget.kind) ? 'all' : 'header';
}

const always = () => true;

export const OVERVIEW_BOARD: WidgetBoard = {
  id: 'overview',
  kinds: boardKinds('overview'),
  categories: KIND_CATEGORIES,
  canDraw: always,
  characterScope: 'always',
  allScopeOffered: always,
  opensOnAll: new Set(),
  defaultLayout,
};

export const WidgetBoardContext = createContext<WidgetBoard>(OVERVIEW_BOARD);

export function useWidgetBoard(): WidgetBoard {
  return useContext(WidgetBoardContext);
}

export type PageNamingKey =
  | 'customize.barLabel'
  | 'customize.emptyTitle'
  | 'customize.emptyBody'
  | 'gallery.subtitle'
  | 'gallery.onBoard'
  | 'menu.remove'
  | 'header.breakdownCaption'
  | 'widgets.noWidgets';

export function boardKey(board: WidgetBoard, key: PageNamingKey): string {
  return `${board.id === 'corp' ? 'corp.grid' : 'overview'}.${key}`;
}

export function categoryOn(board: Pick<WidgetBoard, 'id'>, kind: WidgetKindDef): KindCategory {
  return kind.boards[board.id] ?? kind.category;
}
