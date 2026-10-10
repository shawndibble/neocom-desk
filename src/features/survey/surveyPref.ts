/**
 * The Survey this device is tracking, as the id of its stored Share Link.
 * Local, not synced: a Survey is a link anyone can open, so remembering it on
 * one device is a convenience, and "New survey" just forgets it.
 */
import { isShareId } from '@/engine/share/shareId';
import { db } from '@/db';
import { TIME_FORMATS, TIME_FORMAT_SETTING_KEY, type TimeFormat } from '@/lib/timeFormat';
import { createLocalSetting } from '@/lib/useLocalSetting';
import { useLiveQuery } from 'dexie-react-hooks';

export const useCurrentSurveyId = createLocalSetting<string | null>({
  key: 'miningSurveyCurrent',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'string' && isShareId(raw) ? raw : null),
});

/**
 * The clock the pilot pressed the "Done at" tile onto, or null while they
 * haven't: then the tile follows the app's time format (see `useDoneAtClock`).
 */
export const useDoneAtOverride = createLocalSetting<TimeFormat | null>({
  key: 'miningSurveyDoneAtClock',
  defaultValue: null,
  parse: (raw) => (TIME_FORMATS.includes(raw as TimeFormat) ? (raw as TimeFormat) : null),
});

/**
 * Which clock the "Done at" tile shows: the pilot's press on the tile, else
 * their Settings → App display time format when they have chosen one, else EVE
 * time. The setting's own default is `local`, so only a stored row counts as a
 * choice; reading the row (not the store) is how "never picked" shows.
 */
export function useDoneAtClock(): TimeFormat {
  const override = useDoneAtOverride((state) => state.value);
  const chosen = useLiveQuery(async () => {
    const stored = (await db.settings.get(TIME_FORMAT_SETTING_KEY))?.value;
    return TIME_FORMATS.includes(stored as TimeFormat) ? (stored as TimeFormat) : null;
  }, []);
  return override ?? chosen ?? 'eve';
}
