/**
 * Which widget board a grid belongs to: the Overview or the Corp Board. One
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
import type { MakeId, OverviewLayout, Widget, WidgetScope } from './layout';
import { defaultLayout } from './roles';

export interface WidgetBoard {
  id: BoardId;
  kinds: readonly WidgetKindDef[];
  categories: readonly KindCategory[];
  /** The Corp Board hides a kind whose capability is not held: hide, never lock. */
  canDraw: (kind: WidgetKindDef) => boolean;
  /**
   * Whether a widget's menu offers Header / All characters. The Overview always does (a kind
   * that cannot sum says so); the Corp Board only for a kind that can, since a corporation's
   * data has one owner and a choice that cannot be honoured is not worth a row.
   */
  characterScope: 'always' | 'summable';
  /**
   * Whether a widget of `kind` may read All right now; when it may not, a widget saved on
   * All reads its header scope and keeps the saved choice. The Overview always may; the Corp
   * Board only while the pilot's Characters can read two or more corporations for the kind.
   */
  allScopeOffered: (kind: string) => boolean;
  /** Kinds a widget added on this board opens on All (Due soon and Structures on the Corp Board). */
  opensOnAll: ReadonlySet<string>;
  defaultLayout: (makeId: MakeId) => OverviewLayout;
}

/** The scope a widget is read with on `board`: its saved one, unless All is not offered there now. */
export function readScope(board: WidgetBoard, widget: Pick<Widget, 'kind' | 'scope'>): WidgetScope {
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
export function categoryOn(board: Pick<WidgetBoard, 'id'>, kind: WidgetKindDef): KindCategory {
  return kind.boards[board.id] ?? kind.category;
}
