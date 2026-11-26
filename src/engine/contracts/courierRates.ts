export function iskPerVolume(reward: number, volume: number): number | null {
  if (!(volume > 0)) return null;
  return reward / volume;
}

export function iskPerJump(reward: number, jumps: number | null): number | null {
  if (jumps === null) return null;
  return reward / Math.max(jumps, 1);
}

export function collateralToRewardRatio(collateral: number, reward: number): number | null {
  if (!(reward > 0)) return null;
  return collateral / reward;
}

export function rewardPerVolumeJump(
  reward: number,
  volume: number,
  jumps: number | null
): number | null {
  if (!(volume > 0)) return null;
  const perJump = iskPerJump(reward, jumps);
  return perJump === null ? null : perJump / volume;
}
