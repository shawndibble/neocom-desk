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

/**
 * Applies a waiting build (or reloads) through the boot-screen cover. A failed
 * check keeps the page up and sets `failed`.
 */
export function useApplyUpdate() {
  const [updating, setUpdating] = useState(false);
  const [failed, setFailed] = useState(false);

  async function update() {
    setUpdating(true);
    setFailed(false);
    if ((await forceUpdate()) === 'failed') {
      setFailed(true);
      setUpdating(false);
    }
  }

  return { updating, failed, update: () => void update() };
}
