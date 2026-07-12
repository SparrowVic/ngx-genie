/** Colour palette (per node type) for the constellation canvas renderer. */
export const CONSTELLATION_THEME = {
  bg: '#020617',
  grid: 'rgba(30, 41, 59, 0.4)',
  injector: {
    color: '#06b6d4',
    glow: '#22d3ee',
    shape: 'hex'
  },
  service: {color: '#60a5fa', glow: '#93c5fd'},
  system: {color: '#f472b6', glow: '#fbcfe8'},
  value: {color: '#2dd4bf', glow: '#99f6e4'},
  observable: {color: '#e879f9', glow: '#f5d0fe'},
  signal: {color: '#fbbf24', glow: '#fcd34d'},
  token: {color: '#94a3b8', glow: '#cbd5e1'},
  component: {color: '#c084fc', glow: '#d8b4fe'},
  directive: {color: '#a3e635', glow: '#bef264'},
  pipe: {color: '#fb923c', glow: '#fdba74'},

  root: {
    color: '#10b981',
    glow: '#34d399'
  },
  links: {
    base: 'rgba(71, 85, 105, 0.2)',
    active: '#38bdf8',
  }
};
