import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { PASTE_DETECTORS } from '@/engine/import/pasteDestination';
import { SEQUENCE_PREFIX } from '@/lib/shortcutSequence';
import { useSingleKeyShortcuts } from '@/lib/singleKeyShortcuts';
import {
  SHORTCUTS,
  commandPaletteDisplayKey,
  isApplePlatform,
  altChordDisplayKey,
  modChordDisplayKey,
  pasteDisplayKey,
} from '@/lib/shortcuts';

const KBD =
  'rounded-xs border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[0.6875rem] text-text';

/**
 * Two columns from `md` up, so the list fills the card without throwing a
 * description and its key a card's width apart; one column on a phone.
 */
const LIST =
  'grid grid-cols-1 gap-x-8 text-sm md:grid-cols-2 [&>*:last-child]:border-b-0 md:[&>*:nth-last-child(2)]:border-b-0';

/**
 * The card's own edge closes the list, so the last row drops its divider.
 * In the two-column `LIST` the last row of each column is the last and the
 * second-to-last child, whichever column holds an odd count.
 */
const SINGLE_LIST = 'text-sm [&>*:last-child]:border-b-0';

/** A description and its key, one row of a shortcut list. */
function Row({
  label,
  children,
  dimmed = false,
}: {
  label: string;
  children: ReactNode;
  dimmed?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-b border-line py-2${dimmed ? ' opacity-50' : ''}`}
    >
      {/* The value never shrinks or wraps and sits flush right; the label takes the rest. */}
      <dt className="min-w-0 text-text-dim">{label}</dt>
      <dd className="shrink-0 text-right whitespace-nowrap">{children}</dd>
    </div>
  );
}

/**
 * Help › Shortcuts: every key the app answers to, and the first Help tab
 * (scope decision `20261002-165816-shortcuts-move-to-help-always-on-and-lose`;
 * the g sequences and the off switch: `20261016-*-shortcuts-become-g-sequences-with-an-off-switch`).
 * Esc and the palette chord stay live when the switch is off; the rest dim.
 */
export function ShortcutsPanel() {
  const { t } = useTranslation();
  const apple = isApplePlatform();
  const singleKeys = useSingleKeyShortcuts((s) => s.value);

  return (
    <div className="space-y-4">
      <Panel title={t('shortcuts.title')}>
        {!singleKeys && <p className="mb-2 text-sm text-text-dim">{t('shortcuts.offNote')}</p>}
        <dl className={LIST}>
          {/* First, and outside `SHORTCUTS`: a modified chord (`lib/shortcuts.ts`). */}
          <Row label={t('shortcuts.openCommandPalette')}>
            <kbd className={KBD}>{commandPaletteDisplayKey(apple)}</kbd>
          </Row>
          {SHORTCUTS.map((shortcut) => (
            <Row
              key={shortcut.id}
              label={t(shortcut.descriptionKey)}
              dimmed={!singleKeys && shortcut.run !== undefined}
            >
              {shortcut.sequence ? (
                <>
                  <kbd className={KBD}>{SEQUENCE_PREFIX.toUpperCase()}</kbd>{' '}
                  <span className="text-text-dim">{t('shortcuts.then')}</span>{' '}
                  <kbd className={KBD}>{shortcut.displayKey}</kbd>
                </>
              ) : (
                <kbd className={KBD}>{shortcut.displayKey}</kbd>
              )}
            </Row>
          ))}
        </dl>
      </Panel>
      <Panel title={t('shortcuts.pasteTitle')}>
        {/* The app-wide paste router (`app/GlobalPasteRouter.tsx`); rows come from its registry. */}
        <p className="mb-2 text-sm text-text-dim">{t('shortcuts.pasteHint')}</p>
        {/* One column: its rows name a destination, not a key, and wrap in a half-width column. */}
        <dl className={SINGLE_LIST}>
          <Row label={t('shortcuts.paste')}>
            <kbd className={KBD}>{pasteDisplayKey(apple)}</kbd>
          </Row>
          {PASTE_DETECTORS.map(({ id }) => (
            <Row key={id} label={t(`shortcuts.pasteDestinations.${id}.label`)}>
              <span className="text-text">{t(`shortcuts.pasteDestinations.${id}.opens`)}</span>
            </Row>
          ))}
        </dl>
      </Panel>
      <Panel title={t('shortcuts.onPageTitle')}>
        <p className="mb-2 text-sm text-text-dim">{t('shortcuts.onPageHint')}</p>
        <dl className={LIST}>
          <Row label={t('shortcuts.saveFitting')}>
            <kbd className={KBD}>{modChordDisplayKey(apple, 'S')}</kbd>
          </Row>
          <Row label={t('shortcuts.saveFittingAsNew')}>
            <kbd className={KBD}>{modChordDisplayKey(apple, 'S', { shift: true })}</kbd>
          </Row>
          <Row label={t('shortcuts.cycleModuleState')}>
            <kbd className={KBD}>S</kbd>
          </Row>
          <Row label={t('shortcuts.openInJanice')}>
            <kbd className={KBD}>{altChordDisplayKey(apple, 'J')}</kbd>
          </Row>
          <Row label={t('shortcuts.submitPaste')}>
            <kbd className={KBD}>{modChordDisplayKey(apple, 'Enter')}</kbd>
          </Row>
        </dl>
      </Panel>
    </div>
  );
}
