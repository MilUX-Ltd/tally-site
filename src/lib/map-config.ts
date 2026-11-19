// Map settings shared by the map component and tests.

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

// Exactly the tile source's own attribution, so the map shows it once even
// before (or without) the tile source loading.
export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">&copy; OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

/** West, south, east, north: the UK with Northern Ireland and Shetland. */
export const UK_BOUNDS: [number, number, number, number] = [-8.7, 49.8, 1.9, 60.9];

export const FONT = ['Noto Sans Regular'];
