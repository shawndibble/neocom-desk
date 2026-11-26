/** A cargo hold copied from the EVE client: Name<TAB>quantity, salvage plus ore so refining matters. */
export const LOOT = [
  ['Veldspar', 38000],
  ['Scordite', 21400],
  ['Pyroxeres', 9600],
  ['Plagioclase', 7300],
  ['Kernite', 2900],
  ['Melted Capacitor Console', 124],
  ['Damaged Artificial Neural Network', 46],
  ['Tripped Power Circuit', 212],
  ['Burned Logic Circuit', 68],
  ['Contaminated Nanite Compound', 39],
  ['Alloyed Tritanium Bar', 905],
  ['Conductive Polymer', 77],
  ['Charred Micro Circuit', 95],
  ['Smashed Trigger Unit', 31],
  ['Ward Console', 18],
  ['Broken Drone Transceiver', 54],
]
  .map(([name, qty]) => `${name}\t${qty}`)
  .join('\n');
