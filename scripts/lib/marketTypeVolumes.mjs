export function roundVolume(volume) {
  return Number(volume.toPrecision(6));
}

export function marketTypeEntry(typeId, type, packagedVolume) {
  const volume = roundVolume(type.volume);
  const entry = { typeId, name: type.name, marketGroupId: type.marketGroupID, volume };
  if (typeof packagedVolume === 'number' && packagedVolume > 0) {
    const packaged = roundVolume(packagedVolume);
    if (packaged !== volume) entry.packagedVolume = packaged;
  }
  return entry;
}
