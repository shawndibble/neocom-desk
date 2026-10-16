/**
 * The mail format bar (decision 20261016-124635): bold, italic, underline,
 * colour, size, link, table and clear formatting, as one row of icon buttons.
 * On a phone it docks above the on-screen keyboard and scrolls sideways; on a
 * wide screen it sits above the writing surface and wraps. Colour, size, link
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
import { markupColorToCss } from '@/engine/eveMarkup';
import type { MailEditorCommands } from './commands';
import { ColorDialog, LinkDialog, SizeDialog, TableDialog } from './FormatDialogs';

/** Height reserved under the writing surface so the docked bar never covers the last line. */
export const DOCKED_BAR_SPACE_CLASS = 'pb-(--mail-format-bar-space)';

/** The game's default mail text colour, `#bfffffff`. */
const GAME_DEFAULT_TEXT_COLOR = '#bfffffff';

const keepFocus = (e: PointerEvent) => e.preventDefault();

interface MailFormatBarProps {
  commands: MailEditorCommands;
  /** Phone layout: the sheets are bottom sheets. */
  phone: boolean;
  /** `keyboard`: fixed above the on-screen keyboard. `inline`: in the flow above the surface. */
  dock: 'keyboard' | 'inline';
  /** Hidden while the writing surface has no focus (a sheet that is open keeps it shown). */
  visible: boolean;
  /** The keyboard's height over the layout viewport; where a `keyboard` dock sits. */
  keyboardInset?: number;
  disabled?: boolean;
  className?: string;
}

export function MailFormatBar({
  commands,
  phone,
  dock,
  visible,
  keyboardInset = 0,
  disabled,
  className,
}: MailFormatBarProps) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<'color' | 'size' | 'link' | 'table' | null>(null);
  const { state } = commands;
  const shown = visible || sheet !== null;

  const button = (
    key: string,
    icon: ReactNode,
    label: string,
    onClick: () => void,
    extra: { pressed?: boolean; disabled?: boolean; tooltip?: string } = {}
  ) => (
    <IconButton
      key={key}
      icon={icon}
      label={label}
      tooltip={extra.tooltip}
      pressed={extra.pressed}
      disabled={disabled || extra.disabled}
      onClick={onClick}
      onPointerDown={keepFocus}
      onMouseDown={(e) => e.preventDefault()}
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
        data-mail-format-bar={dock === 'keyboard' && shown ? 'docked' : undefined}
        style={dock === 'keyboard' ? { bottom: keyboardInset } : undefined}
        className={cx(
          shown ? 'flex' : 'hidden',
          'gap-1 bg-panel',
          // Phone: one row that scrolls sideways (the cut-off button is the cue, as in Tabs).
          phone ? 'tab-scroller flex-nowrap overflow-x-auto' : 'flex-wrap',
          dock === 'keyboard'
            ? 'fixed inset-x-0 z-40 border-t border-line px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]'
            : 'border border-line px-1 py-1',
          className
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
        {button('color', colorDot, t('mail.format.color'), () => setSheet('color'))}
        {button('size', <Icon.FormatSize />, t('mail.format.size'), () => setSheet('size'))}
        {button('link', <Icon.FormatLink />, t('mail.format.link'), () => setSheet('link'), {
          pressed: state.link !== null,
        })}
        {button('table', <Icon.TableView />, t('mail.format.table'), () => setSheet('table'))}
        {button('clear', <Icon.FormatClear />, t('mail.format.clear'), commands.clearFormatting, {
          disabled: !commands.canClear,
          tooltip: commands.canClear ? undefined : t('mail.format.clearUnavailable'),
        })}
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
