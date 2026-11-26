import type { ModulePool } from '@/engine/fittings/improve';
import type { Fitting } from '@/engine/fittings/types';
import { jobSettingOf, searchSpace, type JobSetting } from '@/engine/fittings/improve';
import { buildVariationIndex, type VariationIndex } from '@/engine/market/variations';
import { modulePool } from '../improveModulePool';
import type { ImproveRequest, ImproveSearchPorts } from './types';

export interface SearchContext {
  request: ImproveRequest;
  ports: ImproveSearchPorts;
  signal: AbortSignal;
  fitting: Fitting;
  index: VariationIndex;
  pool: ModulePool;
  groupOf: (typeId: number) => number | undefined;
  jobSetting: JobSetting;
}

export function searchContext(
  request: ImproveRequest,
  ports: ImproveSearchPorts,
  signal: AbortSignal
): SearchContext {
  const { catalogue, config } = request;
  const { fitting } = ports;
  const groupOf = (typeId: number) => catalogue.types[String(typeId)]?.groupID;
  return {
    request,
    ports,
    signal,
    fitting,
    index: buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups),
    pool: modulePool(catalogue, ports.fitCheck),
    groupOf,
    jobSetting: jobSettingOf(
      config.job,
      searchSpace(config.job, config.space, fitting.drones, groupOf),
      config.noPropulsion
    ),
  };
}
