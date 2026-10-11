/**
 * Whether the Overview is in Customize mode. The mode itself (edit bar, size
 * and move controls, snapshot and undo) is the next stage's; this is the seam
 * it plugs into: the header's Customize button calls `startEditing`, and the
 * grid and edit bar read `editing`.
 *
 * `done` keeps the layout as it is; `cancel` is where the next stage restores
 * the snapshot it took in `startEditing`.
 */
import { createContext, useContext } from 'react';

export interface OverviewEdit {
  editing: boolean;
  startEditing: () => void;
  done: () => void;
  cancel: () => void;
}

export const OverviewEditContext = createContext<OverviewEdit>({
  editing: false,
  startEditing: () => undefined,
  done: () => undefined,
  cancel: () => undefined,
});

export function useOverviewEdit(): OverviewEdit {
  return useContext(OverviewEditContext);
}
