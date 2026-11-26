import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Fields } from '@/components/ui/Fields';
import { TextInput } from '@/components/ui/TextInput';
import { utcDay } from '@/engine/localDay';
import { lockDateFor } from '../../../../functions/src/corpTaxBookCheckpoint';

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
      <div className="mt-3">
        <Fields>
          <Field
            label={t('corpTaxBook.moons.grouping.leftOn')}
            htmlFor="unlink-left-on"
            note={t('corpTaxBook.moons.grouping.leftOnHint', { date: min })}
          >
            <TextInput
              id="unlink-left-on"
              size="sm"
              type="date"
              value={leftOn}
              min={min}
              max={today}
              onChange={(e) => setLeftOn(e.target.value)}
            />
          </Field>
        </Fields>
      </div>
    </ConfirmDialog>
  );
}
