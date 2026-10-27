/**
 * The mail format bar (decision 20261016-124635): bold, italic, underline,
 * colour, size, link, table and clear formatting, as one row of flat icon
 * buttons split into groups by hairlines, with the Source toggle at the right
 * end. It is the top strip of the editor's card on every width (the card owns
 * the frame; the bar draws only a hairline under itself). Colour, size, link
 * and table open a sheet rather than crowding the row.
 *
 * It only calls `MailEditorCommands`, so it works the same over the Preview
 * (Tiptap) and the Source textarea. Buttons never take focus from the writing
 * surface, or the keyboard would close under the pilot's thumb.
 */
import { useState, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { markupColorToCss } from '@/engine/mail/eveMarkup';
import type { MailEditorCommands } from './commands';
import { ColorDialog, LinkDialog, SizeDialog, TableDialog } from './FormatDialogs';

/** The game's default mail text colour, `#bfffffff`. */
const GAME_DEFAULT_TEXT_COLOR = '#bfffffff';

const keepFocus = (e: PointerEvent) => e.preventDefault();

interface MailFormatBarProps {
  commands: MailEditorCommands;
  /** Phone layout: one row that scrolls sideways, and the sheets are bottom sheets. */
  phone: boolean;
  disabled?: boolean;
  /** Source toggle at the right end; absent = no toggle. */
  sourceActive?: boolean;
  onToggleSource?: () => void;
  className?: string;
}

/** A hairline between button groups. */
const Divider = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 self-center bg-line" />;

export function MailFormatBar({
  commands,
  phone,
  disabled,
  sourceActive = false,
  onToggleSource,
  className,
}: MailFormatBarProps) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<'color' | 'size' | 'link' | 'table' | null>(null);
  const { state } = commands;

  const button = (
    key: string,
    icon: ReactNode,
    label: string,
    onClick: () => void,
    extra: { pressed?: boolean; unavailable?: boolean; tooltip?: string } = {}
  ) => (
    <IconButton
      key={key}
      icon={icon}
      label={label}
      tooltip={extra.tooltip}
      pressed={extra.pressed}
      disabled={disabled}
      // `aria-disabled`, not native: a native-disabled button fires no hover/focus, so its reason would never show.
      aria-disabled={extra.unavailable || undefined}
      onClick={onClick}
      onPointerDown={keepFocus}
      onMouseDown={(e) => e.preventDefault()}
      variant="plain"
      className="shrink-0"
    />
  );

  const colorDot = (
    <span
      aria-hidden
      className="size-5 rounded-full border border-text-dim ring-1 ring-black/40"
      style={{
        // No colour set = the game's own default text colour, white at 75%.
        backgroundColor: markupColorToCss(
          state.color === null || state.color === 'mixed' ? GAME_DEFAULT_TEXT_COLOR : state.color
        ),
        backgroundImage:
          state.color === 'mixed'
            ? 'linear-gradient(135deg, transparent 45%, #bfbfbf 45%, #bfbfbf 55%, transparent 55%)'
            : undefined,
      }}
    />
  );

  return (
    <>
      <div
        role="toolbar"
        aria-label={t('mail.format.barLabel')}
        className={cx('flex items-center border-b border-line px-1 py-0.5', className)}
      >
        <div
          className={cx(
            'flex min-w-0 flex-1 gap-0.5',
            // Phone: one row that scrolls sideways (the cut-off button is the cue, as in Tabs).
            phone ? 'tab-scroller flex-nowrap overflow-x-auto' : 'flex-wrap'
          )}
        >
          {button(
            'bold',
            <Icon.FormatBold />,
            t('mail.format.bold'),
            () => commands.toggleMark('bold'),
            {
              pressed: state.bold,
            }
          )}
          {button(
            'italic',
            <Icon.FormatItalic />,
            t('mail.format.italic'),
            () => commands.toggleMark('italic'),
            { pressed: state.italic }
          )}
          {button(
            'underline',
            <Icon.FormatUnderline />,
            t('mail.format.underline'),
            () => commands.toggleMark('underline'),
            { pressed: state.underline }
          )}
          <Divider />
          {button('color', colorDot, t('mail.format.color'), () => setSheet('color'))}
          {button('size', <Icon.FormatSize />, t('mail.format.size'), () => setSheet('size'))}
          <Divider />
          {button('link', <Icon.FormatLink />, t('mail.format.link'), () => setSheet('link'), {
            pressed: state.link !== null,
            unavailable: !commands.canLink,
            tooltip: commands.canLink ? undefined : t('mail.format.linkInTable'),
          })}
          {button('table', <Icon.TableView />, t('mail.format.table'), () => setSheet('table'))}
          <Divider />
          {button('clear', <Icon.FormatClear />, t('mail.format.clear'), commands.clearFormatting, {
            unavailable: !commands.canClear,
            tooltip: commands.canClear ? undefined : t('mail.format.clearUnavailable'),
          })}
        </div>
        {onToggleSource && (
          // Outside the scroller, so the way back to Preview never scrolls out of reach.
          <span className="flex shrink-0 items-center pl-1">
            <Divider />
            {button('source', <Icon.OpenSource />, t('mail.format.source'), onToggleSource, {
              pressed: sourceActive,
            })}
          </span>
        )}
      </div>

      <ColorDialog
        open={sheet === 'color'}
        onClose={() => setSheet(null)}
        phone={phone}
        current={state.color}
        canReset={commands.canReset}
        onPick={commands.setColor}
      />
      <SizeDialog
        open={sheet === 'size'}
        onClose={() => setSheet(null)}
        phone={phone}
        current={state.size}
        canReset={commands.canReset}
        onPick={commands.setSize}
      />
      <LinkDialog
        open={sheet === 'link'}
        onClose={() => setSheet(null)}
        phone={phone}
        getTarget={commands.linkTarget}
        canReset={commands.canReset}
        onApply={commands.setLink}
        onRemove={commands.removeLink}
      />
      <TableDialog
        open={sheet === 'table'}
        onClose={() => setSheet(null)}
        phone={phone}
        onInsert={commands.insertTable}
      />
    </>
  );
}
