import { ownedStockBulkConfirmation } from '@/engine/industry/ownedStockBulkConfirmation';
import type { OwnedStockChange } from '@/engine/industry/ownedStockOffer';
import {
  MATERIAL_ERRANDS,
  groupMaterialsByErrand,
  type MaterialErrand,
  type MaterialErrandGroups,
} from './materialErrands';
import type { MaterialTableRow } from './subBuildPlan';

interface PendingEdit {
  before: number | undefined;
  after: number | undefined;
  by: 'row' | 'bulk';
}

export type SessionUndo =
  { kind: 'owned'; changes: OwnedStockChange[] } | { kind: 'toggle'; typeID: number };

export type SessionToastMessage =
  | { kind: 'moved'; typeID: number; to: MaterialErrand }
  | { kind: 'movedMany'; count: number }
  | { kind: 'useAllDone' | 'useNoneDone'; count: number }
  | { kind: 'useAllNothing' | 'useNoneNothing' };

export interface SessionToast {
  message: SessionToastMessage;
  undo: SessionUndo | null;
}

export interface FocusAfterToggle {
  typeID: number;
  kind: 'build' | 'buy';
  from: MaterialErrand;
}

export interface MaterialsEditSession {
  held: ReadonlyMap<number, MaterialErrand> | null;
  pending: ReadonlyMap<number, PendingEdit>;
  toggled: ReadonlySet<number>;
  focusAfterToggle: FocusAfterToggle | null;
  shown: ReadonlyMap<number, MaterialErrand> | null;
  toast: SessionToast | null;
}

export type EditSessionEvent =
  | { type: 'focusEntered'; errand: MaterialErrand; typeIDs: readonly number[] }
  | { type: 'focusLeft' }
  | { type: 'haveCommitted'; typeID: number; before: number | undefined; after: number | undefined }
  | { type: 'buildToggled'; typeID: number; building: boolean }
  | { type: 'bulkApplied'; kind: 'all' | 'none'; changes: readonly OwnedStockChange[] }
  | { type: 'undone' }
  | { type: 'toastExpired' }
  | { type: 'focusSettled' }
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

export function editSessionGroups(
  held: MaterialsEditSession['held'],
  materials: readonly MaterialTableRow[]
): MaterialErrandGroups {
  return groupMaterialsByErrand(materials, held ?? undefined);
}

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
      const confirmation = ownedStockBulkConfirmation(kind, changes);
      if (changes.length === 0) return { ...session, toast: confirmation };
      const pending = new Map(
        [...session.pending].map(([typeID, edit]) => [typeID, { ...edit, by: 'bulk' as const }])
      );
      for (const { typeID, from, to } of changes) {
        pending.set(typeID, { before: from, after: to, by: 'bulk' });
      }
      return {
        ...session,
        pending,
        toast: confirmation,
      };
    }

    case 'undone': {
      const undo = session.toast?.undo;
      if (!undo) return session.toast ? { ...session, toast: null } : session;
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

function observeRender(
  session: MaterialsEditSession,
  shown: ReadonlyMap<number, MaterialErrand>,
  ownedFor: (typeID: number) => number | undefined
): MaterialsEditSession {
  const previous = session.shown;
  if (previous === shown && session.pending.size === 0) return session;

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
