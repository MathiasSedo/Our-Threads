const COUNTRY_ALIASES = {
  uae: 'united arab emirates',
  usa: 'united states',
  us: 'united states',
  uk: 'united kingdom',
};

function normalizeCountry(name) {
  const n = name?.trim().toLowerCase() || '';
  return COUNTRY_ALIASES[n] || n;
}

export async function geocode(city, country) {
  try {
    const q = encodeURIComponent(city);
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=10`);
    const data = await res.json();
    const results = data.results || [];
    const target = normalizeCountry(country);
    // Only accept a result whose country actually matches what was typed —
    // never fall back to "closest city" if the country doesn't line up.
    const match = results.find(r => normalizeCountry(r.country) === target);
    if (match) return { lat: match.latitude, lng: match.longitude };
  } catch {}
  return null;
}
