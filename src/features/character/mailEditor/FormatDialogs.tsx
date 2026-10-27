/**
 * The format bar's sheets: colour, size, link and table. Each is a `Modal`
 * (a bottom sheet on a phone, centred on a wide screen) that applies on
 * choosing and closes; none of them knows which surface is behind the bar.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FieldError, IconButton, Modal, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { markupColorToCss } from '@/engine/mail/eveMarkup';
import {
  MAIL_COLOR_SWATCHES,
  MAIL_SIZE_PRESETS,
  normalizeHexColor,
  MAIL_LINK_TEXT_MAX,
  linkDraftOf,
  sizePresetOf,
  validateLinkForm,
  type LinkTarget,
} from '@/engine/mail/mailFormat';
import { BASE_SIZE_PX, EVE_MAIL_SURFACE_CLASS } from '../MailBodyView';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Phone layout: a bottom sheet. Wide screens: a centred dialog. */
  phone: boolean;
  /** Whether "back to default" is offered as a live control (not in Source). */
  canReset: boolean;
}

const placement = (phone: boolean) => (phone ? 'sheet' : 'center');

// --- Colour ----------------------------------------------------------------

interface ColorDialogProps extends SheetProps {
  /** Current colour at the caret: `#aarrggbb`, `null` for the default, or `mixed`. */
  current: string | 'mixed' | null;
  onPick: (color: string | null) => void;
}

export function ColorDialog({ open, onClose, phone, canReset, current, onPick }: ColorDialogProps) {
  const { t } = useTranslation();
  const [hex, setHex] = useState('');
  const [invalid, setInvalid] = useState(false);
  const hexRef = useRef<HTMLInputElement>(null);

  function pick(color: string | null) {
    onPick(color);
    setHex('');
    setInvalid(false);
    onClose();
  }
  function submitHex(e: FormEvent) {
    e.preventDefault();
    const color = normalizeHexColor(hex);
    if (color === null) setInvalid(true);
    else pick(color);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('mail.format.colorTitle')}
      placement={placement(phone)}
    >
      <div className="space-y-4">
        {/* Swatches sit on the EVE mail surface so a colour looks as it will in game. */}
        <div className={cx(EVE_MAIL_SURFACE_CLASS, 'grid grid-cols-6 gap-2')}>
          {MAIL_COLOR_SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={t('mail.format.colorSwatch', { hex: color.slice(3) })}
              aria-pressed={current === color}
              onClick={() => pick(color)}
              style={{ backgroundColor: markupColorToCss(color) }}
              className="flex size-9 items-center justify-center rounded-xs border border-white/30 text-black/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {current === color && <Icon.Done />}
            </button>
          ))}
        </div>
        <Button size="md" onClick={() => pick(null)} disabled={!canReset}>
          {t('mail.format.colorDefault')}
        </Button>
        <form onSubmit={submitHex} className="space-y-1">
          <label htmlFor="mail-color-hex" className="block text-[0.6875rem] text-text-dim">
            {t('mail.format.colorHex')}
          </label>
          <div className="flex gap-2">
            <TextInput
              id="mail-color-hex"
              ref={hexRef}
              value={hex}
              onChange={(e) => {
                setHex(e.target.value);
                setInvalid(false);
              }}
              placeholder="ff8800"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={invalid}
              aria-describedby={
                invalid ? 'mail-color-hex-hint mail-color-hex-error' : 'mail-color-hex-hint'
              }
              className="min-w-0 flex-1 font-mono"
            />
            <Button type="submit" variant="primary" size="md">
              {t('mail.format.colorApply')}
            </Button>
          </div>
          <p id="mail-color-hex-hint" className="text-xs text-text-dim">
            {t('mail.format.colorHexHint')}
          </p>
          {invalid && (
            <FieldError id="mail-color-hex-error">{t('mail.format.colorHexInvalid')}</FieldError>
          )}
        </form>
      </div>
    </Modal>
  );
}

// --- Size ------------------------------------------------------------------

interface SizeDialogProps extends SheetProps {
  current: number | 'mixed' | null;
  onPick: (px: number | null) => void;
}

export function SizeDialog({ open, onClose, phone, canReset, current, onPick }: SizeDialogProps) {
  const { t } = useTranslation();
  const active = current === 'mixed' ? null : sizePresetOf(current);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('mail.format.sizeTitle')}
      placement={placement(phone)}
    >
      <ul className="space-y-1">
        {MAIL_SIZE_PRESETS.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              aria-pressed={active === p.id}
              disabled={p.px === null && !canReset}
              onClick={() => {
                onPick(p.px);
                onClose();
              }}
              className={cx(
                'flex min-h-9 w-full items-center justify-between rounded-xs border px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                active === p.id ? 'border-accent bg-accent/10' : 'border-line hover:bg-panel-2',
                'disabled:cursor-not-allowed disabled:opacity-40'
              )}
            >
              <span style={{ fontSize: `${(p.px ?? BASE_SIZE_PX) / BASE_SIZE_PX}em` }}>
                {t(`mail.format.sizes.${p.id}`)}
              </span>
              {active === p.id && <Icon.Done />}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// --- Link ------------------------------------------------------------------

interface LinkDialogProps extends SheetProps {
  /** What the link edit would replace; read once, when the sheet opens. */
  getTarget: () => LinkTarget;
  onApply: (target: LinkTarget, edit: { text: string; href: string }) => void;
  onRemove?: (target: LinkTarget) => void;
}

export function LinkDialog(props: LinkDialogProps) {
  // Remounted per open so the fields start from the selection / link under the caret.
  return props.open ? <LinkDialogBody {...props} /> : null;
}

function LinkDialogBody({
  onClose,
  phone,
  canReset,
  getTarget,
  onApply,
  onRemove,
}: LinkDialogProps) {
  const { t } = useTranslation();
  const [target] = useState(getTarget);
  const [draft] = useState(() => linkDraftOf(target));
  const [text, setText] = useState(draft.text);
  const [url, setUrl] = useState(draft.url);
  const [errors, setErrors] = useState<{ url?: true; text?: true }>({});
  const textRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const result = validateLinkForm({ text, url }, draft.text);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onApply(target, { text: result.text, href: result.href });
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={t('mail.format.linkTitle')}
      placement={placement(phone)}
      initialFocusRef={draft.text === '' ? textRef : urlRef}
    >
      <form onSubmit={submit} noValidate className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="mail-link-text" className="block text-[0.6875rem] text-text-dim">
            {t('mail.format.linkText')}
          </label>
          <TextInput
            id="mail-link-text"
            ref={textRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setErrors((x) => ({ ...x, text: undefined }));
            }}
            disabled={target.markOnly === true}
            aria-invalid={errors.text === true}
            aria-describedby={
              target.markOnly
                ? 'mail-link-text-hint'
                : errors.text
                  ? 'mail-link-text-error'
                  : undefined
            }
            className="w-full"
          />
          {target.markOnly && (
            <p id="mail-link-text-hint" className="text-xs text-text-dim">
              {t('mail.format.linkTextLocked')}
            </p>
          )}
          {errors.text && (
            <FieldError id="mail-link-text-error">
              {t('mail.format.linkTextTooLong', { max: MAIL_LINK_TEXT_MAX })}
            </FieldError>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="mail-link-url" className="block text-[0.6875rem] text-text-dim">
            {t('mail.format.linkUrl')}
          </label>
          <TextInput
            id="mail-link-url"
            ref={urlRef}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setErrors((x) => ({ ...x, url: undefined }));
            }}
            aria-invalid={errors.url === true}
            aria-describedby={errors.url ? 'mail-link-url-error' : undefined}
            className="w-full"
          />
          {errors.url && (
            <FieldError id="mail-link-url-error">{t('mail.format.linkInvalid')}</FieldError>
          )}
        </div>
        <div className="flex justify-end gap-2">
          {target.href !== null && canReset && onRemove && (
            <Button
              size="md"
              onClick={() => {
                onRemove(target);
                onClose();
              }}
            >
              {t('mail.format.linkRemove')}
            </Button>
          )}
          <Button type="submit" variant="primary" size="md">
            {t('mail.format.linkApply')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// --- Table -----------------------------------------------------------------

const TABLE_LIMITS = { minRows: 2, maxRows: 10, minCols: 2, maxCols: 6 } as const;

interface TableDialogProps extends Omit<SheetProps, 'canReset'> {
  onInsert: (rows: number, cols: number) => void;
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <IconButton
          icon={<Icon.Decrease />}
          label={t('mail.format.tableFewer', { what: label.toLowerCase() })}
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
        />
        <output aria-label={label} className="w-6 text-center tabular-nums">
          {value}
        </output>
        <IconButton
          icon={<Icon.Increase />}
          label={t('mail.format.tableMore', { what: label.toLowerCase() })}
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
        />
      </div>
    </div>
  );
}

export function TableDialog({ open, onClose, phone, onInsert }: TableDialogProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('mail.format.tableTitle')}
      placement={placement(phone)}
    >
      <div className="space-y-4">
        <Stepper
          label={t('mail.format.tableRows')}
          value={rows}
          min={TABLE_LIMITS.minRows}
          max={TABLE_LIMITS.maxRows}
          onChange={setRows}
        />
        <Stepper
          label={t('mail.format.tableCols')}
          value={cols}
          min={TABLE_LIMITS.minCols}
          max={TABLE_LIMITS.maxCols}
          onChange={setCols}
        />
        <div
          aria-hidden
          className="grid gap-px"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: rows * cols }, (_, i) => (
            <span
              key={i}
              className={cx(
                'h-5 border border-line-bright',
                i < cols ? 'bg-accent/50' : 'bg-text-dim/25'
              )}
            />
          ))}
        </div>
        <p className="text-xs text-text-dim">{t('mail.format.tableHint')}</p>
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              onInsert(rows, cols);
              onClose();
            }}
          >
            {t('mail.format.tableInsert')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
