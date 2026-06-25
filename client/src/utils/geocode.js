const COUNTRY_ALIASES = {
  uae: 'united arab emirates',
  usa: 'united states',
  us: 'united states',
  uk: 'united kingdom',
  turkiye: 'turkey',
};

// Geocoding APIs often return formal/official names ("Republic of Türkiye",
// "Kingdom of the Netherlands") instead of the everyday name people type —
// strip these so "Turkey" still matches.
const COUNTRY_PREFIXES = [
  "people's republic of ", 'democratic republic of ', 'federal republic of ',
  'republic of ', 'kingdom of ', 'state of ', 'commonwealth of ', 'the ',
];

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalizeCountry(name) {
  let n = stripDiacritics(name?.trim().toLowerCase() || '');
  for (const prefix of COUNTRY_PREFIXES) {
    if (n.startsWith(prefix)) { n = n.slice(prefix.length); break; }
  }
  return COUNTRY_ALIASES[n] || n;
}

// Returns every geocoding match whose country matches what was typed —
// there can be more than one place with the same city name in the same
// country (e.g. multiple "Sfântu Gheorghe"s in Romania), so callers that
// care about precision should let the person pick among these rather than
// silently taking the first result.
export async function geocodeCandidates(city, country) {
  try {
    const q = encodeURIComponent(city);
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=20&language=en`);
    const data = await res.json();
    const results = data.results || [];
    const target = normalizeCountry(country);
    return results
      .filter(r => normalizeCountry(r.country) === target)
      .map(r => ({
        lat: r.latitude,
        lng: r.longitude,
        name: r.name,
        admin1: r.admin1,
        admin2: r.admin2,
        country: r.country,
      }));
  } catch {
    return [];
  }
}

export async function geocode(city, country) {
  const candidates = await geocodeCandidates(city, country);
  return candidates[0] ? { lat: candidates[0].lat, lng: candidates[0].lng } : null;
}
