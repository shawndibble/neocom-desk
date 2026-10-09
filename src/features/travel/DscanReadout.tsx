import { useTranslation } from 'react-i18next';
import type {
  Readout,
  ReadoutAnswer,
  ReadoutLine,
  ReadoutSignal,
  Threat,
  Tone,
} from '@/engine/pilotList/dscanReadout';
import { cx } from '@/lib/cx';

const THREAT_EDGE: Record<Threat, string> = {
  clear: 'border-l-success',
  watch: 'border-l-warning',
  dangerous: 'border-l-danger',
};
const THREAT_PILL: Record<Threat, string> = {
  clear: 'bg-success/15 text-success',
  watch: 'bg-warning/15 text-warning',
  dangerous: 'bg-danger/15 text-danger',
};
const TONE_DOT: Record<Tone, string> = {
  none: 'bg-success',
  warn: 'bg-warning',
  bad: 'bg-danger',
};
const SIGNAL_MARK: Record<ReadoutSignal['tone'], string> = {
  hot: 'bg-danger',
  mid: 'bg-warning',
  plain: 'bg-text-dim',
};

const QUESTIONS = ['find', 'catch', 'kill', 'reinforce'] as const;

/**
 * What a D-Scan is and whether it can hurt (issue #3076): a reading with its
 * evidence, a threat pill, the four questions behind the threat, and the
 * signals worth knowing. Read-only, no control: the wording is a condition,
 * never a verdict, and it always ends with the cloaked-ships caveat.
 */
export function DscanReadout({ readout }: { readout: Readout }) {
  const { t } = useTranslation();
  const prefix = 'travel.pilot.dscan.readout.';
  const line = (l: ReadoutLine) => t(`${prefix}${l.key}`, l.params);
  const threat = t(`${prefix}threat.${readout.threat}`);
  const evidence = readout.evidence.map(line).join('. ');
  return (
    <div className="rounded-xs border border-line" data-testid="dscan-readout">
      <div
        className={cx(
          'flex flex-wrap items-start gap-3 border-l-4 p-3.5',
          THREAT_EDGE[readout.threat]
        )}
      >
        <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1">
          <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t(`${prefix}readsAs`)}
          </span>
          <h3 className="text-lg font-semibold text-balance text-text">
            {t(`${prefix}reading.${readout.reading}`)}
          </h3>
          <p className="text-sm text-text-dim">
            {t(`${prefix}confidence.${readout.confidence}`)}: {evidence}.
          </p>
        </div>
        <span
          className={cx(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
            THREAT_PILL[readout.threat]
          )}
        >
          {threat}
        </span>
      </div>
      <dl className="grid grid-cols-2 border-t border-line md:grid-cols-4">
        {QUESTIONS.map((q, i) => (
          <Question
            key={q}
            label={t(`${prefix}questions.${q}`)}
            answer={readout[q]}
            text={t(`${prefix}answer.${readout[q].answer}`)}
            detail={line(readout[q].detail)}
            className={cx(
              'border-line',
              i % 2 === 0 ? 'border-r' : '',
              i < 2 ? 'border-b md:border-b-0' : '',
              i === 1 ? 'md:border-r' : '',
              i === 3 ? 'md:border-r-0' : ''
            )}
          />
        ))}
      </dl>
      <ul>
        {readout.signals.map((s) => (
          <li key={s.key} className="flex gap-2 border-t border-line px-3.5 py-2 text-sm">
            <span
              aria-hidden="true"
              className={cx('mt-2 size-1.5 shrink-0 rounded-xs', SIGNAL_MARK[s.tone])}
            />
            {line(s)}
          </li>
        ))}
      </ul>
      <p className="border-t border-line bg-panel-2 px-3.5 py-2 text-xs text-text-dim">
        {t(`${prefix}caveat`)}
      </p>
    </div>
  );
}

function Question({
  label,
  answer,
  text,
  detail,
  className,
}: {
  label: string;
  answer: ReadoutAnswer;
  text: string;
  detail: string;
  className?: string;
}) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-0.5 px-3 py-2.5', className)}>
      <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </dt>
      <dd className="flex items-center gap-1.5 font-semibold">
        <span
          aria-hidden="true"
          className={cx('size-2 shrink-0 rounded-full', TONE_DOT[answer.tone])}
        />
        {text}
      </dd>
      <dd className="text-xs [overflow-wrap:anywhere] text-text-dim">{detail}</dd>
    </div>
  );
}
