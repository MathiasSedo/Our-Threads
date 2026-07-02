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

export async function getCitySuggestions(query, country = '') {
  if (!query || query.length < 2) return [];
  await ensureLoaded();
  const q = norm(query);
  const cc = country ? NAME_TO_CODE[norm(country)] : null;

  const matches = [];
  for (const [name, , , code] of CITIES) {
    if (cc && code !== cc) continue;
    const nl = norm(name);
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
  return out;
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
