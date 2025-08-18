import { GitHubClient } from './github';
import { TreemapRenderer } from './treemap-renderer';
import { computeTreemapLayout } from './d3-wrapper';
import { DEFAULT_CONFIG, DEFAULT_GITHUB_CONFIG } from './constants';

export { GitHubClient } from './github';
export { TreemapRenderer } from './treemap-renderer';
export { computeTreemapLayout } from './d3-wrapper';

export type {
  Repository,
  NormalizedRepository,
  TreemapOptions,
  TreemapConfig,
  GitHubConfig,
} from './types';

export { DEFAULT_CONFIG } from './constants';

/**
 * Main function to generate a GitHub contribution treemap SVG
 */
export async function generateContributionTreemap(
  token: string,
  options: {
    username?: string;
    width?: number;
    height?: number;
    excludeRepos?: string[];
    hideOwners?: string[];
    config?: Partial<import('./types').TreemapConfig>;
    timeoutMs?: number;
    githubBaseUrl?: string;
  } = {}
): Promise<string> {
  const {
    username,
    width = DEFAULT_CONFIG.width,
    height = DEFAULT_CONFIG.height,
    excludeRepos = [],
    hideOwners = [],
    config = {},
    timeoutMs = DEFAULT_GITHUB_CONFIG.timeoutMs,
    githubBaseUrl = DEFAULT_GITHUB_CONFIG.baseUrl,
  } = options;

  // Initialize GitHub client
  const github = new GitHubClient({
    token,
    timeoutMs,
    baseUrl: githubBaseUrl,
  });
  const resolvedUsername = await github.resolveUsername(username);

  // Fetch repository data
  const rawRepos = await github.fetchAllTimeContributedRepositories(resolvedUsername);

  // Normalize and filter repositories
  const normalizedRepos = normalizeRepositories(rawRepos, {
    username: resolvedUsername,
    excludeReposSet: new Set(excludeRepos.map((s) => s.toLowerCase())),
    hideOwnersSet: new Set(hideOwners.map((s) => s.toLowerCase())),
  });

  if (normalizedRepos.length === 0) {
    const renderer = new TreemapRenderer({ ...config, width, height });
    return renderer.render([]);
  }

  // Compute treemap layout
  const layout = computeTreemapLayout(normalizedRepos, width, height);

  // Render SVG
  const renderer = new TreemapRenderer({ ...config, width, height });
  return renderer.render(layout.leaves());
}

/**
 * Helper function to normalize repository data
 */
function normalizeRepositories(
  repos: import('./types').Repository[],
  options: {
    username: string;
    excludeReposSet: Set<string>;
    hideOwnersSet: Set<string>;
  }
): import('./types').NormalizedRepository[] {
  const { username, excludeReposSet, hideOwnersSet } = options;
  const filtered: import('./types').NormalizedRepository[] = [];

  for (const repo of repos) {
    const owner = repo.owner?.login || (repo.nameWithOwner?.split('/')?.[0] ?? '');
    const name = repo.name || (repo.nameWithOwner?.split('/')?.[1] ?? '');
    const nameWithOwner = `${owner}/${name}`;
    const keyName = name.toLowerCase();
    const keyFull = nameWithOwner.toLowerCase();

    if (excludeReposSet.has(keyName) || excludeReposSet.has(keyFull)) continue;
    if (hideOwnersSet.has(owner.toLowerCase())) continue;

    const isOwnedByUser = owner.toLowerCase() === String(username).toLowerCase();
    if (isOwnedByUser) continue;

    filtered.push({
      id: nameWithOwner,
      label: name,
      owner,
      stars: Math.max(0, Number(repo.stargazerCount || 0)),
      contribs: Math.max(0, Number(repo.contribs || 0)),
      isOwnedByUser,
    });
  }

  return filtered;
}
