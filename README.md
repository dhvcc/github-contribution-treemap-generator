# GitHub Contribution Treemap Generator

<div align="center">
  <img src="./treemap.svg" />
</div>

GitHub contributions as an SVG treemap. Built with [d3](https://github.com/d3/d3)

It counts merged PRs you authored across repos, sizes by your contributions, and colors by repo stars.

## Install

```bash
npm i -g @dhvcc/github-contribution-treemap-generator
# for project install, use
npm i @dhvcc/github-contribution-treemap-generator
```

## Quick start (CLI)

```bash
export GITHUB_TOKEN=YOUR_TOKEN
github-contribution-treemap-generator -o treemap.svg
```

- Without `-o`, SVG goes to stdout
- If you don't pass `--username`, it auto-detects from the token

## Usage

```man
Usage: github-contribution-treemap-generator [options]

GitHub contribution treemap SVG generator

Options:
  -V, --version              output the version number
  -t, --token <token>        GitHub personal access token (env: GITHUB_TOKEN)
  -u, --username <username>  GitHub username (auto-detected if not provided) (env: GITHUB_USERNAME)
  -o, --output <file>        Output file path (default: stdout)
  -w, --width <pixels>       SVG width in pixels (default: 465, env: WIDTH)
  --height <pixels>          SVG height in pixels (default: 165, env: HEIGHT)
  --exclude-repos <repos>    Comma-separated list of repos to exclude (default: none) (default: "", env: EXCLUDE_REPOS)
  --exclude-owners <owners>  Comma-separated list of owners to hide (default: none) (default: "", env: EXCLUDE_OWNERS)
  --timeout <ms>             GitHub API timeout in milliseconds (default: 15000, env: GITHUB_TIMEOUT_MS)
  --github-base-url <url>    GitHub GraphQL API base URL (default: "https://api.github.com/graphql", env: GITHUB_BASE_URL)
  -q, --quiet                Suppress non-error logs
  -h, --help                 display help for command

Environment variables:
  GITHUB_TOKEN           Required unless --token is provided
  GITHUB_USERNAME        Username, otherwise auto-detected from token
  EXCLUDE_REPOS          Comma-separated repos to exclude (default: none)
  EXCLUDE_OWNERS            Comma-separated owners to hide (default: none)
  WIDTH                  SVG width in pixels (default 465)
  HEIGHT                 SVG height in pixels (default 165)
  GITHUB_TIMEOUT_MS      GitHub API timeout in ms (default 15000)
  GITHUB_BASE_URL        GitHub GraphQL API base URL (default https://api.github.com/graphql)
  QUIET=1                Suppress non-error logs

```

## Examples

```bash
# Save to file
github-contribution-treemap-generator -t $GITHUB_TOKEN -o treemap.svg

# Custom size
github-contribution-treemap-generator -t $GITHUB_TOKEN -w 800 --height 400 -o treemap.svg

# Hide my org and exclude a repo
github-contribution-treemap-generator -t $GITHUB_TOKEN -H my-org -e owner/repo,another-repo -o treemap.svg

# Print to stdout (pipe to file)
github-contribution-treemap-generator -t $GITHUB_TOKEN > treemap.svg
```

## Use as a library

```ts
import { generateContributionTreemap } from '@dhvcc/github-contribution-treemap-generator';

const svg = await generateContributionTreemap(process.env.GITHUB_TOKEN!, {
  username: 'your-username',
  width: 800,
  height: 400,
  excludeRepos: ['owner/repo', 'name-only'],
  hideOwners: ['some-org'],
});
```

## Notes

- Public data only. A basic token is fine for public repos
- Uses GitHub GraphQL search for merged PRs you authored (`is:pr is:merged author:<you>`)
