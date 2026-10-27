import { createContext, type ReactNode } from 'react';

/** How the bell asks its host to draw the panel. */
export interface AlertsPanelRenderProps {
  /** Popover on a desktop, full-height sheet on a phone. */
  variant: 'popover' | 'sheet';
  onClose: () => void;
}

export interface AlertsPanelState {
  open: boolean;
  setOpen: (open: boolean) => void;
  /**
   * The panel itself. Injected by the app shell (`AlertsPanelProvider`) rather
   * than imported, because `components/ui` sits below `features` and the panel
   * needs the notification feed. Null outside the shell: the bell then has no
   * panel to open.
   */
  renderPanel: ((props: AlertsPanelRenderProps) => ReactNode) | null;
}

export const AlertsPanelContext = createContext<AlertsPanelState>({
  open: false,
  setOpen: () => {},
  renderPanel: null,
});
