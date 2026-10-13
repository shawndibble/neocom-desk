import { createLocalSetting } from '@/lib/useLocalSetting';

/** The Community tabs that hold shared content. */
export type ContentTab = 'blueprints' | 'fittings' | 'plans';

/** Everyone: what the Community's Members share. Mine: what this Character shares, and how. */
export type ContentScope = 'everyone' | 'mine';

export const CONTENT_SCOPES: readonly ContentScope[] = ['everyone', 'mine'];

export const CONTENT_SCOPE_KEY = 'communityContentScope';

const DEFAULT_SCOPES: Record<ContentTab, ContentScope> = {
  blueprints: 'everyone',
  fittings: 'everyone',
  plans: 'everyone',
};

const isScope = (value: unknown): value is ContentScope =>
  CONTENT_SCOPES.includes(value as ContentScope);

/** Keeps each tab's last pick; a tab it cannot read falls back to its default. */
export function parseContentScopes(raw: unknown): Record<ContentTab, ContentScope> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const stored = raw as Record<string, unknown>;
  return Object.fromEntries(
    (Object.keys(DEFAULT_SCOPES) as ContentTab[]).map((tab) => {
      const value = stored[tab];
      return [tab, isScope(value) ? value : DEFAULT_SCOPES[tab]];
    })
  ) as Record<ContentTab, ContentScope>;
}

/** The last Everyone / Mine pick on each content tab, on this device, for every Community. */
export const useContentScopes = createLocalSetting<Record<ContentTab, ContentScope>>({
  key: CONTENT_SCOPE_KEY,
  defaultValue: DEFAULT_SCOPES,
  parse: parseContentScopes,
});
