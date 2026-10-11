/**
 * The starter's notes as a reader sees them: a small slice of Markdown (bold,
 * italic, strikethrough, lists, inline code, links). Anyone holding the Survey
 * link reads these, so nothing else gets through: raw HTML stays text, headings
 * and images flatten to their text, and a link opens only if it is http(s).
 * A single newline stays a line break, as the plain-text notes always had it.
 * Loaded lazily by `SurveyNotes`, so the Markdown parser costs nothing until a
 * Survey has notes.
 */
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { ExternalLink } from '@/components/ui/ExternalLink';

const ALLOWED = ['p', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'a', 'code', 'br'];

export default function SurveyNotesMarkdown({ notes }: { notes: string }) {
  return (
    <div className="flex flex-col gap-2 [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={[remarkBreaks]}
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={{
          a: ({ href, children }) =>
            href !== undefined && /^https?:\/\//i.test(href) ? (
              <ExternalLink href={href}>{children}</ExternalLink>
            ) : (
              <>{children}</>
            ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
          code: ({ children }) => (
            <code className="rounded-xs bg-panel-2 px-1 font-mono text-[0.9em]">{children}</code>
          ),
        }}
      >
        {notes}
      </Markdown>
    </div>
  );
}
