import { useTranslation } from 'react-i18next';
import { Checkbox, Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import {
  focusRingInsetClassName,
  interactiveClassName,
  selectedRowClassName,
  touchCheckboxLabelClassName,
} from '@/components/ui/controlStyles';
import { MailLabelTags } from '@/features/character/MailLabelTags';
import { MailRowMenu } from '@/features/character/MailRowMenu';
import { cx } from '@/lib/cx';
import { formatDateOnly, formatTimeOfDay } from '@/lib/timestamp';
import { FOLDER_ICON, TAB_LABEL_KEY, type MailRow } from '@/features/character/mailDisplay';

interface MailListRowProps {
  row: MailRow;
  isAll: boolean;
  isRead: boolean;
  isSelected: boolean;
  party: string;
  timeZone?: string;
  timeOnly?: boolean;
  onOpen: (row: MailRow, button: HTMLButtonElement) => void;
  canOrganize?: boolean;
  selecting?: boolean;
  checked?: boolean;
  onToggleCheck?: (row: MailRow) => void;
  onSetRead?: (row: MailRow, read: boolean) => void;
  onDelete?: (row: MailRow) => void;
}

export function MailListRow({
  row,
  isAll,
  isRead,
  isSelected,
  party,
  timeZone,
  timeOnly = false,
  onOpen,
  canOrganize = false,
  selecting = false,
  checked = false,
  onToggleCheck,
  onSetRead,
  onDelete,
}: MailListRowProps) {
  const { t } = useTranslation();
  const { header, tab } = row;
  const FolderIcon = FOLDER_ICON[tab];
  const ticking = selecting && canOrganize;
  return (
    <li>
      <div
        aria-current={isSelected ? 'true' : undefined}
        className={cx(
          'flex items-center',
          interactiveClassName,
          isSelected ? selectedRowClassName : 'border-l-2 border-l-transparent hover:bg-panel-2'
        )}
      >
        {ticking && (
          <label className={cx(touchCheckboxLabelClassName, 'pl-2.5')}>
            <Checkbox
              checked={checked}
              onChange={() => onToggleCheck?.(row)}
              aria-label={t('mail.selectRow', { subject: header.subject || t('mail.noSubject') })}
            />
          </label>
        )}
        <button
          type="button"
          onClick={(e) => (ticking ? onToggleCheck?.(row) : onOpen(row, e.currentTarget))}
          aria-current={isSelected ? 'true' : undefined}
          className={cx(
            'flex min-w-0 flex-1 items-start gap-2 self-stretch py-1.5 pr-3 pl-2.5 text-left',
            focusRingInsetClassName
          )}
        >
          <span aria-hidden="true" className="mt-1.5 flex w-1.5 shrink-0 justify-center">
            {!isRead && !ticking && <span className="size-1.5 rounded-full bg-accent" />}
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span
              className={cx(
                'line-clamp-2 text-sm break-words',
                isRead ? 'font-normal text-text-dim' : 'font-semibold text-text'
              )}
            >
              {header.subject || t('mail.noSubject')}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-text-dim">
              <FolderIcon aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0" />
              <span className="shrink-0 tracking-widest uppercase">{t(TAB_LABEL_KEY[tab])}</span>
              <span aria-hidden="true" className="shrink-0 text-text-faint">
                ·
              </span>
              <span className="min-w-0 truncate">{party}</span>
              {isAll && (
                <Tooltip content={t('mail.rowOwner', { name: row.ownerName })}>
                  <span className="shrink-0">
                    <CharacterAvatar
                      characterId={row.ownerId}
                      size="sm"
                      loading="lazy"
                      alt={t('mail.rowOwner', { name: row.ownerName })}
                      className="rounded-full border-0"
                    />
                  </span>
                </Tooltip>
              )}
              {header.timestamp && (
                <span className="ml-auto shrink-0 tabular-nums">
                  {(timeOnly ? formatTimeOfDay : formatDateOnly)(
                    new Date(header.timestamp),
                    timeZone
                  )}
                </span>
              )}
            </span>
            <MailLabelTags names={row.labelNames} />
          </span>

          {!isRead && <span className="sr-only">{t('mail.unread')}</span>}
        </button>
        {canOrganize && !selecting && (
          <MailRowMenu
            label={t('mail.rowMoreActions', { subject: header.subject || t('mail.noSubject') })}
            isRead={isRead}
            onSetRead={(read) => onSetRead?.(row, read)}
            onDelete={() => onDelete?.(row)}
          />
        )}
      </div>
    </li>
  );
}
