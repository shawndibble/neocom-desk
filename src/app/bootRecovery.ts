import { getServiceWorkerRegistration } from '@/lib/serviceWorker';

const RECOVERY_STEP_TIMEOUT_MS = 2000;

export interface BootRecoveryEnv {
  getRegistration: () => Promise<ServiceWorkerRegistration | undefined>;
  reload: () => void;
  wait: (ms: number) => Promise<void>;
}

export function defaultBootRecoveryEnv(): BootRecoveryEnv {
  return {
    getRegistration: getServiceWorkerRegistration,
    reload: () => window.location.reload(),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

export async function recoverFromStalledBoot(
  env: BootRecoveryEnv = defaultBootRecoveryEnv()
): Promise<void> {
  try {
    const registration = await Promise.race([
      env.getRegistration(),
      env.wait(RECOVERY_STEP_TIMEOUT_MS).then(() => undefined),
    ]);
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      await env.wait(RECOVERY_STEP_TIMEOUT_MS);
    }
  } catch {}
  env.reload();
}
