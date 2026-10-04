/**
 * The Build Plan Materials panel's edit session: what the player's edits to
 * the Have field and the Build/Buy switch — one row at a time, or "Use all" /
 * "Use none" over every row — do to the errand sections, the toast, and its
 * Undo (issue #2548).
 *
 * A pure reducer, state + event → state. It decides; `MaterialsTable` renders
 * what it decided and does the writes. Nothing here writes to a plan: Undo is
 * data (`SessionUndo`) that the table applies through its *current* props,
 * which also keeps the reducer safe to run twice under StrictMode.
 *
 * Rules it keeps:
 *
 * - A section holds its rows in place while focus is inside it, so a Have
 *   commit (which lands on blur, as the player tabs on) never unmounts the
 *   field focus is moving to. Rows move once focus leaves the section.
 * - One toast, one Undo, for row and bulk edits alike; the latest edit's
 *   toast replaces the one before it. A row edit is confirmed once the move it
 *   caused is actually shown; a build toggle and a bulk action are confirmed
 *   at once, and the moves they then cause don't toast again.
 * - Only moves the player's own edits explain earn a toast: a sub-build
 *   changing how much of an input is needed is not something Undo could put
 *   back, so a batch of moves with any unexplained one in it says nothing.
 *
 * Sections are `groupMaterialsByErrand`'s rule; this only adds which rows are
 * held.
 */

import type { OwnedStockChange } from '@/engine/industry/ownedStockOffer';
import {
  MATERIAL_ERRANDS,
  groupMaterialsByErrand,
  type MaterialErrand,
  type MaterialErrandGroups,
} from './materialErrands';
import type { MaterialTableRow } from './subBuildPlan';

/** An owned-quantity edit not yet seen to settle, and who made it. */
interface PendingEdit {
  before: number | undefined;
  after: number | undefined;
  /**
   * A row edit waits for its move to toast. A bulk edit is already confirmed
   * by its own toast, and so is a row edit a later bulk action superseded.
   */
  by: 'row' | 'bulk';
}

/** What Undo on the current toast puts back. `owned` changes are the edit as made; Undo reverses them. */
export type SessionUndo =
  { kind: 'owned'; changes: OwnedStockChange[] } | { kind: 'toggle'; typeID: number };

export type SessionToastMessage =
  | { kind: 'moved'; typeID: number; to: MaterialErrand }
  | { kind: 'movedMany'; count: number }
  | { kind: 'useAllDone' | 'useNoneDone'; count: number }
  | { kind: 'useAllNothing' | 'useNoneNothing' };

export interface SessionToast {
  message: SessionToastMessage;
  /** `null` when there is nothing to undo — a bulk action that changed nothing. */
  undo: SessionUndo | null;
}

/**
 * After a build toggle, the same row's swap control in its new section takes
 * focus, so a keyboard user isn't dropped back at the top of the page. `kind`
 * is the control's side (`build` = "Buy instead", on a built row); `from` is
 * the section it left.
 */
export interface FocusAfterToggle {
  typeID: number;
  kind: 'build' | 'buy';
  from: MaterialErrand;
}

export interface MaterialsEditSession {
  /** Rows a focused section is holding in place, by typeID; `null` when nothing is held. */
  held: ReadonlyMap<number, MaterialErrand> | null;
  pending: ReadonlyMap<number, PendingEdit>;
  /** Rows just switched between buying and building: their move is confirmed by the toggle's own toast. */
  toggled: ReadonlySet<number>;
  focusAfterToggle: FocusAfterToggle | null;
  /** Each row's section as last rendered; `null` before the first render. */
  shown: ReadonlyMap<number, MaterialErrand> | null;
  toast: SessionToast | null;
}

export type EditSessionEvent =
  /** Focus entered a section; `typeIDs` are the rows it is showing right now. */
  | { type: 'focusEntered'; errand: MaterialErrand; typeIDs: readonly number[] }
  /** Focus left the section it was in for somewhere outside it. */
  | { type: 'focusLeft' }
  /** A row's Have field committed `after` over the stored `before`. */
  | { type: 'haveCommitted'; typeID: number; before: number | undefined; after: number | undefined }
  /** A row was switched between buying and building; `building` is what it was before. */
  | { type: 'buildToggled'; typeID: number; building: boolean }
  /** "Use all" / "Use none" made these changes (`ownedStockOffer.ts`), possibly none. */
  | { type: 'bulkApplied'; kind: 'all' | 'none'; changes: readonly OwnedStockChange[] }
  /** The toast's Undo was applied. */
  | { type: 'undone' }
  | { type: 'toastExpired' }
  /** The swap control asked for by `focusAfterToggle` took focus, or never will. */
  | { type: 'focusSettled' }
  /** The table rendered each row in `shown`'s section, with the plan storing `ownedFor` for it. */
  | {
      type: 'rendered';
      shown: ReadonlyMap<number, MaterialErrand>;
      ownedFor: (typeID: number) => number | undefined;
    };

export const INITIAL_EDIT_SESSION: MaterialsEditSession = {
  held: null,
  pending: new Map(),
  toggled: new Set(),
  focusAfterToggle: null,
  shown: null,
  toast: null,
};

/** The sections as the session shows them: the grouping rule, with `held` rows kept where they were. */
export function editSessionGroups(
  held: MaterialsEditSession['held'],
  materials: readonly MaterialTableRow[]
): MaterialErrandGroups {
  return groupMaterialsByErrand(materials, held ?? undefined);
}

/** Each row's section in `groups` — what a `rendered` event reports. */
export function shownSections(groups: MaterialErrandGroups): Map<number, MaterialErrand> {
  const shown = new Map<number, MaterialErrand>();
  for (const errand of MATERIAL_ERRANDS) {
    for (const row of groups[errand]) shown.set(row.typeID, errand);
  }
  return shown;
}

export function reduceEditSession(
  session: MaterialsEditSession,
  event: EditSessionEvent
): MaterialsEditSession {
  switch (event.type) {
    case 'focusEntered':
      // Tabbing straight from one section into the next releases the first
      // before this arrives, so only a release lets a new hold in.
      if (session.held) return session;
      return { ...session, held: new Map(event.typeIDs.map((id) => [id, event.errand])) };

    case 'focusLeft':
      return session.held ? { ...session, held: null } : session;

    case 'haveCommitted': {
      const earlier = session.pending.get(event.typeID);
      const pending = new Map(session.pending);
      pending.set(event.typeID, {
        before: earlier?.by === 'row' ? earlier.before : event.before,
        after: event.after,
        by: 'row',
      });
      return { ...session, pending };
    }

    case 'buildToggled': {
      const { typeID, building } = event;
      const toggled = new Set(session.toggled).add(typeID);
      // Released from any hold: this is a move the player asked for outright.
      let held = session.held;
      if (held?.has(typeID)) {
        const next = new Map(held);
        next.delete(typeID);
        held = next;
      }
      return {
        ...session,
        held,
        toggled,
        focusAfterToggle: {
          typeID,
          kind: building ? 'build' : 'buy',
          from: session.shown?.get(typeID) ?? (building ? 'building' : 'toBuy'),
        },
        toast: {
          message: { kind: 'moved', typeID, to: building ? 'toBuy' : 'building' },
          undo: { kind: 'toggle', typeID },
        },
      };
    }

    case 'bulkApplied': {
      const { kind, changes } = event;
      if (changes.length === 0) {
        return {
          ...session,
          toast: {
            message: { kind: kind === 'all' ? 'useAllNothing' : 'useNoneNothing' },
            undo: null,
          },
        };
      }
      // The latest edit owns the toast: a row edit still waiting to move (its
      // write or its section's release yet to land) moves silently now, as
      // the bulk action's own rows do, rather than replacing this toast and
      // its Undo.
      const pending = new Map(
        [...session.pending].map(([typeID, edit]) => [typeID, { ...edit, by: 'bulk' as const }])
      );
      for (const { typeID, from, to } of changes) {
        pending.set(typeID, { before: from, after: to, by: 'bulk' });
      }
      return {
        ...session,
        pending,
        toast: {
          message: { kind: kind === 'all' ? 'useAllDone' : 'useNoneDone', count: changes.length },
          undo: { kind: 'owned', changes: [...changes] },
        },
      };
    }

    case 'undone': {
      const undo = session.toast?.undo;
      if (!undo) return session.toast ? { ...session, toast: null } : session;
      // Toggling back moves the row back; that move is this Undo's, not news.
      const toggled =
        undo.kind === 'toggle' ? new Set(session.toggled).add(undo.typeID) : session.toggled;
      return { ...session, toggled, toast: null };
    }

    case 'toastExpired':
      return session.toast ? { ...session, toast: null } : session;

    case 'focusSettled':
      return session.focusAfterToggle ? { ...session, focusAfterToggle: null } : session;

    case 'rendered':
      return observeRender(session, event.shown, event.ownedFor);
  }
}

/** Confirms the moves the player's edits caused, once they are actually shown, and settles those edits. */
function observeRender(
  session: MaterialsEditSession,
  shown: ReadonlyMap<number, MaterialErrand>,
  ownedFor: (typeID: number) => number | undefined
): MaterialsEditSession {
  const previous = session.shown;
  // The common render: nothing moved and no edit is waiting to settle.
  if (previous === shown && session.pending.size === 0) return session;

  // Both only ever lose entries here, so an unchanged size is an unchanged set.
  const toggled = new Set(session.toggled);
  let toast = session.toast;
  const moved: { typeID: number; to: MaterialErrand }[] = [];
  if (previous && previous !== shown) {
    for (const [typeID, errand] of shown) {
      const was = previous.get(typeID);
      if (was === undefined || was === errand) continue;
      if (toggled.has(typeID)) {
        toggled.delete(typeID);
        continue;
      }
      // Already confirmed by the bulk action's own toast.
      if (session.pending.get(typeID)?.by === 'bulk') continue;
      moved.push({ typeID, to: errand });
    }
  }
  if (moved.length > 0 && moved.every(({ typeID }) => session.pending.get(typeID)?.by === 'row')) {
    const first = moved[0];
    toast = {
      message:
        moved.length === 1 && first
          ? { kind: 'moved', typeID: first.typeID, to: first.to }
          : { kind: 'movedMany', count: moved.length },
      undo: {
        kind: 'owned',
        changes: moved.map(({ typeID }) => {
          const edit = session.pending.get(typeID);
          return { typeID, from: edit?.before, to: edit?.after };
        }),
      },
    };
  }

  // An edit is settled once the plan holds what it wrote and its row is no
  // longer held in place; whatever it moved has been confirmed above.
  const pending = new Map(session.pending);
  for (const [typeID, edit] of session.pending) {
    if ((ownedFor(typeID) ?? 0) === (edit.after ?? 0) && !session.held?.has(typeID)) {
      pending.delete(typeID);
    }
  }

  const sameShown = previous !== null && sameSections(previous, shown);
  const sameToggled = toggled.size === session.toggled.size;
  const samePending = pending.size === session.pending.size;
  if (sameShown && sameToggled && samePending && toast === session.toast) return session;
  return {
    ...session,
    shown: sameShown ? previous : shown,
    toggled: sameToggled ? session.toggled : toggled,
    pending: samePending ? session.pending : pending,
    toast,
  };
}

function sameSections(
  a: ReadonlyMap<number, MaterialErrand>,
  b: ReadonlyMap<number, MaterialErrand>
): boolean {
  if (a.size !== b.size) return false;
  for (const [typeID, errand] of a) if (b.get(typeID) !== errand) return false;
  return true;
}
