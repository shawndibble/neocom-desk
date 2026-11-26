import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';
import { suggestionListClassName, suggestionOptionClassName } from '@/components/ui/controlStyles';
import { useCombobox } from '@/lib/useCombobox';
import { resolvePlace, searchPlaces } from '@/engine/communities/requestPlaces';
import { usePlaceIndex } from './usePlaceIndex';

const SUGGESTIONS = 6;

export function LocationPicker({
  value,
  maxLength,
  onChange,
}: {
  value: string;
  maxLength: number;
  onChange: (text: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const places = usePlaceIndex();
  const index = places.status === 'ready' ? places.index : null;
  const [typing, setTyping] = useState(false);
  const suggestions = useMemo(
    () => (index && typing ? searchPlaces(value, index, SUGGESTIONS) : []),
    [index, typing, value]
  );
  const combo = useCombobox({ count: suggestions.length, open: suggestions.length > 0 });

  function choose(text: string) {
    setTyping(false);
    combo.reset();
    onChange(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (combo.handleNavKey(event)) return;
    if (event.key === 'Enter' && combo.highlight !== null && suggestions[combo.highlight]) {
      event.preventDefault();
      choose(suggestions[combo.highlight].text);
    } else if (event.key === 'Escape' && suggestions.length > 0) {
      event.preventDefault();
      event.stopPropagation();
      setTyping(false);
      combo.reset();
    }
  }

  const trimmed = value.trim();
  const measurable = index && trimmed !== '' ? resolvePlace(trimmed, index) !== null : null;

  return (
    <div className="space-y-1">
      <label htmlFor={`${id}-input`} className="block text-xs text-text-dim">
        {t('communities.board.compose.location')}
      </label>
      <TextInput
        id={`${id}-input`}
        {...combo.inputProps}
        autoComplete="off"
        className="w-full"
        value={value}
        maxLength={maxLength}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          setTyping(true);
          combo.reset();
          onChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {suggestions.length > 0 && (
        <ul
          {...combo.listboxProps}
          aria-label={t('communities.board.compose.places')}
          className={suggestionListClassName}
        >
          {suggestions.map((place, index) => (
            <li
              key={place.text}
              {...combo.optionProps(index)}
              className={suggestionOptionClassName(index === combo.activeIndex)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(place.text)}
            >
              {place.text}
            </li>
          ))}
        </ul>
      )}
      <p id={`${id}-hint`} className="text-xs text-text-dim">
        {places.status === 'failed'
          ? t('communities.board.compose.locationNoList')
          : measurable === null
            ? t('communities.board.compose.locationHint')
            : measurable
              ? t('communities.board.compose.locationMeasurable')
              : t('communities.board.compose.locationFree')}
      </p>
    </div>
  );
}
