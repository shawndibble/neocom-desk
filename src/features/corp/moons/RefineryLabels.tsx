import { useId } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { IconButton, Panel, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useInPlaceEdit } from '@/lib/useInPlaceEdit';
import { callableErrorText } from './feederErrorText';

/** The server's `MAX_REFINERY_LABEL`: it refuses anything longer. */
export const REFINERY_LABEL_MAX = 100;

const k = (key: string) => `corpTaxBook.moons.refineryLabels.${key}`;

export interface RefineryLabelEdit {
  /** The officer label set now, from either side; empty when there is none. */
  current: (structureId: number) => string;
  /** Saves it; null clears it. Rejects with the callable's refusal. */
  onSave: (structureId: number, label: string | null) => Promise<void>;
}

/** One refinery: its resolved label, edited in place behind the faint pencil (§6c). */
function RefineryRow({
  structureId,
  name,
  edit,
}: {
  structureId: number;
  name: string;
  edit?: RefineryLabelEdit;
}) {
  const { t } = useTranslation();
  const hintId = useId();
  const { editing, start, triggerRef, failure, inputProps } = useInPlaceEdit({
    initial: () => edit?.current(structureId) ?? '',
    onCommit: (draft) => {
      const next = draft.trim();
      return edit?.onSave(structureId, next === '' ? null : next);
    },
  });
  const error = failure === undefined ? null : callableErrorText(t, failure, k('failed'));

  return (
    <li className="space-y-1 px-3 py-2">
      {editing ? (
        <TextInput
          size="sm"
          {...inputProps}
          maxLength={REFINERY_LABEL_MAX}
          placeholder={name}
          aria-label={t(k('field'))}
          aria-describedby={hintId}
          className="w-full max-w-md"
        />
      ) : (
        <span className="flex min-w-0 items-center gap-1 text-sm">
          <span className="[overflow-wrap:anywhere]">{name}</span>
          {edit && (
            <IconButton
              ref={triggerRef}
              size="row"
              variant="plain"
              icon={<Icon.Rename size={Icon.ICON_SIZE.sm} className="text-text-faint" />}
              label={t(k('edit'), { name })}
              tooltip={t(k('editTooltip'))}
              onClick={start}
            />
          )}
        </span>
      )}
      {editing && (
        <p id={hintId} className="text-xs text-text-dim">
          {t(k('hint'))}
        </p>
      )}
      {error && <InlineError>{error}</InlineError>}
    </li>
  );
}

/** A moon owner's refineries, one row each, by the label chain; `edit` adds the pencil. */
export function RefineryLabels({
  structureIds,
  name,
  edit,
}: {
  structureIds: readonly number[];
  /** The resolved label: the officer label, else the structure, system or owner fallback. */
  name: (structureId: number) => string;
  edit?: RefineryLabelEdit;
}) {
  const { t } = useTranslation();
  if (structureIds.length === 0) return null;
  const sorted = [...structureIds].sort((a, b) => name(a).localeCompare(name(b)) || a - b);
  return (
    <Panel title={t(k('title'))} padded={false}>
      <ul className="divide-y divide-line">
        {sorted.map((id) => (
          <RefineryRow key={id} structureId={id} name={name(id)} {...(edit ? { edit } : {})} />
        ))}
      </ul>
    </Panel>
  );
}
