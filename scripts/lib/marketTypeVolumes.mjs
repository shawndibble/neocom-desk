// Volumes on market/types.json entries (issue #2336).

/**
 * Six significant figures, not fixed decimals: a mineral's 0.01 m3 must not
 * round to zero, and a titan's millions of m3 don't need float noise either.
 */
export function roundVolume(volume) {
  return Number(volume.toPrecision(6));
}

/**
 * One market/types.json entry from an invTypes row plus its ESI packaged
 * volume (undefined when the probe had none). `packagedVolume` is only
 * written when it differs from `volume`, which keeps the file compact: it
 * differs for hulls and a few other assembled items, and nothing else.
 */
export function marketTypeEntry(type, packagedVolume) {
  const volume = roundVolume(type.volume);
  const entry = { typeId: type.typeID, name: type.name, marketGroupId: type.marketGroupID, volume };
  if (typeof packagedVolume === 'number' && packagedVolume > 0) {
    const packaged = roundVolume(packagedVolume);
    if (packaged !== volume) entry.packagedVolume = packaged;
  }
  return entry;
}
