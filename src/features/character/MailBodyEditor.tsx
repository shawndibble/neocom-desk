import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner, TextArea } from '@/components/ui';
import { markupPlainText, parseEveMarkup } from '@/engine/eveMarkup';
import { plainTextToMarkup } from '@/engine/mailEditorDoc';

/**
 * The seam between the New Mail composer and whatever edits its body. The
 * composer owns the body as one controlled string and never assumes it is
 * plain text; an editor implements this contract and is passed as
 * `NewMailComposer`'s `bodyEditor`.
 */
export interface MailBodyEditorProps {
  /** The body as it goes on the wire: EVE markup. */
  value: string;
  onChange: (value: string) => void;
  /** Id for the editing surface, so the composer's visible label can point at it. */
  id: string;
  /** The label and the live counter belong to the composer; the editor only links to them. */
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
  /** The editor fills the space the composer gives it (full-pane compose is a flex column). */
  className?: string;
}

/**
 * A plain text area over the body's text: formatting is not shown and is lost
 * on edit, but whatever is typed goes back out through `plainTextToMarkup`, so
 * `< > &` stay literal and it can never put a tag into the markup. The simplest
 * implementation of the contract; the composers default to the rich editor.
 */
export function PlainBodyEditor({ value, onChange, className, ...rest }: MailBodyEditorProps) {
  return (
    <TextArea
      {...rest}
      value={markupPlainText(parseEveMarkup(value))}
      onChange={(e) => onChange(plainTextToMarkup(e.target.value))}
      className={`text-sm ${className ?? ''}`}
    />
  );
}

// The rich editor (Tiptap + ProseMirror) is its own chunk: nothing loads until a composer opens.
const RichMailBodyEditor = lazy(() => import('./mailEditor/RichMailBodyEditor'));

/** The mail body editor: WYSIWYG with a format bar and a Source view, loaded on first use. */
export function MailBodyEditor(props: MailBodyEditorProps) {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div
          role="status"
          aria-busy
          className={`flex min-h-40 flex-1 items-center justify-center gap-2 text-xs text-text-dim ${props.className ?? ''}`}
        >
          <Spinner size="sm" /> {t('mail.format.loading')}
        </div>
      }
    >
      <RichMailBodyEditor {...props} />
    </Suspense>
  );
}
