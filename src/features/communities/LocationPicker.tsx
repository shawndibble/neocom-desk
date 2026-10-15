import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from '@/components/ui';
import { resolvePlace, searchPlaces } from '@/engine/communities/requestPlaces';
import { usePlaceIndex } from './usePlaceIndex';

const SUGGESTIONS = 6;

/**
 * The compose dialog's location field (issue #3811): free text as before, with
 * systems and regions offered as you type. Picking one writes its canonical
 * text ("Badivefi, Khanid" or "Khanid (region)"), which the board reads back
 * to measure jumps. A line under the field says whether what is typed can be
 * measured, so a typed note is never mistaken for a place; it still posts.
 */
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
  /** Suggestions follow typing; picking one closes them until the next keystroke. */
  const [typing, setTyping] = useState(false);
  const suggestions = useMemo(
    () => (index && typing ? searchPlaces(value, index, SUGGESTIONS) : []),
    [index, typing, value]
  );
  const trimmed = value.trim();
  const measurable = index && trimmed !== '' ? resolvePlace(trimmed, index) !== null : null;

  return (
    <div className="space-y-1">
      <label htmlFor={`${id}-input`} className="block text-xs text-text-dim">
        {t('communities.board.compose.location')}
      </label>
      <TextInput
        id={`${id}-input`}
        className="w-full"
        value={value}
        maxLength={maxLength}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          setTyping(true);
          onChange(e.target.value);
        }}
      />
      {suggestions.length > 0 && (
        <ul
          aria-label={t('communities.board.compose.places')}
          className="divide-y divide-line rounded-xs border border-line"
        >
          {suggestions.map((place) => (
            <li key={place.text}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-panel-2 focus-visible:bg-panel-2"
                onClick={() => {
                  setTyping(false);
                  onChange(place.text);
                }}
              >
                {place.text}
              </button>
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
