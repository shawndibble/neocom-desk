import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip, Spinner, TextInput } from '@/components/ui';
import { resolveSolarSystem, type SolarSystemRef } from '@/features/character/systemLookup';

interface BuildSystemInputProps {
  /** The plan's stored build-system name, or undefined when it builds at its hub. */
  systemName: string | undefined;
  /** Placeholder and fallback: the hub's own system, which is what an empty field means. */
  hubSystemName: string;
  /** The plan's security band, stated under the field — derived, never typed. */
  securityLabel: string;
  /** `null` clears the field back to "build at the hub". */
  onChange: (system: SolarSystemRef | null) => void;
  /**
   * Distinguishes this instance's `id`/`htmlFor` from any other
   * `BuildSystemInput` mounted on the same page — issue #698 mounts a second
   * one for the Reaction Location beside the plan's primary one. Defaults to
   * the original hardcoded id, so the lone-input case (every caller before
   * #698) needs no change.
   */
  idPrefix?: string;
}

/**
 * Names the system the job runs in, which settles two things at once: the cost
 * index the job fee is charged at, and the security band that scales the rig
 * bonus (`materials.ts`: rig percent x security multiplier). Both follow from
 * the system, so neither is a field of its own — the band is stated under this
 * one rather than picked beside it.
 *
 * Which rig is *fitted* does not follow from anything, and stays its own
 * select: it is a physical module, and ESI publishes no structure fitting.
 *
 * A typed name rather than a picker: the name is resolved against the local
 * solar-system table (`sde/solarSystems.ts`, ESI's `/universe/ids` only when
 * that table cannot be read), and autocompleting against ~8,500 systems is not
 * worth a picker. Resolution happens on commit — blur or Enter — not per
 * keystroke, so a half-typed name is never looked up.
 *
 * The typed text is kept on a miss instead of snapping back: the player is one
 * character from the right name, and a field that erases what they typed makes
 * them retype it. The plan keeps its previous system until a name resolves.
 */
export function BuildSystemInput({
  systemName,
  hubSystemName,
  securityLabel,
  onChange,
  idPrefix = 'build-plan-system',
}: BuildSystemInputProps) {
  const { t } = useTranslation();
  const [text, setText] = useState(systemName ?? '');
  const [status, setStatus] = useState<'idle' | 'resolving' | 'notFound' | 'unavailable'>('idle');
  const errorId = `${idPrefix}-error`;
  const hasError = status === 'notFound' || status === 'unavailable';

  // Follows the plan when it changes underneath — switching plans, or a sync
  // landing an edit made on another device. Adjusted during render rather than
  // in an effect, the same shape `BuildPlanDetail` uses for its snapshot key:
  // an effect would paint the stale name first.
  const [prevSystemName, setPrevSystemName] = useState(systemName);
  if (prevSystemName !== systemName) {
    setPrevSystemName(systemName);
    setText(systemName ?? '');
    setStatus('idle');
  }

  async function commit() {
    const trimmed = text.trim();
    if (trimmed === (systemName ?? '')) return setStatus('idle');
    if (trimmed === '') {
      setStatus('idle');
      onChange(null);
      return;
    }
    setStatus('resolving');
    const result = await resolveSolarSystem(trimmed);
    // "Couldn't check" (offline, no local table) is not a verdict on the name.
    if (result.status !== 'found') return setStatus(result.status);
    setStatus('idle');
    setText(result.system.name);
    onChange(result.system);
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      <span className="flex items-center gap-1">
        <label htmlFor={idPrefix}>{t('industry.buildSystem')}</label>
        <InfoTooltip
          label={t('industry.buildSystemTooltipLabel')}
          content={t('industry.buildSystemTooltip')}
        />
      </span>
      <span className="flex items-center gap-1">
        <TextInput
          id={idPrefix}
          className="w-full"
          value={text}
          placeholder={hubSystemName}
          aria-invalid={status === 'notFound'}
          aria-describedby={hasError ? errorId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            if (hasError) setStatus('idle');
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            }
          }}
        />
        {status === 'resolving' && <Spinner size="sm" />}
      </span>
      {status === 'notFound' ? (
        <span id={errorId} role="alert" className="text-danger">
          {t('industry.buildSystemNotFound')}
        </span>
      ) : status === 'unavailable' ? (
        <span id={errorId} role="alert" className="text-warning">
          {t('industry.buildSystemUnavailable')}
        </span>
      ) : (
        <span className="text-text-dim">{securityLabel}</span>
      )}
    </div>
  );
}
