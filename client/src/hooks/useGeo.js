import citiesData from '../data/cities.json';

const { countries: COUNTRY_NAMES, cities: CITIES } = citiesData;

// Reverse lookup: code → name
const CODE_TO_NAME = COUNTRY_NAMES;
// Forward lookup: lowercase name → code
const NAME_TO_CODE = {};
for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
  NAME_TO_CODE[name.toLowerCase()] = code;
}

export function getCountrySuggestions(query) {
  const q = query.toLowerCase();
  const names = Object.values(COUNTRY_NAMES);
  const starts = names.filter(n => n.toLowerCase().startsWith(q));
  const contains = names.filter(n => !n.toLowerCase().startsWith(q) && n.toLowerCase().includes(q));
  return Promise.resolve([...starts, ...contains].slice(0, 8));
}

export function getCitySuggestions(query, country = '') {
  if (!query || query.length < 2) return Promise.resolve([]);
  const q = query.toLowerCase();
  const cc = country ? NAME_TO_CODE[country.toLowerCase()] : null;

  const matches = [];
  for (const [name, , , code] of CITIES) {
    if (cc && code !== cc) continue;
    const nl = name.toLowerCase();
    if (nl.startsWith(q)) matches.push([0, name]);
    else if (nl.includes(q)) matches.push([1, name]);
    if (matches.length >= 60) break;
  }

  matches.sort((a, b) => a[0] - b[0]);
  const seen = new Set();
  const out = [];
  for (const [, name] of matches) {
    if (!seen.has(name)) { seen.add(name); out.push(name); }
    if (out.length >= 8) break;
  }
  return Promise.resolve(out);
}

// Returns { lat, lng } for a city in a country, or null if not found
export function lookupCoords(city, country) {
  const q = city.toLowerCase();
  const cc = NAME_TO_CODE[country?.toLowerCase()] || null;
  for (const [name, lat, lng, code] of CITIES) {
    if (name.toLowerCase() === q && (!cc || code === cc)) return { lat, lng };
  }
  // Fuzzy fallback: startsWith
  for (const [name, lat, lng, code] of CITIES) {
    if (name.toLowerCase().startsWith(q) && (!cc || code === cc)) return { lat, lng };
  }
  return null;
}

export { CODE_TO_NAME, NAME_TO_CODE };
