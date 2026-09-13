/**
 * The systems a hauler is most likely to be killed in.
 *
 * A gank chokepoint is not a property of security status — it is a property of
 * *traffic*. These are the systems every profitable route funnels through,
 * which is what makes camping them worth doing. The community names them; the
 * map does not imply them. So this is a short, explicit list rather than a
 * rule, because anything claiming to *derive* it would be inventing a judgement
 * the data does not contain.
 *
 * Security status is exactly why the list is needed rather than sufficient:
 * Uedama reads 0.505 and Balle 0.461, so both show as 0.5 systems and neither
 * stands out from the hundreds of other 0.5s a route may cross. "Crosses a 0.5
 * system" and "crosses Uedama" are different warnings, and only the second is
 * one a freighter pilot acts on.
 *
 * **Not** on the list, deliberately:
 * - **Niarja**, which every older guide names. It was moved into Pochven in
 *   2020 and reads -1.0 in the current SDE, so it is not a highsec chokepoint
 *   any more — that traffic is what made Uedama what it is.
 * - **Perimeter** and **Hatakani**, where the ganking is aimed at bling ships
 *   undocking near Jita rather than at anything crossing on a courier route.
 */

/** System id to the name shown, so a caller never has to resolve it again. */
export const GANK_CHOKEPOINTS: ReadonlyMap<number, string> = new Map([
  // Highsec gank gates. Every one shows as a 0.5 or 0.6 system, which is the
  // lowest CONCORD response in highsec and therefore the cheapest place in
  // empire to kill a freighter.
  //
  // The Citadel, on the Jita-to-Amarr run — the busiest freighter route in the
  // game since Niarja left highsec, and the single most dangerous system in it.
  [30002768, 'Uedama'],
  // The Citadel, one jump earlier on the same run, where a camp catches a
  // hauler that was watching Uedama.
  [30002765, 'Sivala'],
  // Sinq Laison, on the Jita-to-Rens run.
  [30002641, 'Aufay'],
  // Sinq Laison, the junction toward Hek.
  [30002634, 'Balle'],

  // Lowsec camps that sit on trade pipes rather than out of the way — the
  // difference between a lowsec system and one a hauler will actually meet.
  //
  // Black Rise, on the Caldari-Gallente pipe, camped more or less permanently.
  [30002813, 'Tama'],
  // Sinq Laison, the lowsec shortcut between Jita and Hek.
  [30002718, 'Rancer'],
  // Genesis, the chokepoint between Amarr and Gallente space.
  [30005196, 'Ahbazon'],
]);

export function isGankChokepoint(systemId: number | null): boolean {
  return systemId !== null && GANK_CHOKEPOINTS.has(systemId);
}

/** Which of them a route runs through, named, in the order they are flown. */
export function chokepointsOnRoute(systemIds: readonly number[]): string[] {
  const names: string[] = [];
  for (const systemId of systemIds) {
    const name = GANK_CHOKEPOINTS.get(systemId);
    if (name !== undefined) names.push(name);
  }
  return names;
}
