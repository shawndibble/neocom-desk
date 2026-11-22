import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { TextInput } from '@/components/ui/TextInput';
import { utcDay } from '../../../../functions/src/timeConstants';
import { lockDateFor } from '../../../../functions/src/corpTaxBookCheckpoint';

/**
 * Takes a Character out of a Miner grouping, asking the day it left (a sale reported late): the
 * grouping keeps billing it before that day. The day is today unless changed, and never before
 * the lock date.
 */
export function UnlinkConfirm({
  title,
  body,
  actionLabel,
  failedLabel,
  onClose,
  onUnlink,
}: {
  title: string;
  body: string;
  actionLabel: string;
  failedLabel: string;
  onClose: () => void;
  onUnlink: (leftOn: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [today] = useState(() => utcDay(Date.now()));
  const min = lockDateFor(today);
  const [leftOn, setLeftOn] = useState(today);
  const valid = leftOn >= min && leftOn <= today;
  return (
    <ConfirmDialog
      open
      title={title}
      body={body}
      actionLabel={actionLabel}
      cancelLabel={t('common.cancel')}
      failedLabel={failedLabel}
      onClose={onClose}
      onConfirm={async () => {
        if (!valid) throw new Error('left-on outside the allowed days');
        await onUnlink(leftOn);
      }}
    >
      <label className="mt-3 flex flex-col gap-1 text-xs">
        {t('corpTaxBook.moons.grouping.leftOn')}
        <TextInput
          size="sm"
          type="date"
          value={leftOn}
          min={min}
          max={today}
          onChange={(e) => setLeftOn(e.target.value)}
        />
        <span className="text-text-dim">
          {t('corpTaxBook.moons.grouping.leftOnHint', { date: min })}
        </span>
      </label>
    </ConfirmDialog>
  );
}
