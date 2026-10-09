/**
 * The solar system "Your share" reads the mining ledger for. A Survey doesn't
 * say where it was scanned, so the pilot names the system; it defaults to
 * their current one when the location grant allows. Local, not synced: it is
 * a choice about what this device shows, like the other mining view settings.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export interface SurveySystem {
  id: number;
  name: string;
}

export const useSurveySystem = createLocalSetting<SurveySystem | null>({
  key: 'miningSurveySystem',
  defaultValue: null,
  parse: (raw) => {
    if (typeof raw !== 'object' || raw === null) return null;
    const { id, name } = raw as { id?: unknown; name?: unknown };
    return typeof id === 'number' && typeof name === 'string' ? { id, name } : null;
  },
});
