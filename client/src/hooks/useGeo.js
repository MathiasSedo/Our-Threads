const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

let COUNTRY_NAMES = {};
let CITIES = [];
let CODE_TO_NAME = {};
let NAME_TO_CODE = {};
let loaded = false;
let loadPromise = null;

async function ensureLoaded() {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = fetch('/cities.json')
    .then(r => r.json())
    .then(data => {
      COUNTRY_NAMES = data.countries;
      CITIES = data.cities;
      CODE_TO_NAME = COUNTRY_NAMES;
      for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
        NAME_TO_CODE[name.toLowerCase()] = code;
      }
      loaded = true;
    });
  return loadPromise;
}

// Kick off the load immediately so it's ready by the time the user types
ensureLoaded();

export async function getCountrySuggestions(query) {
  await ensureLoaded();
  const q = query.toLowerCase();
  const names = Object.values(COUNTRY_NAMES);
  const starts = names.filter(n => n.toLowerCase().startsWith(q));
  const contains = names.filter(n => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, 8);
}

const PLACE_TYPES = new Set(['city', 'town', 'village', 'hamlet', 'municipality', 'administrative']);

export async function getCitySuggestions(query, country = '') {
  if (!query || query.length < 2) return [];

  // Quick local results while Nominatim loads
  await ensureLoaded();
  const q = norm(query);
  const cc = country ? NAME_TO_CODE[norm(country)] : null;
  const localOut = [];
  for (const [name, , , code] of CITIES) {
    if (cc && code !== cc) continue;
    if (norm(name).startsWith(q)) {
      localOut.push({ name, countryName: CODE_TO_NAME[code] || code });
      if (localOut.length >= 4) break;
    }
  }

  // Nominatim for full world coverage
  try {
    const params = new URLSearchParams({ q: query, format: 'json', limit: 8, addressdetails: 1 });
    if (country) params.set('countrycodes', cc || country);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { 'User-Agent': 'OurThreads/1.0 (personal contact tracker)' },
    });
    const data = await res.json();
    const seen = new Set(localOut.map(r => norm(r.name)));
    const online = data
      .filter(r => r.address && PLACE_TYPES.has(r.addresstype))
      .map(r => ({
        name: r.address.city || r.address.town || r.address.village || r.address.hamlet || r.name,
        countryName: r.address.country,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
      }))
      .filter(r => r.name && !seen.has(norm(r.name)));
    return [...localOut, ...online].slice(0, 8);
  } catch {
    return localOut;
  }
}

// Returns { lat, lng } for a city in a country, or null if not found
export function lookupCoords(city, country) {
  if (!loaded || !city) return null;
  const q = norm(city);
  const cc = NAME_TO_CODE[norm(country)] || null;
  for (const [name, lat, lng, code] of CITIES) {
    if (norm(name) === q && (!cc || code === cc)) return { lat, lng };
  }
  for (const [name, lat, lng, code] of CITIES) {
    if (norm(name).startsWith(q) && (!cc || code === cc)) return { lat, lng };
  }
  return null;
}

export { CODE_TO_NAME, NAME_TO_CODE };
