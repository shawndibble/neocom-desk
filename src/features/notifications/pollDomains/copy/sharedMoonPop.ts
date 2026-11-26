import type { SharedMoonPopFire, SharedPopTime } from '@/engine/notificationDiffs';
import { assertProjectionWording, type PushCopy } from '@/engine/projection';
import { sharingCorporationLabel } from '../../sharedPopsCache';
import { type DomainCopy, fired } from './shared';

export interface SharedMoonPopNames {
  readonly corporation?: string;
  readonly when?: string;
}

const corporationOf = (fire: SharedMoonPopFire, names: SharedMoonPopNames): string =>
  sharingCorporationLabel(fire.corporationId, names.corporation);

const PUSH_POP_TIME: Record<SharedPopTime, string> = {
  ready: 'Ready',
  'auto-fracture': 'Auto-fracture',
};

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
  push: (fire, _character, names) => {
    assertProjectionWording('sharedMoonPop', 'assert');
    return {
      title: fire.refineryName === null ? 'Moon pop' : `Moon pop · ${fire.refineryName}`,
      body: `${fire.early ? 'Fractured early' : PUSH_POP_TIME[fire.popTime]} at ${names.when ?? ''}${fire.refineryName === null ? '' : ` · ${fire.refineryName}`} · taxed by ${corporationOf(fire, names)} · ${fire.ratePct}%`,
    };
  },
};
