// EVE type icons for PI commodities and planet types, loaded from the EVE image server
// (needs network). The scratchpad original embedded every icon as a data URI (825 KB).
window.PLANET_TYPE_ID = { temperate: 11, ice: 12, gas: 13, oceanic: 2014, lava: 2015, barren: 2016, storm: 2017, plasma: 2063 };
window.iconFor = function (id) {
  return id ? 'https://images.evetech.net/types/' + id + '/icon?size=64' : '';
};
window.planetIcon = function (t) {
  return window.iconFor(window.PLANET_TYPE_ID[t]);
};
