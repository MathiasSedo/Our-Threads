export const TAG_COLORS = {
  Visit: '#7fa05f',
  Work: '#c8893a',
  Family: '#c15039',
};

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const c = v => Math.round(v).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Screen blend, per channel — mixes colors as overlapping light rather than
// paint, so combinations stay luminous instead of muddying toward gray.
function screen(a, b) {
  return 255 - ((255 - a) * (255 - b)) / 255;
}

// Blends the colors of a contact's tags (excluding the wedding tag, which stays
// exclusively red) into a single nuance — multiple tags glow together like
// overlapping washes of light rather than averaging like paint.
export function blendTagColor(tags = []) {
  const colors = tags
    .filter(t => t.name !== 'Invite for wedding')
    .map(t => TAG_COLORS[t.name])
    .filter(Boolean);
  if (!colors.length) return null;
  if (colors.length === 1) return colors[0];
  const rgbs = colors.map(hexToRgb);
  const mixed = rgbs.reduce((a, c) => ({
    r: screen(a.r, c.r),
    g: screen(a.g, c.g),
    b: screen(a.b, c.b),
  }));
  return rgbToHex(mixed.r, mixed.g, mixed.b);
}
