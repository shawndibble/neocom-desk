/**
 * "Match from in-game numbers": the pilot reads the Structure Role Bonus
 * off the Industry window's material and job-duration tooltips, types them in, and picks
 * the rig fit that produces them. ESI never exposes a structure's rigs, so
 * this is the only way to fill a fit in without knowing it by heart.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, TextInput } from '@/components/ui';
import type { FacilityKind, RigFit, SecurityBand } from '@/engine/industry/types';
import { matchRigFits, parseReadingPct } from '@/engine/industry/rigMatch';
import { rigFitSummaryLabel } from './rigFitLabels';

interface RigMatchHelperProps {
  facility: FacilityKind;
  security: SecurityBand;
  onApply: (fit: RigFit) => void;
}

export function RigMatchHelper({ facility, security, onApply }: RigMatchHelperProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [meText, setMeText] = useState('');
  const [teText, setTeText] = useState('');

  const me = parseReadingPct(meText);
  const te = parseReadingPct(teText);
  const matches =
    me !== null && te !== null ? matchRigFits({ facility, security, reading: { me, te } }) : null;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {t('industry.rigMatch.open')}
      </Button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title={t('industry.rigMatch.title')}>
          <div className="flex flex-col gap-3 text-xs">
            <p>{t('industry.rigMatch.steps')}</p>
            <img
              src="/images/industry/rig-match-industry-window.png"
              alt={t('industry.rigMatch.imageAlt')}
              loading="lazy"
              className="w-full rounded border border-line"
            />
            <p className="text-text-dim">
              {t('industry.rigMatch.using', { security: t(`industry.${security}`) })}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                {t('industry.rigMatch.material')}
                <TextInput
                  size="sm"
                  inputMode="decimal"
                  value={meText}
                  onChange={(e) => setMeText(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                {t('industry.rigMatch.time')}
                <TextInput
                  size="sm"
                  inputMode="decimal"
                  value={teText}
                  onChange={(e) => setTeText(e.target.value)}
                />
              </label>
            </div>
            {matches !== null && matches.length === 0 && (
              <p className="text-warning">{t('industry.rigMatch.noMatch')}</p>
            )}
            {matches !== null && matches.length > 1 && (
              <p className="text-text-dim">{t('industry.rigMatch.ambiguous')}</p>
            )}
            {matches?.map((match) => (
              <div
                key={`${match.fit.join()}|${match.basis}`}
                className="flex items-center justify-between gap-3 border-t border-line pt-2"
              >
                <span className="flex flex-col">
                  <span>{rigFitSummaryLabel(match.fit, t)}</span>
                  <span className="text-text-dim">
                    {t(
                      match.basis === 'rigOnly'
                        ? 'industry.rigMatch.basisRigOnly'
                        : 'industry.rigMatch.basisWithHull'
                    )}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    onApply(match.fit);
                    setOpen(false);
                  }}
                >
                  {t('industry.rigMatch.use')}
                </Button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
