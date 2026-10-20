/**
 * Open state for the global alerts panel, and the one place that knows how to
 * draw it. Mounted once in the app shell (`Layout`): every page header's bell
 * (`components/ui/AlertsBell`) reads it from `AlertsPanelContext`, so the panel
 * is open or closed for the whole app rather than per header.
 *
 * Also driven by the URL: `/overview?alerts=1` opens it, and closing it removes
 * the param. That is what the retired `/alerts` route redirects to, so the
 * command palette, the `a` shortcut, a push-notification click and the old
 * card links all land on a page with the panel already open.
 */
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

// Deferred: the panel pulls in the feed-sync write path, and nothing needs it
// until a bell is pressed.
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

  // Open when the bell was pressed, or while the URL asks for it. The URL's
  // half is derived rather than copied into state, so a reload keeps the panel
  // open and a navigation away (which drops the param) closes it.
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
