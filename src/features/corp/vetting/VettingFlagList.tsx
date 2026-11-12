import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, SeverityIcon } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import type {
  VettingEvidence,
  VettingFlag,
  VettingParty,
  VettingReportCharacter,
} from '@/engine/vetting';
import { formatCompactNumber } from '@/lib/compactNumber';
import { formatIsk } from '@/lib/isk';
import { formatList } from '@/lib/listFormat';
import { signedIsk } from '@/lib/signedIsk';
import { useTimeZone } from '@/lib/timeFormat';
import { formatTimestamp } from '@/lib/timestamp';
import { VettingEntity } from './VettingEntity';
import { CHECK_SOURCE_LABEL, evidenceWhatKey, flagFindingParams, partyLabel } from './vettingView';

interface Names {
  parties: readonly VettingParty[];
  characters: readonly VettingReportCharacter[];
}

/** The rows behind a flag: when, who with (an entity link), what, and the ISK where there is any. */
function EvidenceRows({ flag, names }: { flag: VettingFlag; names: Names }) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const several = flag.characterIds.length > 1;
  const row = (evidence: VettingEvidence, index: number) => {
    const party = names.parties.find((candidate) => candidate.id === evidence.partyId);
    const corporation =
      party?.category === 'character' && party.corporationId !== undefined
        ? names.parties.find((candidate) => candidate.id === party.corporationId)
        : undefined;
    const on = names.characters.find((candidate) => candidate.characterId === evidence.characterId);
    return (
      <li
        key={index}
        className="grid grid-cols-[9rem_1fr_auto] items-baseline gap-x-3 gap-y-0.5 px-3 py-1.5 max-sm:grid-cols-1"
      >
        <span className="text-xs text-text-dim tabular-nums">
          {evidence.at === null
            ? t('vetting.report.noDate')
            : formatTimestamp(new Date(evidence.at), timeZone)}
        </span>
        <span className="min-w-0">
          {party ? (
            <VettingEntity id={party.id} category={party.category}>
              {party.name}
            </VettingEntity>
          ) : (
            t('vetting.report.unknownParty', { id: evidence.partyId })
          )}
          {corporation && <span className="text-text-dim"> · {corporation.name}</span>}
          <span className="block text-xs text-text-dim">
            {t(evidenceWhatKey(evidence.what))}
            {several && on && ` · ${on.name}`}
          </span>
        </span>
        {evidence.amount !== undefined && (
          <span className="text-right tabular-nums max-sm:text-left">
            {t('vetting.report.isk', { amount: signedIsk(evidence.amount, 0) })}
          </span>
        )}
      </li>
    );
  };
  return (
    <>
      <ul className="divide-y divide-line text-sm">{flag.evidence.map(row)}</ul>
      {flag.evidenceTotal > flag.evidence.length && (
        <p className="px-3 py-1.5 text-xs text-text-dim">
          {t('vetting.report.evidenceCapped', {
            shown: flag.evidence.length,
            count: flag.evidenceTotal,
          })}
        </p>
      )}
    </>
  );
}

/**
 * One flag: severity glyph and word, a title, one sentence a recruiter can act on, which
 * character and source it came from, and the rows behind it under a disclosure.
 */
function FlagItem({ flag, names, open }: { flag: VettingFlag; names: Names; open: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(open);
  const critical = flag.severity === 'critical';
  const on = flag.characterIds.flatMap((id) => {
    const character = names.characters.find((candidate) => candidate.characterId === id);
    return character ? [character.name] : [];
  });
  const params = flagFindingParams(flag, {
    isk: (value) => formatIsk(value),
    compact: formatCompactNumber,
    party: (id) => partyLabel(names.parties, id) ?? t('vetting.report.unknownParty', { id }),
  });
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex items-start gap-2">
        <SeverityIcon severity={flag.severity} className="mt-1" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
            {t(`vetting.checks.${flag.check}.title`)}
            <Pill tone={critical ? 'danger' : 'warning'}>
              {t(critical ? 'vetting.report.serious' : 'vetting.report.ask')}
            </Pill>
          </p>
          <p className="text-sm">{t(`vetting.checks.${flag.check}.finding`, params)}</p>
          <p className="text-xs text-text-dim">
            {t('vetting.report.onFrom', {
              characters: formatList(on),
              source: t(`vetting.sources.${CHECK_SOURCE_LABEL[flag.check]}`),
            })}
          </p>
        </div>
      </div>
      {flag.evidence.length > 0 && (
        <div className="pl-6">
          <Disclosure
            label={t('vetting.report.rowsBehind', { count: flag.evidenceTotal })}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
          >
            <EvidenceRows flag={flag} names={names} />
          </Disclosure>
        </div>
      )}
    </li>
  );
}

export function VettingFlagList({
  flags,
  parties,
  characters,
}: {
  flags: readonly VettingFlag[];
  parties: readonly VettingParty[];
  characters: readonly VettingReportCharacter[];
}) {
  const names = { parties, characters };
  return (
    <ul className="divide-y divide-line">
      {flags.map((flag, index) => (
        <FlagItem
          // A check can flag more than once (one per undeclared character, one per hopper).
          key={`${flag.check}:${flag.characterIds.join(',')}:${flag.facts.partyId ?? index}`}
          flag={flag}
          names={names}
          open={index === 0}
        />
      ))}
    </ul>
  );
}
