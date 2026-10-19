import { TextArea } from '@/components/ui';
import { markupPlainText, parseEveMarkup } from '@/engine/mail/eveMarkup';
import { plainTextToMarkup } from '@/engine/mail/mailEditorDoc';
import type { MailBodyEditorProps } from './MailBodyEditor';

export function PlainBodyEditor({
  value,
  onChange,
  className,
  counter,
  ...rest
}: MailBodyEditorProps) {
  return (
    <>
      <TextArea
        {...rest}
        value={markupPlainText(parseEveMarkup(value))}
        onChange={(e) => onChange(plainTextToMarkup(e.target.value))}
        className={`text-sm ${className ?? ''}`}
      />
      {counter && <div className="flex justify-end">{counter}</div>}
    </>
  );
}
