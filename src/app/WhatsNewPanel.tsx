import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { changelog } from './changelog';
import { selectUnseenEntries } from './whatsNew';
import { useLastSeenVersion } from './lastSeenVersion';

/**
 * Shown once per version, after an update. A device that has never recorded a
 * version (a fresh install, or an install that predates this feature) is
 * bootstrapped silently to the current version instead of being shown the
 * panel — there is no "what changed" context for a first run.
 */
export function WhatsNewPanel() {
  const { t } = useTranslation();
  const { value: lastSeenVersion, hydrated, hydrate, setValue } = useLastSeenVersion();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && lastSeenVersion === null) void setValue(__APP_VERSION__);
  }, [hydrated, lastSeenVersion, setValue]);

  const unseen =
    hydrated && lastSeenVersion !== null
      ? selectUnseenEntries(changelog, lastSeenVersion, __APP_VERSION__)
      : [];
  const open = !dismissed && unseen.length > 0;

  if (!open) return null;

  const handleDismiss = () => {
    setDismissed(true);
    void setValue(__APP_VERSION__);
  };

  return (
    <Modal
      open={open}
      onClose={handleDismiss}
      title={t('whatsNew.title', { version: __APP_VERSION__ })}
    >
      <div className="space-y-4">
        {unseen.map((entry) => (
          <section key={entry.version}>
            <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {entry.version} — {entry.date}
            </h3>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
              {entry.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="primary" onClick={handleDismiss}>
          {t('whatsNew.dismiss')}
        </Button>
      </div>
    </Modal>
  );
}
