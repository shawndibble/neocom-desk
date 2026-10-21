import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

/**
 * A one-line state strip on a moon owner's page, on either side: a bold title, a quiet
 * sentence, and the actions that end or answer the state (Cancel removal, End it now).
 */
export function OwnerStatusStrip({
  title,
  body,
  tone = 'danger',
  actions,
}: {
  title: string;
  body: string;
  tone?: 'danger' | 'warning';
  actions?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cx(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xs border px-3 py-2',
        tone === 'danger' ? 'border-danger/60' : 'border-warning/60'
      )}
    >
      <p className="min-w-0 flex-1 basis-64 text-sm">
        <span className="block font-semibold">{title}</span>
        <span className="text-text-dim">{body}</span>
      </p>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
