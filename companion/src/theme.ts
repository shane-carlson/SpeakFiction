export type ThemeMode = 'light' | 'dark';

export type ThemeId =
  | 'fantasy'
  | 'literary'
  | 'litrpg'
  | 'sci-fi'
  | 'thriller'
  | 'mystery'
  | 'romance'
  | 'romantasy'
  | 'queer-lit'
  | 'horror'
  | 'ya'
  | 'generic';

export const DEFAULT_THEME_MODE: ThemeMode = 'dark';
export const DEFAULT_THEME_ID: ThemeId = 'fantasy';

export interface ThemeColors {
  bg: string;
  bgElev: string;
  bgElev2: string;
  bgInput: string;
  border: string;
  text: string;
  textDim: string;
  textFaint: string;
  accent: string;
  accent2: string;
  accentDeep: string;
  onAccent: string;
  good: string;
  warn: string;
  danger: string;
}

const DARK = {
  bg: '#0e1016',
  bgElev: '#161a24',
  bgElev2: '#1e2431',
  bgInput: '#10141d',
  border: '#262d3d',
  text: '#e8ecf4',
  textDim: '#9aa4b8',
  textFaint: '#6b7488',
  onAccent: '#ffffff',
  good: '#34d399',
  warn: '#fbbf24',
  danger: '#f87171',
} as const;

const LIGHT = {
  bg: '#f3efe6',
  bgElev: '#fffcf7',
  bgElev2: '#eee8dc',
  bgInput: '#ffffff',
  border: '#ddd4c6',
  text: '#1c1915',
  textDim: '#5c564c',
  textFaint: '#8a8276',
  onAccent: '#ffffff',
  good: '#059669',
  warn: '#b45309',
  danger: '#dc2626',
} as const;

const ACCENTS: Record<ThemeId, { accent: string; accent2: string; accentDeep: string; name: string }> = {
  fantasy: { accent: '#7c5cff', accent2: '#22d3ee', accentDeep: '#6a48f5', name: 'Fantasy' },
  literary: { accent: '#b08d57', accent2: '#6f8f86', accentDeep: '#8b6914', name: 'Literary' },
  litrpg: { accent: '#22c55e', accent2: '#fbbf24', accentDeep: '#15803d', name: 'LitRPG' },
  'sci-fi': { accent: '#38bdf8', accent2: '#818cf8', accentDeep: '#0284c7', name: 'Sci-Fi' },
  thriller: { accent: '#f43f5e', accent2: '#94a3b8', accentDeep: '#be123c', name: 'Thriller' },
  mystery: { accent: '#14b8a6', accent2: '#c9a227', accentDeep: '#0f766e', name: 'Mystery' },
  romance: { accent: '#f472b6', accent2: '#fb7185', accentDeep: '#db2777', name: 'Romance' },
  romantasy: { accent: '#c084fc', accent2: '#fb7185', accentDeep: '#7e22ce', name: 'Romantasy' },
  'queer-lit': { accent: '#ff2d55', accent2: '#00e5ff', accentDeep: '#5b4dff', name: 'Queer Lit' },
  horror: { accent: '#ef4444', accent2: '#a8a29e', accentDeep: '#991b1b', name: 'Horror' },
  ya: { accent: '#ff5a9a', accent2: '#b8ff2e', accentDeep: '#c44dff', name: 'YA' },
  generic: { accent: '#818cf8', accent2: '#22d3ee', accentDeep: '#4f46e5', name: 'General' },
};

export const THEME_LIST = (Object.keys(ACCENTS) as ThemeId[]).map((id) => ({
  id,
  name: ACCENTS[id].name,
  accent: ACCENTS[id].accent,
}));

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return Boolean(value && value in ACCENTS);
}

export function isThemeMode(value: string | null | undefined): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function resolveColors(mode: ThemeMode, themeId: ThemeId): ThemeColors {
  const neutrals = mode === 'light' ? LIGHT : DARK;
  return { ...neutrals, ...ACCENTS[themeId] };
}
