import { getUniverseStation, type UniverseStation } from '@/esi/endpoints';
import { loadStaticEntity } from '@/esi/cache';
import { lookupNpcStation } from '@/sde/npcStations';

async function loadStation(stationId: number): Promise<UniverseStation | null> {
  const result = await loadStaticEntity('station', stationId, getUniverseStation);
  return result?.data ?? null;
}

export async function loadStationName(stationId: number): Promise<string | null> {
  const snapshot = await lookupNpcStation(stationId);
  if (snapshot) return snapshot.name;
  return (await loadStation(stationId))?.name ?? null;
}

export async function loadStationSystemId(stationId: number): Promise<number | null> {
  const snapshot = await lookupNpcStation(stationId);
  if (snapshot) return snapshot.systemId;
  return (await loadStation(stationId))?.system_id ?? null;
}

export async function loadStationSummary(
  stationId: number
): Promise<{ name: string; systemId: number; typeId: number } | null> {
  const snapshot = await lookupNpcStation(stationId);
  if (snapshot && typeof snapshot.typeId === 'number') {
    return { name: snapshot.name, systemId: snapshot.systemId, typeId: snapshot.typeId };
  }
  const station = await loadStation(stationId);
  return station
    ? { name: station.name, systemId: station.system_id, typeId: station.type_id }
    : null;
}
