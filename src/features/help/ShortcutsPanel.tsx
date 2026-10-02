import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import {
  SHORTCUTS,
  commandPaletteDisplayKey,
  isApplePlatform,
  pasteDisplayKey,
} from '@/lib/shortcuts';

const KBD =
  'rounded-xs border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[0.6875rem] text-text';

/**
 * Two columns from `md` up, so the list fills the card without throwing a
 * description and its key a card's width apart; one column on a phone.
 */
const LIST = 'grid grid-cols-1 gap-x-8 text-sm md:grid-cols-2';

/** A description and its key, one row of a shortcut list. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-2">
      <dt className="text-text-dim">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * Help › Shortcuts: every key the app answers to. Moved here from Settings —
 * a list to look up, not a setting — and the first Help tab. The single keys
 * are always on.
 */
export function ShortcutsPanel() {
  const { t } = useTranslation();
  const apple = isApplePlatform();

  return (
    <div className="space-y-4">
      <Panel title={t('shortcuts.title')}>
        <dl className={LIST}>
          {/* First, and outside `SHORTCUTS`: a modified chord (`lib/shortcuts.ts`). */}
          <Row label={t('shortcuts.openCommandPalette')}>
            <kbd className={KBD}>{commandPaletteDisplayKey(apple)}</kbd>
          </Row>
          {SHORTCUTS.map((shortcut) => (
            <Row key={shortcut.id} label={t(shortcut.descriptionKey)}>
              <kbd className={KBD}>{shortcut.displayKey}</kbd>
            </Row>
          ))}
        </dl>
      </Panel>
      <Panel title={t('shortcuts.pasteTitle')}>
        {/* The app-wide paste router (`app/GlobalPasteRouter.tsx`). */}
        <p className="mb-2 text-sm text-text-dim">{t('shortcuts.pasteHint')}</p>
        <dl className={LIST}>
          <Row label={t('shortcuts.paste')}>
            <kbd className={KBD}>{pasteDisplayKey(apple)}</kbd>
          </Row>
          {(['pasteFitting', 'pasteItems'] as const).map((key) => (
            <Row key={key} label={t(`shortcuts.${key}`)}>
              <span className="text-text">{t(`shortcuts.${key}Opens`)}</span>
            </Row>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
