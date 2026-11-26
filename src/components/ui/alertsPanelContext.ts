import { createContext, type ReactNode } from 'react';

export interface AlertsPanelRenderProps {
  variant: 'popover' | 'sheet';
  onClose: () => void;
}

export interface AlertsPanelState {
  open: boolean;
  setOpen: (open: boolean) => void;
  renderPanel: ((props: AlertsPanelRenderProps) => ReactNode) | null;
}

export const AlertsPanelContext = createContext<AlertsPanelState>({
  open: false,
  setOpen: () => {},
  renderPanel: null,
});
