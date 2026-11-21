import type { SharedMoonPopFire, SharedPopTime } from '@/engine/notificationDiffs';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { sharingCorporationLabel } from '../../sharedPopsCache';
import { type DomainCopy, fired } from './shared';

export interface SharedMoonPopNames {
  /** The sharing corporation's name; absent falls back to its id. */
  readonly corporation?: string;
  /** The Pop Time in the pilot's chosen clock. */
  readonly when?: string;
}

const corporationOf = (fire: SharedMoonPopFire, names: SharedMoonPopNames): string =>
  sharingCorporationLabel(fire.corporationId, names.corporation);

const PUSH_POP_TIME: Record<SharedPopTime, string> = {
  ready: 'Ready',
  'auto-fracture': 'Auto-fracture',
};

/**
 * Title "Moon pop · [Refinery]", body "[Pop Time] at [time] · [Refinery] · taxed by [corporation] · [rate]%"
 * (the scope decisions' words: the body names the refinery too because the Alerts panel row
 * shows the body without the title); a chunk fractured early reads "Fractured early at [time]". Opening it opens the pop on the Calendar, which
 * `notificationOptions.ts`'s `occurrencePath` reads off the Occurrence Key.
 */
export const sharedMoonPopCopy: DomainCopy<SharedMoonPopFire, SharedMoonPopNames> & {
  readonly push: PushCopy<SharedMoonPopFire, SharedMoonPopNames>;
} = {
  poll: (fire, _character, names) => ({
    title:
      fire.refineryName === null
        ? fired('sharedMoonPop', 'titleUnnamed')
        : fired('sharedMoonPop', 'title', { refinery: fire.refineryName }),
    body: fired('sharedMoonPop', fire.refineryName === null ? 'body' : 'bodyAtRefinery', {
      popTime: fired(
        'sharedMoonPop',
        fire.early ? 'fracturedEarly' : fire.popTime === 'ready' ? 'ready' : 'autoFracture'
      ),
      when: names.when ?? '',
      refinery: fire.refineryName ?? '',
      corporation: corporationOf(fire, names),
      rate: fire.ratePct,
    }),
  }),
  /** Asserted: a started Extraction's times do not change (`projectionWording`). */
  push: (fire, _character, names) => {
    assertProjectionWording('sharedMoonPop', 'assert');
    return {
      title: fire.refineryName === null ? 'Moon pop' : `Moon pop · ${fire.refineryName}`,
      body: `${fire.early ? 'Fractured early' : PUSH_POP_TIME[fire.popTime]} at ${names.when ?? ''}${fire.refineryName === null ? '' : ` · ${fire.refineryName}`} · taxed by ${corporationOf(fire, names)} · ${fire.ratePct}%`,
    };
  },
};
