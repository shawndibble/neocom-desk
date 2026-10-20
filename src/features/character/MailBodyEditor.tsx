import { lazy, Suspense, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { guarded } from '@/app/routeChunks';
import { Spinner } from '@/components/ui';

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
  /**
   * The body's character counter. The editor places it in its own frame's
   * bottom-right corner (the composer no longer renders it beside the label).
   */
  counter?: ReactNode;
  /** The editor fills the space the composer gives it (full-pane compose is a flex column). */
  className?: string;
}

// The rich editor (Tiptap + ProseMirror) is its own chunk: nothing loads until a composer opens.
const RichMailBodyEditor = lazy(() => guarded(() => import('./mailEditor/RichMailBodyEditor')));

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
          {props.counter}
        </div>
      }
    >
      <RichMailBodyEditor {...props} />
    </Suspense>
  );
}
