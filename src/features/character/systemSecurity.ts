import { getUniverseSystem, type UniverseSystem } from '@/esi/endpoints';
import { lookupSolarSystem } from '@/sde/solarSystems';
import { loadStaticEntity } from '@/esi/cache';

async function loadSystem(systemId: number): Promise<UniverseSystem | null> {
  const result = await loadStaticEntity('system', systemId, getUniverseSystem);
  return result?.data ?? null;
}

async function loadLocalSystem(
  systemId: number
): Promise<{ name: string; security: number } | null> {
  const entry = await lookupSolarSystem(systemId);
  return entry ? { name: entry.name, security: entry.security } : null;
}

export async function loadSystemSecurity(systemId: number): Promise<number | null> {
  const local = await loadLocalSystem(systemId);
  if (local) return local.security;
  return (await loadSystem(systemId))?.security_status ?? null;
}

export async function loadSystemName(systemId: number): Promise<string | null> {
  const local = await loadLocalSystem(systemId);
  if (local) return local.name;
  return (await loadSystem(systemId))?.name ?? null;
}

export interface SystemNameAndSecurity {
  name: string | null;
  security: number | null;
}

export async function loadSystemNameAndSecurity(systemId: number): Promise<SystemNameAndSecurity> {
  const local = await loadLocalSystem(systemId);
  if (local) return { name: local.name, security: local.security };
  const system = await loadSystem(systemId);
  return { name: system?.name ?? null, security: system?.security_status ?? null };
}
