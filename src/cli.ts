#!/usr/bin/env node

import { Command, Option, InvalidOptionArgumentError } from 'commander';
import { generateContributionTreemap } from './index.js';
import { writeFileSync } from 'fs';
import process from 'node:process';
import { createRequire } from 'node:module';
import { DEFAULT_CONFIG, DEFAULT_GITHUB_CONFIG } from './constants.js';

const require = createRequire(import.meta.url);
let pkgVersion = process.env.npm_package_version;
try {
  if (!pkgVersion) {
    // Resolve package version at runtime from package.json included in the published package
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../package.json');
    pkgVersion = pkg.version;
  }
} catch {}
const VERSION = pkgVersion || '0.0.0';

// Parsers
const parsePositiveInt = (value: string): number => {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) throw new InvalidOptionArgumentError(`Invalid positive integer: ${value}`);
  return n;
};

const parseList = (value: string): string[] => {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

async function main() {
  const program = new Command();

  program
    .name('github-contribution-treemap-generator')
    .description('GitHub contribution treemap SVG generator')
    .version(VERSION)
    .addOption(new Option('-t, --token <token>', 'GitHub personal access token').env('GITHUB_TOKEN'))
    .addOption(new Option('-u, --username <username>', 'GitHub username (auto-detected if not provided)').env('GITHUB_USERNAME'))
    .addOption(new Option('-o, --output <file>', 'Output file path (default: stdout)'))
    .addOption(
      new Option('-w, --width <pixels>', 'SVG width in pixels')
        .env('WIDTH')
        .default(DEFAULT_CONFIG.width)
        .argParser(parsePositiveInt)
    )
    .addOption(
      new Option('--height <pixels>', 'SVG height in pixels')
        .env('HEIGHT')
        .default(DEFAULT_CONFIG.height)
        .argParser(parsePositiveInt)
    )
    .addOption(new Option('-e, --exclude-repos <repos>', 'Comma-separated list of repos to exclude (default: none)').env('EXCLUDE_REPOS').default('').argParser(parseList))
    .addOption(new Option('-H, --hide-owners <owners>', 'Comma-separated list of owners to hide (default: none)').env('HIDE_OWNERS').default('').argParser(parseList))
    .addOption(
      new Option('--timeout <ms>', 'GitHub API timeout in milliseconds')
        .env('GITHUB_TIMEOUT_MS')
        .default(DEFAULT_GITHUB_CONFIG.timeoutMs)
        .argParser(parsePositiveInt)
    )
    .addOption(new Option('--github-base-url <url>', 'GitHub GraphQL API base URL').env('GITHUB_BASE_URL').default(DEFAULT_GITHUB_CONFIG.baseUrl))
    .addOption(new Option('-v, --verbose', 'Enable verbose logs').conflicts('quiet'))
    .addOption(new Option('-q, --quiet', 'Suppress non-error logs').conflicts('verbose'))
    .addHelpText(
      'after',
      `\nEnvironment variables:\n  GITHUB_TOKEN           Required unless --token is provided\n  GITHUB_USERNAME        Username, otherwise auto-detected from token\n  EXCLUDE_REPOS          Comma-separated repos to exclude (default: none)\n  HIDE_OWNERS            Comma-separated owners to hide (default: none)\n  WIDTH                  SVG width in pixels (default ${DEFAULT_CONFIG.width})\n  HEIGHT                 SVG height in pixels (default ${DEFAULT_CONFIG.height})\n  GITHUB_TIMEOUT_MS      GitHub API timeout in ms (default ${DEFAULT_GITHUB_CONFIG.timeoutMs})\n  GITHUB_BASE_URL        GitHub GraphQL API base URL (default ${DEFAULT_GITHUB_CONFIG.baseUrl})\n  VERBOSE=1              Enable verbose logs\n  QUIET=1                Suppress non-error logs\n  DEBUG=1                Alias for verbose`
    )
    .showHelpAfterError()
    .showSuggestionAfterError();

  program.parse();
  const options = program.opts() as {
    token?: string;
    username?: string;
    output?: string;
    width: number;
    height: number;
    excludeRepos: string[] | string;
    hideOwners: string[] | string;
    timeout: number;
    githubBaseUrl: string;
    verbose?: boolean;
    quiet?: boolean;
  };

  // Env toggles for booleans (commander doesn't map these by default)
  if (!options.verbose && (process.env.DEBUG === '1' || process.env.VERBOSE === '1')) options.verbose = true;
  if (!options.quiet && process.env.QUIET === '1') options.quiet = true;

  // Normalize arrays (parser ensures array or empty)
  const excludeRepos: string[] = Array.isArray(options.excludeRepos)
    ? options.excludeRepos
    : (options.excludeRepos ? parseList(String(options.excludeRepos)) : []);
  const hideOwners: string[] = Array.isArray(options.hideOwners)
    ? options.hideOwners
    : (options.hideOwners ? parseList(String(options.hideOwners)) : []);

  if (!options.token) {
    console.error('❌ GitHub token is required');
    console.error('');
    console.error('Provide it via:');
    console.error('  - CLI option: --token <your_token>');
    console.error('  - Environment variable: GITHUB_TOKEN');
    console.error('');
    console.error('Run with --help for more information');
    process.exit(1);
  }

  try {
    if (!options.quiet) console.log('🚀 Generating GitHub contribution treemap...');

    if (!options.quiet) {
      if (options.username) console.log(`👤 Username: ${options.username}`);
      else console.log('👤 Username: auto-detecting from token...');

      if (options.width !== DEFAULT_CONFIG.width || options.height !== DEFAULT_CONFIG.height) {
        console.log(`📏 Dimensions: ${options.width}x${options.height}px`);
      }

      if (excludeRepos.length > 0) console.log(`🚫 Excluding repos: ${excludeRepos.join(', ')}`);
      if (hideOwners.length > 0) console.log(`🚫 Hiding owners: ${hideOwners.join(', ')}`);

      if (options.output) console.log(`📁 Output file: ${options.output}`);
      else console.log('📁 Output: stdout');

      if (options.timeout) console.log(`⏱️ Timeout: ${options.timeout}ms`);
      if (options.githubBaseUrl !== DEFAULT_GITHUB_CONFIG.baseUrl) console.log(`🌐 GitHub API: ${options.githubBaseUrl}`);
    }

    const svg = await generateContributionTreemap(options.token, {
      username: options.username,
      width: options.width,
      height: options.height,
      excludeRepos,
      hideOwners,
      timeoutMs: options.timeout,
      githubBaseUrl: options.githubBaseUrl,
    });

    if (options.output) {
      writeFileSync(options.output, svg, 'utf8');
      if (!options.quiet) console.log(`\n✅ Treemap saved to: ${options.output}`);
    } else {
      process.stdout.write(svg);
      if (!options.quiet) console.log('\n✅ Treemap generated successfully!');
    }
  } catch (error) {
    const err = error as unknown as { name?: string; message?: string };
    if (err?.name === 'AbortError') {
      console.error(`\n❌ Timed out while contacting GitHub. Try increasing --timeout or set GITHUB_TIMEOUT_MS.`);
    } else if (err?.message?.includes('401')) {
      console.error('\n❌ Unauthorized from GitHub. Check your GITHUB_TOKEN and its scopes.');
    } else {
      console.error('\n❌ Error generating treemap:', err?.message || error);
    }
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
