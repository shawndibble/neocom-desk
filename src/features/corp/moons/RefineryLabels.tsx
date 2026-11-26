import { useId } from 'react';
import { Link } from 'react-router-dom';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import { IconButton, Panel, TextInput, entityLinkClassName } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { cx } from '@/lib/cx';
import * as Icon from '@/components/ui/icons';
import { useInPlaceEdit } from '@/lib/useInPlaceEdit';
import { callableErrorText } from './feederErrorText';

export const REFINERY_LABEL_MAX = 100;

const k = (key: string) => `corpTaxBook.moons.refineryLabels.${key}`;

export interface RefineryLabelEdit {
  current: (structureId: number) => string;
  onSave: (structureId: number, label: string | null) => Promise<void>;
}

export interface RefineryRowInfo {
  to: string;
  meta: string;
  offer?: string;
}

function RefineryRow({
  structureId,
  name,
  edit,
  info,
}: {
  structureId: number;
  name: string;
  edit?: RefineryLabelEdit;
  info?: RefineryRowInfo;
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
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
      <div className="min-w-0 flex-1 basis-56 space-y-1">
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
            {info ? (
              <Link to={info.to} className={cx(entityLinkClassName(), '[overflow-wrap:anywhere]')}>
                {name}
              </Link>
            ) : (
              <span className="[overflow-wrap:anywhere]">{name}</span>
            )}
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
        {info && !editing && <p className="text-xs text-text-dim">{info.meta}</p>}
        {editing && (
          <p id={hintId} className="text-xs text-text-dim">
            {t(k('hint'))}
          </p>
        )}
        {error && <InlineError>{error}</InlineError>}
      </div>
      {info?.offer && <Pill tone="warning">{info.offer}</Pill>}
    </li>
  );
}

export function RefineryLabels({
  structureIds,
  name,
  edit,
  info,
}: {
  structureIds: readonly number[];
  name: (structureId: number) => string;
  edit?: RefineryLabelEdit;
  info?: (structureId: number) => RefineryRowInfo;
}) {
  const { t } = useTranslation();
  if (structureIds.length === 0) return null;
  const sorted = [...structureIds].sort((a, b) => name(a).localeCompare(name(b)) || a - b);
  return (
    <Panel title={t(k('title'))} padded={false}>
      <ul className="divide-y divide-line">
        {sorted.map((id) => (
          <RefineryRow
            key={id}
            structureId={id}
            name={name(id)}
            {...(edit ? { edit } : {})}
            {...(info ? { info: info(id) } : {})}
          />
        ))}
      </ul>
    </Panel>
  );
}
