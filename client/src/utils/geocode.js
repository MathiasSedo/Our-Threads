import { lookupCoords } from '../hooks/useGeo.js';

// Local-first geocoding — no network needed.
// Returns [{ lat, lng, name }] (array for API-compat with callers that handle multiple candidates)
export async function geocodeCandidates(city, country) {
  const coords = lookupCoords(city, country);
  if (!coords) return [];
  return [{ ...coords, name: city }];
}

export async function geocode(city, country) {
  const coords = lookupCoords(city, country);
  return coords || null;
}
