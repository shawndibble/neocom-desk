/**
 * Device-local: the Structures page's "Fuel until" date (issue #6093), as
 * `YYYY-MM-DD`. `null` — the default — means 30 days from today, so an
 * untouched page keeps planning a month ahead rather than toward a date that
 * slides into the past.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const useFuelUntil = createLocalSetting<string | null>({
  key: 'corpStructuresFuelUntil',
  defaultValue: null,
  parse: (raw) => (typeof raw === 'string' && DATE.test(raw) ? raw : null),
});
