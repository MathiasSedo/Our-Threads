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

// Blends the colors of a contact's tags (excluding the wedding tag, which stays
// exclusively red) into a single nuance — multiple tags average into a mixed hue.
export function blendTagColor(tags = []) {
  const colors = tags
    .filter(t => t.name !== 'Invite for wedding')
    .map(t => TAG_COLORS[t.name])
    .filter(Boolean);
  if (!colors.length) return null;
  const rgbs = colors.map(hexToRgb);
  const sum = rgbs.reduce((a, c) => ({ r: a.r + c.r, g: a.g + c.g, b: a.b + c.b }), { r: 0, g: 0, b: 0 });
  return rgbToHex(sum.r / rgbs.length, sum.g / rgbs.length, sum.b / rgbs.length);
}
