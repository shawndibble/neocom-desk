import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import {
  focusRingInsetClassName,
  interactiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatDateOnly } from '@/lib/timestamp';
import { FOLDER_ICON, TAB_LABEL_KEY, type MailRow } from '@/features/character/mailDisplay';

interface MailListRowProps {
  row: MailRow;
  isAll: boolean;
  isRead: boolean;
  isSelected: boolean;
  /** Sender, or the recipients on a Sent mail. */
  party: string;
  timeZone?: string;
  onOpen: (row: MailRow, button: HTMLButtonElement) => void;
}

/** One two-line mail row in the list: unread gutter, subject, then folder · party · date. */
export function MailListRow({
  row,
  isAll,
  isRead,
  isSelected,
  party,
  timeZone,
  onOpen,
}: MailListRowProps) {
  const { t } = useTranslation();
  const { header, tab } = row;
  const FolderIcon = FOLDER_ICON[tab];
  return (
    <li>
      {/* Selection used to be `bg-panel-2` alone, the same fill hover already
      paints, so the open mail was invisible the moment the pointer moved. The
      accent edge carries it now, with the fill as the second, non-colour
      signal; both sit on the wrapper so they span the twin too. */}
      <div
        aria-current={isSelected ? 'true' : undefined}
        className={cx(
          'flex items-center',
          interactiveClassName,
          isSelected ? selectedRowClassName : 'border-l-2 border-l-transparent hover:bg-panel-2'
        )}
      >
        <button
          type="button"
          onClick={(e) => onOpen(row, e.currentTarget)}
          // `aria-current={false}` renders the string "false", which is a
          // valid token meaning "not current" — so this is tidiness, not a bug
          // fix: it drops an attribute from every unselected row rather than
          // spelling out the default.
          aria-current={isSelected ? 'true' : undefined}
          className={cx(
            'flex min-w-0 flex-1 items-start gap-2 self-stretch py-1.5 pr-3 pl-2.5 text-left',
            focusRingInsetClassName
          )}
        >
          {/* Unread marker, in a fixed-width gutter so read and unread rows
          keep one left edge — the empty gutter is itself the "read" signal. */}
          <span aria-hidden="true" className="mt-1.5 flex w-1.5 shrink-0 justify-center">
            {!isRead && <span className="size-1.5 rounded-full bg-accent" />}
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {/* The subject wraps rather than truncating: a clipped subject was
            the readability complaint, and it is the field that identifies a mail. */}
            <span
              className={cx(
                'line-clamp-2 text-sm break-words',
                isRead ? 'font-normal text-text-dim' : 'font-semibold text-text'
              )}
            >
              {header.subject || t('mail.noSubject')}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-text-dim">
              {/* Glyph *and* the folder's name, not the glyph alone: DESIGN.md
              §5 blesses a bare decorative icon only "beside its own visible
              text label", and dropping the name would have made folder
              identity harder to see than the uppercase tag this replaced —
              the opposite of the point, now that several folders share one
              list by default. */}
              <FolderIcon aria-hidden="true" size={Icon.ICON_SIZE.sm} className="shrink-0" />
              <span className="shrink-0 tracking-widest uppercase">{t(TAB_LABEL_KEY[tab])}</span>
              <span aria-hidden="true" className="shrink-0 text-text-faint">
                ·
              </span>
              <span className="min-w-0 truncate">{party}</span>
              {isAll && (
                // Portrait alone: the name beside it repeated down the whole
                // list and crowded the sender. The name stays reachable via
                // the alt/title and the reading pane.
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
                // `text-text-dim`, not the `text-text-faint` this shipped
                // with: DESIGN.md §1 restricts faint to decoration, and a
                // received date is content.
                <span className="ml-auto shrink-0 tabular-nums">
                  {formatDateOnly(new Date(header.timestamp), timeZone)}
                </span>
              )}
            </span>
          </span>

          {/* The dot and the bold weight say "unread" in colour and typography
          only — DESIGN.md §7's "colour is never the sole signal" wants it in
          words too. The folder needs no such gloss: its name is rendered above. */}
          {!isRead && <span className="sr-only">{t('mail.unread')}</span>}
        </button>
      </div>
    </li>
  );
}
