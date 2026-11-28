import type { ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import * as Icon from '@/components/ui/icons';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { TableScroll } from '@/components/ui/TableScroll';

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

function TaskBox({ done }: { done: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      role="img"
      aria-label={t(done ? 'survey.info.taskDone' : 'survey.info.taskOpen')}
      className="mr-2 inline-flex align-middle"
    >
      {done ? (
        <Icon.TaskDone size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      ) : (
        <Icon.TaskOpen size={Icon.ICON_SIZE.sm} aria-hidden="true" />
      )}
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
          h1: heading('h3', 'text-xl'),
          h2: heading('h3', 'text-base'),
          h3: heading('h4', 'text-sm'),
          h4: heading('h4', 'text-sm'),
          h5: heading('h4', 'text-sm'),
          h6: heading('h4', 'text-sm'),
          img: ({ alt }) => <>{alt}</>,
          hr: () => <hr className="border-line" />,
          li: ({ children }) => <li className="has-[input]:list-none">{children}</li>,
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
            <TableScroll>
              <table className="border-collapse text-left">{children}</table>
            </TableScroll>
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

function heading(Tag: 'h3' | 'h4', size: string) {
  return ({ children }: { children?: ReactNode }) => (
    <Tag className={`${size} font-semibold text-text`}>{children}</Tag>
  );
}
