/**
 * The Command Palette's result-provider contract (#2318). Each group under a
 * heading is one provider; adding a group (Market Items #2319, LP Stores
 * #2322, Contacts #2323) is a new provider, never a change to the palette.
 */

import type { CharacterScopeReadoutProps } from '@/features/character/CharacterScopeReadout';

export interface PaletteResult {
  /** Unique within its provider; the palette tracks the highlight by it. */
  readonly id: string;
  readonly label: string;
  readonly sublabel?: string;
  /** A short trailing note — "Active" on the current Character. */
  readonly hint?: string;
  /** Marked, never disabled: `run` still goes there so `ScopeGate` can explain. */
  readonly locked?: boolean;
  run(): void;
}

export interface PaletteProvider {
  readonly id: string;
  /** Group heading i18n key. */
  readonly labelKey: string;
  /** Fixed group order, ascending. */
  readonly order: number;
  /**
   * Which Characters the group covers, read out beside its heading (#2846).
   * Absent for a group that is not per-Character.
   */
  readonly scope?: CharacterScopeReadoutProps;
  /** Below this many (trimmed) characters the group is not searched at all. Default 0. */
  readonly minQueryLength?: number;
  /**
   * Given the trimmed query. A synchronous answer renders at once; a Promise
   * shows the group as loading until it settles, never holding up typing or
   * the other groups. `signal` aborts once the query moves on, and a late
   * answer for an old query is discarded either way. A rejection shows an
   * error row in this group alone; the other groups carry on. Providers cap
   * their own answer (`GROUP_LIMIT`).
   */
  search(
    query: string,
    signal: AbortSignal
  ): readonly PaletteResult[] | PromiseLike<readonly PaletteResult[]>;
}

/** Rows per group once the pilot is searching. */
export const GROUP_LIMIT = 6;
