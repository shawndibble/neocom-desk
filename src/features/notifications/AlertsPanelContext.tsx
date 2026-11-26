import { Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertsPanelContext,
  type AlertsPanelRenderProps,
  type AlertsPanelState,
} from '@/components/ui/alertsPanelContext';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam } from '@/lib/urlState';
import { ALERTS_PANEL_PATH } from './alertsPanelPath';
import { lazyNamed } from '@/app/lazyNamed';

const AlertsPanel = lazyNamed(() => import('./AlertsPanel'), 'AlertsPanel');

const PARAMS = { alerts: boolParam() };

function renderPanel(props: AlertsPanelRenderProps): ReactNode {
  return (
    <Suspense fallback={null}>
      <AlertsPanel {...props} />
    </Suspense>
  );
}

export function AlertsPanelProvider({ children }: { children: ReactNode }) {
  const [pressed, setPressed] = useState(false);
  const { pathname } = useLocation();
  const [params, setParams] = useUrlParams(PARAMS);

  const open = pressed || (params.alerts && pathname === ALERTS_PANEL_PATH);
  const setOpen = useCallback(
    (next: boolean) => {
      setPressed(next);
      if (!next) setParams({ alerts: false });
    },
    [setParams]
  );

  const value = useMemo<AlertsPanelState>(() => ({ open, setOpen, renderPanel }), [open, setOpen]);
  return <AlertsPanelContext.Provider value={value}>{children}</AlertsPanelContext.Provider>;
}
