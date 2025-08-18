import type { Repository, GitHubConfig } from './types';

export class GitHubClient {
  private token: string;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: GitHubConfig) {
    this.token = config.token;
    this.timeoutMs = config.timeoutMs;
    this.baseUrl = config.baseUrl;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const maxAttempts = 3;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.token}`,
            'User-Agent': 'github-contribution-treemap-generator',
          },
          body: JSON.stringify({ query, variables }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          // Retry on transient server errors
          if (response.status >= 500 && response.status < 600 && attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, attempt * 500));
            continue;
          }
          throw new Error(`GitHub GraphQL error ${response.status}: ${text}`);
        }

        const data = await response.json();
        if (data.errors) {
          // Do not retry on GraphQL semantic errors
          throw new Error('GitHub GraphQL errors: ' + JSON.stringify(data.errors));
        }

        return data.data;
      } catch (err) {
        clearTimeout(timeout);
        lastError = err;
        // Retry on abort/network only
        const name = (err as any)?.name;
        if ((name === 'AbortError' || name === 'FetchError') && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, attempt * 500));
          continue;
        }
        break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async resolveUsername(username?: string): Promise<string> {
    if (username) return username;

    const data = await this.graphql<{ viewer: { login: string } }>(
      `query ViewerLogin { viewer { login } }`
    );

    return data.viewer.login;
  }

  async searchRepositoriesByPRs(query: string): Promise<Repository[]> {
    const repos: Repository[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;

    while (hasNextPage && repos.length < 1200) {
      type SearchResponse = {
        search: {
          nodes: Array<{
            repository?: {
              name: string;
              nameWithOwner: string;
              stargazerCount: number;
              isFork: boolean;
              owner: { login: string };
            };
          }>;
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      };

      const data: SearchResponse = await this.graphql<SearchResponse>(
        `query SearchPRs($q: String!, $first: Int!, $after: String) {
          search(query: $q, type: ISSUE, first: $first, after: $after) {
            nodes {
              ... on PullRequest {
                repository {
                  name
                  nameWithOwner
                  stargazerCount
                  isFork
                  owner { login }
                }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        { q: query, first: 100, after: cursor }
      );

      const page = data.search;

      for (const node of page.nodes || []) {
        const repo = node?.repository;
        if (!repo || repo.isFork) continue;

        // Create a complete Repository object with contribs
        const completeRepo: Repository = {
          ...repo,
          contribs: 1, // Each PR counts as 1 contribution
        };

        repos.push(completeRepo);
      }

      hasNextPage = page.pageInfo?.hasNextPage || false;
      cursor = page.pageInfo?.endCursor || null;
    }

    return repos;
  }

  async fetchAllTimeContributedRepositories(username: string): Promise<Repository[]> {
    const authoredQuery = `is:pr is:merged author:${username}`;
    const authored = await this.searchRepositoriesByPRs(authoredQuery);

    const byRepo = new Map<string, Repository>();

    for (const repo of authored) {
      const owner = repo.owner?.login || (repo.nameWithOwner?.split('/')?.[0] ?? '');
      const name = repo.name || (repo.nameWithOwner?.split('/')?.[1] ?? '');
      const key = `${owner}/${name}`.toLowerCase();

      const existing = byRepo.get(key);
      if (existing) {
        existing.contribs += 1;
      } else {
        byRepo.set(key, {
          name,
          nameWithOwner: `${owner}/${name}`,
          stargazerCount: repo.stargazerCount || 0,
          isFork: repo.isFork || false,
          owner: { login: owner },
          contribs: 1,
        });
      }
    }

    return Array.from(byRepo.values());
  }
}
