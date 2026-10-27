import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal, SearchInput } from '@/components/ui';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useIsPhone } from '@/lib/useIsPhone';
import { namedLike, needleOf, ROW_LIMIT } from './shareLists';

/** One thing the Member could add: its key, its name, and a dim note after it (an "In game" mark, a skill count). */
export interface AddableItem {
  key: string;
  name: string;
  note?: ReactNode;
}

/**
 * Where a Member adds Fittings or Skill plans to what they share with a
 * Community: every one not shared yet, searchable, with Share on each row.
 * Each Share acts at once and the row leaves the list; the tab behind is the
 * list of what is shared. The shape of `AddBlueprintsDialog`'s blueprint list,
 * for the content types that have no locations.
 */
export function AddSharedItemsDialog({
  open,
  onClose,
  title,
  searchLabel,
  shareLabel,
  nothingToAdd,
  nothingAction,
  items,
  notice,
  onShare,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  searchLabel: string;
  /** The per-row button's label. */
  shareLabel: string;
  /** Shown when everything is already shared. */
  nothingToAdd: string;
  /** A way forward when there is nothing to add (a link to make one). */
  nothingAction?: ReactNode;
  items: readonly AddableItem[];
  /** A failure from the last Share; shown in here, since the page behind is inert while the dialog is open. */
  notice: string | null;
  onShare: (key: string) => void;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const [query, setQuery] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const shareButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterCommit = useFocusAfterCommit();
  const matches = useMemo(() => namedLike(items, needleOf(query)), [items, query]);
  const rows = matches.slice(0, ROW_LIMIT);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      placement={isPhone ? 'sheet-full' : 'center'}
    >
      <div className="space-y-2">
        {items.length === 0 ? (
          <EmptyState title={nothingToAdd} action={nothingAction} />
        ) : (
          <>
            <SearchInput
              ref={search}
              className="w-full"
              value={query}
              placeholder={searchLabel}
              aria-label={searchLabel}
              onChange={(event) => setQuery(event.target.value)}
            />
            {rows.length === 0 ? (
              <EmptyState title={t('communities.share.noMatch')} />
            ) : (
              <ul className="divide-y divide-line">
                {rows.map((item, index) => (
                  <li key={item.key} className="flex items-center gap-2 py-1 text-xs">
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {item.note}
                    <Button
                      size="sm"
                      ref={(el) => {
                        if (el) shareButtons.current.set(item.key, el);
                        else shareButtons.current.delete(item.key);
                      }}
                      onClick={() => {
                        // Sharing removes this row: focus moves to a neighbour, else the search.
                        const near = [rows[index + 1], rows[index - 1]].map(
                          (other) => () => (other ? shareButtons.current.get(other.key) : null)
                        );
                        focusAfterCommit(...near, search);
                        onShare(item.key);
                      }}
                    >
                      {shareLabel}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {matches.length > ROW_LIMIT && (
              <p className="text-xs text-text-dim">
                {t('communities.blueprints.limited', { count: ROW_LIMIT })}
              </p>
            )}
          </>
        )}
        {notice !== null && (
          <p role="alert" className="text-xs text-danger">
            {notice}
          </p>
        )}
      </div>
    </Modal>
  );
}
