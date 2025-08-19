import type { HierarchyNode } from 'd3-hierarchy';

export interface Repository {
  name: string;
  nameWithOwner: string;
  stargazerCount: number;
  isFork: boolean;
  owner: { login: string };
  contribs: number;
}

export interface NormalizedRepository {
  id: string;
  label: string;
  owner: string;
  stars: number;
  contribs: number;
  isOwnedByUser: boolean;
}

export interface TreemapOptions {
  width?: number;
  height?: number;
  excludeRepos?: string[];
  excludeOwners?: string[];
  username?: string;
}

export interface TreemapConfig {
  width: number;
  height: number;
  canvasBg: string;
  accent: string;
  heatMin: string;
  heatMax: string;
  textPrimary: string;
  textSecondary: string;
  fontFamily: string;
}

export interface GitHubConfig {
  token: string;
  username?: string;
  timeoutMs: number;
  baseUrl: string;
}

// Extended D3 hierarchy node with treemap layout properties
export interface TreemapNode extends HierarchyNode<NormalizedRepository> {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
