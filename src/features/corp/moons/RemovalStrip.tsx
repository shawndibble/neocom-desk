import { useState } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { MoonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { atDate, dateTimeAt } from './moonsFormat';
import { OwnerStatusStrip } from './OwnerStatusStrip';

const k = (key: string) => `corpTaxBook.moons.moonOwners.page.removal.${key}`;

export function RemovalStrip({
  removal,
  onCancel,
  onNoticeSent,
}: {
  removal: NonNullable<MoonOwnerDetail['removal']>;
  onCancel?: () => Promise<void>;
  onNoticeSent?: () => Promise<void>;
}) {
  const zone = useTimeZone();
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
  const date = atDate(removal.startedAt, zone);
  const timed = removal.effectiveAt !== undefined;
  return (
    <div className="space-y-1">
      <OwnerStatusStrip
        title={
          timed
            ? t(k('title'), { time: dateTimeAt(removal.effectiveAt!, zone) })
            : t(k('titleNoTime'))
        }
        body={t(timed ? k('body') : k('bodyNoTime'), { name: removal.startedByName, date })}
        actions={
          <>
            {!timed && onNoticeSent && (
              <Button
                size="sm"
                variant="ghost"
                aria-disabled={busy || undefined}
                onClick={run(onNoticeSent)}
              >
                {t(k('sentIt'))}
              </Button>
            )}
            {onCancel && (
              <Button
                size="sm"
                variant="ghost"
                aria-disabled={busy || undefined}
                onClick={run(onCancel)}
              >
                {t(k('cancel'))}
              </Button>
            )}
          </>
        }
      />
      {failed && <InlineError>{t(k('failed'))}</InlineError>}
    </div>
  );
}
