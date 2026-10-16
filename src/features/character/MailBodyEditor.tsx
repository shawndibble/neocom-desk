import { TextArea } from '@/components/ui';

/**
 * The seam between the New Mail composer and whatever edits its body. The
 * composer owns the body as one controlled string and never assumes it is
 * plain text; a rich editor (WYSIWYG + format bar, EVE markup) drops in by
 * implementing this contract and being passed as `NewMailComposer`'s
 * `bodyEditor`.
 */
export interface MailBodyEditorProps {
  /** The body as it goes on the wire. */
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

/** The body editor until the rich one lands: a plain text area. */
export function PlainBodyEditor({ value, onChange, className, ...rest }: MailBodyEditorProps) {
  return (
    <TextArea
      {...rest}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`text-sm ${className ?? ''}`}
    />
  );
}
