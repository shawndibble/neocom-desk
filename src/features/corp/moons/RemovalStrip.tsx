import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { MoonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { eveTimeLabel } from '@/engine/corpTaxBook/removalMail';
import { shortDate } from './moonsFormat';
import { OwnerStatusStrip } from './OwnerStatusStrip';

const k = (key: string) => `corpTaxBook.moons.moonOwners.page.removal.${key}`;

/**
 * The accounting side of a pending removal: when it takes effect, who started it, and Cancel
 * removal for any officer who can edit. Until the notice is out the 24 hours have not begun,
 * so there is no time yet and a button records a notice sent by hand from EVE.
 */
export function RemovalStrip({
  removal,
  onCancel,
  onNoticeSent,
}: {
  removal: NonNullable<MoonOwnerDetail['removal']>;
  onCancel?: ((() => Promise<void>) | undefined) | undefined;
  onNoticeSent?: ((() => Promise<void>) | undefined) | undefined;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const run = (action: () => Promise<void>) => async () => {
    setBusy(true);
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const date = shortDate(new Date(removal.startedAt).toISOString());
  const timed = removal.effectiveAt !== undefined;
  return (
    <div className="space-y-1">
      <OwnerStatusStrip
        title={
          timed ? t(k('title'), { time: eveTimeLabel(removal.effectiveAt!) }) : t(k('titleNoTime'))
        }
        body={t(timed ? k('body') : k('bodyNoTime'), { name: removal.startedByName, date })}
        actions={
          <>
            {!timed && onNoticeSent && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={run(onNoticeSent)}>
                {t(k('sentIt'))}
              </Button>
            )}
            {onCancel && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={run(onCancel)}>
                {t(k('cancel'))}
              </Button>
            )}
          </>
        }
      />
      {failed && (
        <p role="alert" className="text-xs text-danger">
          {t(k('failed'))}
        </p>
      )}
    </div>
  );
}
