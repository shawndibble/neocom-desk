/**
 * Which widget board a grid belongs to: the Overview or the Corp overview. One
 * grid, edit bar, Gallery, menu and phone list serve both; what differs is read
 * here. The Overview is the default, so a surface with no provider (a test, the
 * Gallery preview, the login preview) behaves as it always has.
 */
import { createContext, useContext } from 'react';
import {
  boardKinds,
  KIND_CATEGORIES,
  type BoardId,
  type KindCategory,
  type WidgetKindDef,
} from './kinds';
import type { MakeId, OverviewLayout } from './layout';
import { defaultLayout } from './roles';

export interface WidgetBoard {
  id: BoardId;
  kinds: readonly WidgetKindDef[];
  categories: readonly KindCategory[];
  /** The Corp overview hides a kind whose capability is not held: hide, never lock. */
  canDraw: (kind: WidgetKindDef) => boolean;
  /** Whether a widget's menu offers Header / All characters; corp data has one owner. */
  characterScope: boolean;
  defaultLayout: (makeId: MakeId) => OverviewLayout;
}

const always = () => true;

export const OVERVIEW_BOARD: WidgetBoard = {
  id: 'overview',
  kinds: boardKinds('overview'),
  categories: KIND_CATEGORIES,
  canDraw: always,
  characterScope: true,
  defaultLayout,
};

export const WidgetBoardContext = createContext<WidgetBoard>(OVERVIEW_BOARD);

export function useWidgetBoard(): WidgetBoard {
  return useContext(WidgetBoardContext);
}

/** The shared strings that name the page ("on your Overview"); each has a `corp.grid.*` twin. */
export type PageNamingKey =
  | 'customize.barLabel'
  | 'customize.emptyTitle'
  | 'customize.emptyBody'
  | 'gallery.subtitle'
  | 'gallery.onBoard'
  | 'menu.remove'
  | 'header.breakdownCaption'
  | 'widgets.noWidgets';

/** The i18n key for a page-naming string on `board`. */
export function boardKey(board: WidgetBoard, key: PageNamingKey): string {
  return `${board.id === 'corp' ? 'corp.grid' : 'overview'}.${key}`;
}

/** The kind's Gallery group on `board`; a kind the board does not offer falls back to its own. */
export function categoryOn(board: WidgetBoard, kind: WidgetKindDef): KindCategory {
  return kind.boards[board.id] ?? kind.category;
}
