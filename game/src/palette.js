// Tidebreak Harbor — night container-port palette. One place owns every colour:
// deep rain navy, wet asphalt, container rust, crane amber, signal teal and red.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#070d18',
  surface: '#0e1622',
  hairline: '#1d2a3a',
  ink: '#dfe8ef',
  muted: '#7d93a6',
  accent: '#ffb02e',
  teal: '#2ec8b8',
  rust: '#b4502e',
  red: '#ff4d3d',
  green: '#46d17c',
  water: '#0a2436',
};

export function shade(name) {
  return PALETTE[name];
}
