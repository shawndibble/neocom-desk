import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import { useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTranslation } from 'react-i18next';
import { db } from '@/db';
import {
  Button,
  EmptyState,
  IconButton,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TextInput,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import {
  removeComparison,
  resolveComparisonCharacterIds,
  upsertComparison,
  useSkillComparisons,
  type SavedComparison,
} from '../comparisons';

interface SavedComparisonRowProps {
  comparison: SavedComparison;
  onLoad: (comparison: SavedComparison) => void;
  onRequestDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  registerLoad: (id: string, el: HTMLButtonElement | null) => void;
}

function SavedComparisonRow({
  comparison,
  onLoad,
  onRequestDelete,
  onRename,
  registerLoad,
}: SavedComparisonRowProps) {
  const { t } = useTranslation();
  const focusAfterCommit = useFocusAfterCommit();
  const renameButtonRef = useRef<HTMLButtonElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(comparison.name);

  function commitRename() {
    setRenaming(false);
    const name = draftName.trim();
    if (name && name !== comparison.name) onRename(comparison.id, name);
    else setDraftName(comparison.name);
  }

  // Enter and Escape unmount the focused input; hand focus to the Rename button.
  // Blur does not: the pilot is already moving on.
  function endRename(commit: boolean) {
    if (commit) commitRename();
    else {
      setDraftName(comparison.name);
      setRenaming(false);
    }
    focusAfterCommit(renameButtonRef);
  }

  return (
    <li className="flex items-center gap-2 border-b border-line px-2 py-1.5 text-xs last:border-b-0">
      {renaming ? (
        <TextInput
          size="sm"
          autoFocus
          value={draftName}
          aria-label={t('skillCompare.rename')}
          onChange={(e) => setDraftName(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Focus moves to a button mid-keystroke: its keypress must not click it.
              e.preventDefault();
              endRename(true);
            }
            if (e.key === 'Escape') {
              // The popover would otherwise take this Escape and close with the rename.
              e.stopPropagation();
              endRename(false);
            }
          }}
          className="flex-1"
        />
      ) : (
        <button
          type="button"
          ref={(el) => registerLoad(comparison.id, el)}
          onClick={() => onLoad(comparison)}
          className={entityLinkClassName(
            'flex min-h-9 flex-1 items-center truncate text-left md:min-h-0 touch:min-h-9'
          )}
        >
          {comparison.name}
        </button>
      )}
      <IconButton
        ref={renameButtonRef}
        size="row"
        icon={<Icon.Rename />}
        label={`${t('skillCompare.rename')} ${comparison.name}`}
        onClick={() => setRenaming(true)}
      />
      <IconButton
        size="row"
        icon={<Icon.Close />}
        label={`${t('skillCompare.delete')} ${comparison.name}`}
        tone="danger"
        onClick={() => onRequestDelete(comparison.id)}
      />
    </li>
  );
}

interface SavedComparisonsMenuProps {
  selectedIds: readonly number[];
  /** The saved comparison the current selection came from, if any. */
  activeComparisonId: string | null;
  /** The roster once it has loaded; `undefined` while it is still loading. */
  roster: readonly { characterId: number }[] | undefined;
  /** A saved comparison was loaded: its selection (members since removed already dropped). */
  onApply: (ids: number[], comparisonId: string, someRemoved: boolean) => void;
  /** The current selection was saved: the comparison it is now linked to. */
  onSaved: (comparisonId: string) => void;
  /** The linked comparison was deleted: the selection is no longer one. */
  onUnlinked: () => void;
}

/** The drawer's saved comparisons: save the current selection, reopen, rename or delete one. */
export function SavedComparisonsMenu({
  selectedIds,
  activeComparisonId,
  roster,
  onApply,
  onSaved,
  onUnlinked,
}: SavedComparisonsMenuProps) {
  const { t } = useTranslation();
  const value = useSkillComparisons((state) => state.value);
  const setValue = useSkillComparisons((state) => state.setValue);
  useHydratedStore(useSkillComparisons);

  const [open, setOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const focusAfterCommit = useFocusAfterCommit();
  const loadButtons = useRef(new Map<string, HTMLButtonElement>());
  const headingRef = useRef<HTMLHeadingElement>(null);
  function registerLoad(id: string, el: HTMLButtonElement | null) {
    if (el) loadButtons.current.set(id, el);
    else loadButtons.current.delete(id);
  }

  function handleSave() {
    if (selectedIds.length === 0) return;
    const existing = value.items.find((item) => item.id === activeComparisonId);
    const comparison: SavedComparison = existing
      ? { ...existing, characterIds: [...selectedIds] }
      : {
          id: crypto.randomUUID(),
          name: t('skillCompare.untitledName'),
          characterIds: [...selectedIds],
        };
    void setValue(upsertComparison(value, comparison, Date.now()));
    onSaved(comparison.id);
  }

  /**
   * A saved comparison is clickable on the very first frame — the list renders
   * straight out of the comparisons store — while the roster arrives from a
   * `useLiveQuery` a tick or more later. Resolving against a roster that has
   * not loaded yet drops every id, which left an empty selection under a false
   * "some characters were removed" notice that nothing re-ran once the roster
   * did arrive (#594). So read the roster directly for that one early click.
   */
  async function handleLoad(comparison: SavedComparison) {
    const known = new Set(
      (roster ?? (await db.characters.toArray())).map((character) => character.characterId)
    );
    const resolved = resolveComparisonCharacterIds(comparison, known);
    setOpen(false);
    onApply(resolved, comparison.id, resolved.length < comparison.characterIds.length);
  }

  async function handleConfirmDelete() {
    if (!deletingId) return;
    const id = deletingId;
    const index = value.items.findIndex((item) => item.id === id);
    // The row goes only after the dialog has closed (an awaited write), so
    // focus is requested once the write resolves: the next comparison's name
    // button, else the previous one's, else the section heading.
    const near = [value.items[index + 1], value.items[index - 1]].map(
      (item) => () => (item ? loadButtons.current.get(item.id) : null)
    );
    if (activeComparisonId === id) onUnlinked();
    setDeletingId(null);
    await setValue(removeComparison(value, id, Date.now()));
    // One macrotask on: the dialog's own focus restore (to the row being
    // deleted) runs in a passive effect and must not land after this request.
    await new Promise((resolve) => setTimeout(resolve, 0));
    focusAfterCommit(...near, headingRef);
  }

  function handleRename(id: string, name: string) {
    const target = value.items.find((item) => item.id === id);
    if (!target) return;
    void setValue(upsertComparison(value, { ...target, name }, Date.now()));
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm">
            {t('skillCompare.saved')}
            <Icon.Expanded aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-80 p-2"
          // The delete confirm is a dialog over this popover: moving into it is not a dismissal.
          onInteractOutside={(event) => {
            if (deletingId !== null) event.preventDefault();
          }}
          onFocusOutside={(event) => {
            if (deletingId !== null) event.preventDefault();
          }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3
              ref={headingRef}
              tabIndex={-1}
              className={cx(eyebrowClassName, 'focus:outline-none')}
            >
              {t('skillCompare.savedTitle')}
            </h3>
            <Button
              size="sm"
              variant="primary"
              disabled={selectedIds.length === 0}
              onClick={handleSave}
            >
              {t('skillCompare.saveComparison')}
            </Button>
          </div>
          {value.items.length === 0 ? (
            <EmptyState
              title={t('skillCompare.savedEmpty')}
              hint={t('skillCompare.savedEmptyHint')}
              className="py-4"
            />
          ) : (
            <ul className="rounded-xs border border-line">
              {value.items.map((comparison) => (
                <SavedComparisonRow
                  key={comparison.id}
                  comparison={comparison}
                  onLoad={(loaded) => void handleLoad(loaded)}
                  onRequestDelete={setDeletingId}
                  onRename={handleRename}
                  registerLoad={registerLoad}
                />
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>
      <Modal
        open={deletingId !== null}
        onClose={() => setDeletingId(null)}
        title={t('skillCompare.delete')}
      >
        <p className="text-xs text-text-dim">{t('skillCompare.deleteConfirm')}</p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" onClick={() => setDeletingId(null)}>
            {t('skillCompare.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => void handleConfirmDelete()}>
            {t('skillCompare.delete')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
