import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { markupColorToCss } from '@/engine/mail/eveMarkup';
import type { MailEditorCommands } from './commands';
import { ColorDialog, LinkDialog, SizeDialog, TableDialog } from './FormatDialogs';

const GAME_DEFAULT_TEXT_COLOR = '#bfffffff';

const keepFocus = (e: PointerEvent) => e.preventDefault();

interface MailFormatBarProps {
  commands: MailEditorCommands;
  phone: boolean;
  disabled?: boolean;
  sourceActive?: boolean;
  onToggleSource?: () => void;
  className?: string;
}

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
  const [stop, setStop] = useState('bold');

  const onBarKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const { key } = e;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') return;
    const items = [
      ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-bar-key]:not(:disabled)'),
    ];
    const from = items.findIndex((el) => el === document.activeElement);
    if (from < 0) return;
    e.preventDefault();
    const next =
      key === 'Home'
        ? items[0]
        : key === 'End'
          ? items[items.length - 1]
          : items[(from + (key === 'ArrowRight' ? 1 : -1) + items.length) % items.length];
    setStop(next.dataset.barKey ?? 'bold');
    next.focus();
  };

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
      aria-disabled={disabled || extra.unavailable || undefined}
      data-bar-key={key}
      tabIndex={key === stop ? 0 : -1}
      onFocus={() => setStop(key)}
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
        backgroundColor: markupColorToCss(
          state.color === null || state.color === 'mixed' ? GAME_DEFAULT_TEXT_COLOR : state.color
        ),
        backgroundImage:
          state.color === 'mixed'
            ? 'linear-gradient(135deg, transparent 45%, var(--color-text-dim) 45%, var(--color-text-dim) 55%, transparent 55%)'
            : undefined,
      }}
    />
  );

  return (
    <>
      <div
        role="toolbar"
        aria-label={t('mail.format.barLabel')}
        onKeyDown={onBarKeyDown}
        className={cx('flex items-center border-b border-line px-1 py-0.5', className)}
      >
        <div
          className={cx(
            'flex min-w-0 flex-1 gap-0.5',
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
