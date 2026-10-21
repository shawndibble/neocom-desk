/**
 * Which widget board a grid belongs to: the Overview or the Corp overview.
 *
 * The grid, the edit bar, the Gallery, the widget menu and the phone list are
 * one implementation; what differs per page is read from this context. The
 * Overview is the default, so every surface that never mounts a provider (a
 * test, the Gallery's preview, the login preview) behaves as it always has.
 *
 * - `kinds` / `categories`: what this board's Gallery offers, and its groups.
 * - `canDraw`: whether a kind may be drawn here. The Corp overview hides a
 *   kind whose capability the Character does not hold (corp UI hides rather
 *   than locks), in the grid, the Gallery and the phone list alike.
 * - `characterScope`: whether a widget's menu offers Header / All characters.
 *   Corp data belongs to one corporation, so the Corp overview has no choice.
 * - `defaultLayout`: what Reset builds.
 *
 * The few strings that name the page ("on your Overview") are looked up
 * through `boardKey`; every other customize and Gallery string is shared.
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
  canDraw: (kind: WidgetKindDef) => boolean;
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

/** The shared strings that name the page, so the Corp overview has its own wording for each. */
const PAGE_NAMING_KEYS: ReadonlySet<string> = new Set([
  'customize.barLabel',
  'customize.emptyTitle',
  'customize.emptyBody',
  'gallery.subtitle',
  'gallery.onBoard',
  'menu.remove',
  'header.breakdownCaption',
  'widgets.noWidgets',
]);

/** The i18n key for `key` (an `overview.*` key without its prefix) on `board`. */
export function boardKey(board: WidgetBoard, key: string): string {
  return board.id === 'corp' && PAGE_NAMING_KEYS.has(key) ? `corp.grid.${key}` : `overview.${key}`;
}

/** The kind's Gallery group on `board`; a kind the board does not offer falls back to its own. */
export function categoryOn(board: WidgetBoard, kind: WidgetKindDef): KindCategory {
  return kind.boards[board.id] ?? kind.category;
}
