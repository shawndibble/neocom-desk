import './instrument';
import './app/bootShellPreload';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { reactErrorHandler, withScope } from '@sentry/react';
import { App } from './app/App';
import { BootCoverHost } from './app/BootCoverHost';
import { BootUpdateGate } from './app/BootUpdateGate';
import { hideBootCover, showBootCover } from './app/bootCover';
import { installInputModality } from './app/inputModality';
import {
  characterRowCount,
  isIdbConnectionLost,
  reloadOnceForLostIdb,
} from './app/idbConnectionLost';
import { db } from './db';
import { isRouteChunkFailure } from './app/routeChunks';
import { LANDING_SHELL_BACKSTOP_MS, releaseLandingShell } from './app/landingShell';
import { installTranslateGuard } from './app/translateGuard';
import {
  canRecoverFromStaleBuild,
  defaultStaleBuildEnv,
  isRecoveringFromStaleBuild,
  recoverFromStaleBuild,
} from './app/staleBuildRecovery';
import './i18n';
import './styles/index.css';

window.addEventListener('vite:preloadError', (event) => {
  if (isRecoveringFromStaleBuild()) {
    event.preventDefault();
    return;
  }
  const env = defaultStaleBuildEnv();
  if (!canRecoverFromStaleBuild(env)) return;
  event.preventDefault();
  showBootCover();
  void recoverFromStaleBuild(env).then((reloading) => {
    if (!reloading) hideBootCover();
  });
});

installTranslateGuard();
installInputModality();

const reportError = reactErrorHandler();
const SENTRY_FLUSH_GRACE_MS = 500;
function releaseAndReport(...args: Parameters<typeof reportError>) {
  releaseLandingShell();
  if (isIdbConnectionLost(args[0])) {
    void characterRowCount(() => db.characters.count()).then((characterRows) => {
      withScope((scope) => {
        scope.setTag('idb_connection_lost', 'true');
        scope.setFingerprint(['idb-connection-lost']);
        scope.setContext('idb', { characterRows });
        reportError(...args);
      });
      setTimeout(() => reloadOnceForLostIdb(args[0]), SENTRY_FLUSH_GRACE_MS);
    });
    return;
  }
  if (!isRouteChunkFailure(args[0])) return reportError(...args);
  withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('chunk_load', 'failed');
    reportError(...args);
  });
}
setTimeout(releaseLandingShell, LANDING_SHELL_BACKSTOP_MS);

createRoot(document.getElementById('root')!, {
  onCaughtError: releaseAndReport,
  onUncaughtError: releaseAndReport,
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <BootUpdateGate>
      <App />
    </BootUpdateGate>
    <BootCoverHost />
  </StrictMode>
);
