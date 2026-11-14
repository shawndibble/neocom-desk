/**
 * The phone's Accelerator line on Skills › Plans (GLOSSARY.md **Accelerator**):
 * one tall row saying what is injected and whether its time is set, opening a
 * sheet with the shared `AcceleratorSection` and the attribute sheet it boosts.
 *
 * The editor is set once per booster, so on a phone it no longer sits open
 * above the queue; the row only says when it needs the pilot (a detected bonus
 * with no time left set, which leaves training times off). Desktop keeps the
 * inline editor in `AttributesPane`.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Eyebrow, Modal } from '@/components/ui';
import { focusRingClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import * as Icon from '@/components/ui/icons';
import type { CharacterAcceleratorRecord } from '@/db';
import { resolveAccelerator } from '@/engine/accelerator';
import { useCharacterAccelerators } from '@/features/accelerator/useAccelerators';
import { formatCountdown } from '@/lib/duration';
import { AcceleratorSection } from './AcceleratorSection';

export function AcceleratorRow({
  characterId,
  running,
  detectedBonus,
  nowMs,
  attributes,
}: {
  characterId: number;
  /** The typed-in accelerator, only while it is still running. */
  running: CharacterAcceleratorRecord | null;
  detectedBonus: number | null;
  nowMs: number;
  /** The attribute chips, shown under the editor as what the booster adds to. */
  attributes: ReactNode;
}) {
  const { t } = useTranslation();
  // Purges a run-out record. The section does too, but here it is mounted only while the sheet is open.
  useCharacterAccelerators();
  const [open, setOpen] = useState(false);
  const state = resolveAccelerator(running, detectedBonus, nowMs);

  let status;
  if (state.kind === 'manual') {
    status = (
      <span className="text-text-dim">
        {t('plans.acceleratorRowRunning', {
          bonus: state.bonus,
          left: formatCountdown((state.expiresAt - nowMs) / 1000),
        })}
      </span>
    );
  } else if (state.kind === 'detected') {
    status = (
      <span className="flex items-center gap-1 text-warning">
        <Icon.Warn size={Icon.ICON_SIZE.sm} aria-hidden />
        {t('plans.acceleratorRowNeedsTime', { bonus: state.bonus })}
      </span>
    );
  } else {
    status = <span className="text-text-dim">{t('plans.acceleratorRowNone')}</span>;
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cx(
          'flex min-h-9 w-full items-center justify-between gap-2 rounded-xs border border-line bg-panel px-3 py-1.5 text-left',
          rowInteractiveClassName,
          focusRingClassName
        )}
      >
        <span className="min-w-0">
          <span className="block text-sm">{t('plans.accelerator')}</span>
          <span className="block truncate text-xs">{status}</span>
        </span>
        <Icon.GoTo size={Icon.ICON_SIZE.sm} aria-hidden className="shrink-0 text-text-dim" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        placement="sheet"
        title={t('plans.accelerator')}
      >
        <div className="space-y-4 text-xs">
          <AcceleratorSection
            characterId={characterId}
            running={running}
            detectedBonus={detectedBonus}
            startAdding
            showTitle={false}
          />
          <section aria-label={t('skills.attributes')} className="border-t border-line pt-3">
            <Eyebrow as="h3" className="mb-2">
              {t('skills.attributes')}
            </Eyebrow>
            {attributes}
          </section>
        </div>
      </Modal>
    </>
  );
}
