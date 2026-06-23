const STORAGE_KEY = 'rw_favourites';

export function getFavourites() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

export function isFavourite(stationId) {
  return getFavourites().some(s => s.id === stationId);
}

// Returns true if the station was added, false if it was removed.
export function toggleFavourite(station) {
  const favs = getFavourites();
  const idx  = favs.findIndex(s => s.id === station.id);
  if (idx >= 0) {
    favs.splice(idx, 1);
  } else {
    favs.push(station);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
  return idx < 0;
}
