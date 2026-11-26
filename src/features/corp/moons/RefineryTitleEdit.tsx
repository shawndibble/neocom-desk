import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, TextInput } from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import * as Icon from '@/components/ui/icons';
import { useInPlaceEdit } from '@/lib/useInPlaceEdit';
import { callableErrorText } from './feederErrorText';
import { REFINERY_LABEL_MAX } from './RefineryLabels';

const kl = (key: string) => `corpTaxBook.moons.refineryLabels.${key}`;

export function RefineryTitleEdit({
  name,
  current,
  onSave,
}: {
  name: string;
  current: string;
  onSave: (label: string | null) => Promise<void>;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const { editing, start, triggerRef, failure, inputProps } = useInPlaceEdit({
    initial: () => current,
    onCommit: (draft) => onSave(draft.trim() === '' ? null : draft.trim()),
  });
  const error = failure === undefined ? null : callableErrorText(t, failure, kl('failed'));
  if (editing) {
    return (
      <span className="block space-y-1">
        <TextInput
          size="sm"
          {...inputProps}
          maxLength={REFINERY_LABEL_MAX}
          placeholder={name}
          aria-label={t(kl('field'))}
          aria-describedby={hintId}
          className="w-full max-w-md"
        />
        <span id={hintId} className="block text-xs text-text-dim">
          {t(kl('hint'))}
        </span>
        {error && <InlineError>{error}</InlineError>}
      </span>
    );
  }
  return (
    <IconButton
      ref={triggerRef}
      size="row"
      variant="plain"
      icon={<Icon.Rename size={Icon.ICON_SIZE.sm} className="text-text-faint" />}
      label={t('corpTaxBook.moons.refinery.editLabel', { name })}
      tooltip={t(kl('editTooltip'))}
      onClick={start}
    />
  );
}
