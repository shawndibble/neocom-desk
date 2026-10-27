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
import { useTranslation } from 'react-i18next';
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
  'img',
];

/** A task-list box as a static glyph: it isn't a control, so it gets no checkbox look or touch target. */
function TaskBox({ done }: { done: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      role="img"
      aria-label={t(done ? 'survey.info.taskDone' : 'survey.info.taskOpen')}
      className="mr-2"
    >
      {done ? '☑' : '☐'}
    </span>
  );
}

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
          h1: heading('h3', 'text-lg'),
          h2: heading('h3', 'text-base'),
          h3: heading('h4', 'text-sm'),
          h4: heading('h4', 'text-sm'),
          h5: heading('h4', 'text-sm'),
          h6: heading('h4', 'text-sm'),
          // An image never loads: the reader gets its alt text.
          img: ({ alt }) => <>{alt}</>,
          hr: () => <hr className="border-line" />,
          li: ({ children }) => <li className="has-[input]:list-none">{children}</li>,
          // Task-list boxes are shown, never togglable: a reader can't change a stored note.
          input: ({ checked }) => <TaskBox done={checked === true} />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-line-bright pl-3 text-text-dim">
              {children}
            </blockquote>
          ),
          pre: ({ children }) => (
            <pre className="overflow-x-auto rounded-xs bg-panel-2 p-2 font-mono text-[0.9em] [&>code]:bg-transparent [&>code]:p-0">
              {children}
            </pre>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="border-collapse text-left">{children}</table>
            </div>
          ),
          th: ({ children, style }) => (
            <th className={`${CELL} font-semibold`} style={style}>
              {children}
            </th>
          ),
          td: ({ children, style }) => (
            <td className={CELL} style={style}>
              {children}
            </td>
          ),
          ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
          ol: ({ children, start }) => (
            <ol start={start} className="list-decimal pl-5">
              {children}
            </ol>
          ),
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

const CELL = 'border border-line px-2 py-1';

/**
 * Notes headings sit below the panel's own title (the h2): `#` and `##` render as
 * h3, deeper ones as h4, each with its own size so the level reads at a glance.
 */
function heading(Tag: 'h3' | 'h4', size: string) {
  return ({ children }: { children?: ReactNode }) => (
    <Tag className={`${size} font-semibold text-text`}>{children}</Tag>
  );
}
