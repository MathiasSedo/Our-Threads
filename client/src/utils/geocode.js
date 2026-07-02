import { lookupCoords } from '../hooks/useGeo.js';

// Local-first, then Nominatim (OpenStreetMap) as fallback — covers any city worldwide.
export async function geocodeCandidates(city, country) {
  if (!city) return [];

  // Try local dataset first (instant, no network)
  const local = lookupCoords(city, country);
  if (local) return [{ ...local, name: city }];

  // Fall back to Nominatim
  try {
    const params = new URLSearchParams({ city, format: 'json', limit: 3, addressdetails: 1 });
    if (country) params.set('country', country);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'OurThreads/1.0 (personal contact tracker)' },
    });
    const data = await res.json();
    if (data.length > 0) {
      return data.map(r => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        name: r.address?.city || r.address?.town || r.address?.village || city,
      }));
    }
  } catch {}

  return [];
}

export async function geocode(city, country) {
  const candidates = await geocodeCandidates(city, country);
  return candidates[0] ?? null;
}
