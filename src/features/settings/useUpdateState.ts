import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { forceUpdate } from '@/app/forceUpdate';
import { useUpdateStatus, type UpdateStatus } from '@/app/updateAvailable';

const STATUS_KEYS: Record<Exclude<UpdateStatus, 'unknown'>, string> = {
  checking: 'settings.update.checking',
  current: 'settings.update.current',
  available: 'settings.update.available',
  offline: 'settings.update.offline',
};

/** The status line's wording; empty until the first check has started. */
export function useUpdateStatusLine(): { status: UpdateStatus; line: string } {
  const { t } = useTranslation();
  const status = useUpdateStatus((state) => state.status);
  return { status, line: status === 'unknown' ? '' : t(STATUS_KEYS[status]) };
}

/** Why the page stayed up after Update: the check failed, or the new build has not reached this device yet. */
export type UpdateNotice = { kind: 'error' | 'info'; text: string } | null;

/**
 * Applies a waiting build (or reloads) through the boot-screen cover. When
 * `forceUpdate` keeps the page up instead, `notice` says why.
 */
export function useApplyUpdate() {
  const { t } = useTranslation();
  const [updating, setUpdating] = useState(false);
  const [outcome, setOutcome] = useState<'failed' | 'pending' | undefined>();

  async function update() {
    setUpdating(true);
    setOutcome(undefined);
    const result = await forceUpdate();
    if (result) {
      setOutcome(result);
      setUpdating(false);
    }
  }

  const notice: UpdateNotice =
    outcome === 'failed'
      ? { kind: 'error', text: t('settings.updateFailed') }
      : outcome === 'pending'
        ? { kind: 'info', text: t('settings.updatePending') }
        : null;

  return { updating, notice, update: () => void update() };
}
