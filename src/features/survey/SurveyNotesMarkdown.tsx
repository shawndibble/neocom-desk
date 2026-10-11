/**
 * The starter's notes as a reader sees them: standard Markdown (the CommonMark
 * and GitHub flavours a cheatsheet lists): headings, bold, italic,
 * strikethrough, lists, task lists, quotes, code, tables, rules, links and bare
 * URLs. Anyone holding the Survey link reads these, so some things stay inert:
 * raw HTML shows as text, images flatten to their alt text (nothing loads from a
 * stranger's URL), headings never outrank the panel's own title, and a link
 * opens only if it is http(s). A single newline stays a line break, as the
 * plain-text notes always had it. Loaded lazily by `SurveyNotes`, so the
 * Markdown parser costs nothing until a Survey has notes.
 */
import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { Checkbox } from '@/components/ui';
import { ExternalLink } from '@/components/ui/ExternalLink';

const ALLOWED_ELEMENTS = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'strong',
  'em',
  'del',
  'ul',
  'ol',
  'li',
  'a',
  'code',
  'br',
  'pre',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'input',
];

export default function SurveyNotesMarkdown({ notes }: { notes: string }) {
  return (
    <div className="flex flex-col gap-2 [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        allowedElements={ALLOWED_ELEMENTS}
        unwrapDisallowed
        components={{
          a: ({ href, children }) =>
            href !== undefined && /^https?:\/\//i.test(href) ? (
              <ExternalLink href={href}>{children}</ExternalLink>
            ) : (
              <>{children}</>
            ),
          // The panel's title is the h2, so notes headings start a level below it:
          // # and ## read as the larger tier, everything deeper as the smaller.
          h1: Heading3,
          h2: Heading3,
          h3: Heading4,
          h4: Heading4,
          h5: Heading4,
          h6: Heading4,
          hr: () => <hr className="border-line" />,
          li: ({ children }) => <li className="has-[input]:list-none">{children}</li>,
          // Task-list boxes are shown, never togglable: a reader can't change a stored note.
          input: ({ checked }) => (
            <Checkbox checked={checked === true} disabled readOnly className="mr-2 align-middle" />
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-line-bright pl-3 text-text-dim">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-xs bg-panel-2 p-2 font-mono text-[0.9em]">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="border-collapse text-left">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-line px-2 py-1 font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-line px-2 py-1">{children}</td>,
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

function Heading3({ children }: { children?: ReactNode }) {
  return <h3 className="text-base font-semibold text-text">{children}</h3>;
}

function Heading4({ children }: { children?: ReactNode }) {
  return <h4 className="text-sm font-semibold text-text">{children}</h4>;
}
