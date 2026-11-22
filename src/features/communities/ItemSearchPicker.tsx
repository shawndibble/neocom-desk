import { useMemo, useState, type KeyboardEvent, type Ref } from 'react';
import { SearchInput } from '@/components/ui';
import { suggestionListClassName, suggestionOptionClassName } from '@/components/ui/controlStyles';
import type { AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { useCombobox } from '@/lib/useCombobox';
import { namedLike, needleOf } from './shareLists';

const SEARCH_RESULTS = 8;
const MIN_SEARCH_CHARS = 2;

/**
 * The compose form's "add an item" search (a request's lines, a buyback's
 * single items): a combobox over the appraisal catalogue. Results list under
 * the field, not over it, so the dialog's scroll area never clips them; Enter
 * takes the highlighted result, or the first. The caller learns the pick through
 * `onPick`, and the field empties for the next one.
 */
export function ItemSearchPicker({
  catalogue,
  inputRef,
  label,
  placeholder,
  resultsLabel,
  onPick,
}: {
  catalogue: AppraisalCatalogue | null;
  inputRef?: Ref<HTMLInputElement>;
  label: string;
  placeholder: string;
  resultsLabel: string;
  onPick: (item: { typeId: number; name: string }) => void;
}) {
  const [search, setSearch] = useState('');
  const results = useMemo(() => {
    const needle = needleOf(search);
    if (!catalogue || needle.length < MIN_SEARCH_CHARS) return [];
    return namedLike([...catalogue.values()], needle).slice(0, SEARCH_RESULTS);
  }, [catalogue, search]);
  const open = results.length > 0;
  const combo = useCombobox({ count: results.length, open });

  function choose(item: { typeId: number; name: string }) {
    setSearch('');
    combo.reset();
    onPick(item);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (combo.handleNavKey(event)) return;
    if (event.key === 'Enter' && open) {
      event.preventDefault();
      choose(results[combo.highlight ?? 0]);
    } else if (event.key === 'Escape' && open) {
      // Closes the list, not the dialog.
      event.preventDefault();
      event.stopPropagation();
      setSearch('');
      combo.reset();
    }
  }

  return (
    <div className="space-y-1">
      <SearchInput
        ref={inputRef}
        {...combo.inputProps}
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          combo.reset();
        }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul {...combo.listboxProps} aria-label={resultsLabel} className={suggestionListClassName}>
          {results.map((item, index) => (
            <li
              key={item.typeId}
              {...combo.optionProps(index)}
              className={suggestionOptionClassName(index === combo.activeIndex)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
