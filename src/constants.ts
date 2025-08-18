import type { TreemapConfig, GitHubConfig } from './types';

export const DEFAULT_CONFIG: TreemapConfig = {
  width: 465,
  height: 165,
  canvasBg: '#21232A',
  accent: '#58BCDA',
  heatMin: '#31343C',
  heatMax: '#58BCDA',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.75)',
  fontFamily: "'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif",
};

export const DEFAULT_GITHUB_CONFIG: Omit<GitHubConfig, 'token'> = {
  baseUrl: 'https://api.github.com/graphql',
  timeoutMs: 15000,
};

export const FONT_SIZES = {
  MIN: 6,
  GAP: 3,
  NAME_DESIRED: 16,
  OWNER_RATIO: 0.75,
  STARS_RATIO: 0.9,
} as const;

export const LAYOUT = {
  PADDING: 4,
  INNER_PADDING: 2,
} as const;
