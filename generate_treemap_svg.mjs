// Minimal native Node.js script to generate a treemap SVG of a user's contributed repositories
// Usage:
//   node scripts/generate_treemap_svg.mjs > treemap.svg
// Env:
//   GITHUB_TOKEN (required)
//   GITHUB_USERNAME (optional)
//   EXCLUDE_REPOS=comma,separated     // names or nameWithOwner; case-insensitive
//   HIDE_OWNERS=comma,separated       // owners to exclude entirely

import { hierarchy, treemap, treemapBinary } from 'd3-hierarchy';

const WIDTH = 465;
const HEIGHT = 165;
const CANVAS_BG = '#21232A';
const ACCENT = '#58BCDA';
const HEAT_MIN = '#31343C';
const HEAT_MAX = '#58BCDA';
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = 'rgba(255,255,255,0.75)';
const FONT_FAMILY = "'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif";

function readBooleanEnv(name, defaultValue = false) {
	const value = process.env[name];
	if (value == null) return defaultValue;
	return String(value).toLowerCase() === 'true' || value === '1' || value === '';
}

function parseCsvSet(name) {
	const raw = process.env[name];
	if (!raw) return new Set();
	return new Set(
		raw
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
			.map((s) => s.toLowerCase())
	);
}

function escapeXml(s) {
	return String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function formatStars(n) {
	if (n < 1000) return String(n);
	if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
	if (n < 1000000) return Math.round(n / 100) / 10 + 'k';
	return (Math.round((n / 1000000) * 10) / 10).toString() + 'm';
}

// Rough text width estimate for font sizing; assumes average width factor
function estimateTextWidth(text, fontSizePx) {
	const avgWidthFactor = 0.6; // average Latin char width ~0.55-0.65 of font size
	return text.length * fontSizePx * avgWidthFactor;
}

function chooseFontSizeToFit(text, maxWidthPx, desiredPx, minPx) {
	let size = Math.min(desiredPx, 48);
	size = Math.max(size, minPx);
	// Shrink if needed
	while (size > minPx && estimateTextWidth(text, size) > maxWidthPx) {
		size -= 1;
	}
	if (estimateTextWidth(text, size) > maxWidthPx) return 0; // cannot fit
	return size;
}

function truncateWithEllipsis(text, maxWidthPx, fontSizePx) {
	if (estimateTextWidth(text, fontSizePx) <= maxWidthPx) return text;
	if (maxWidthPx <= 0) return '';
	const ellipsis = '…';
	let left = 0;
	let right = text.length;
	let best = '';
	while (left <= right) {
		const mid = Math.floor((left + right) / 2);
		const candidate = text.slice(0, mid) + ellipsis;
		if (estimateTextWidth(candidate, fontSizePx) <= maxWidthPx) {
			best = candidate;
			left = mid + 1;
		} else {
			right = mid - 1;
		}
	}
	return best || ellipsis;
}

async function githubGraphQL(query, variables, token) {
	const res = await fetch('https://api.github.com/graphql', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ query, variables }),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(`GitHub GraphQL error ${res.status}: ${text}`);
	}
	const data = await res.json();
	if (data.errors) {
		throw new Error('GitHub GraphQL errors: ' + JSON.stringify(data.errors));
	}
	return data.data;
}

async function resolveUsername(token, usernameMaybe) {
	if (usernameMaybe) return usernameMaybe;
	const data = await githubGraphQL(
		/* GraphQL */ `query ViewerLogin { viewer { login } }`,
		{},
		token
	);
	return data.viewer.login;
}

async function searchRepositoriesByPRs({ query, token }) {
	const repos = [];
	let hasNextPage = true;
	let cursor = null;
	while (hasNextPage && repos.length < 1200) {
		const data = await githubGraphQL(
			/* GraphQL */ `
				query SearchPRs($q:String!, $first:Int!, $after:String) {
					search(query:$q, type: ISSUE, first:$first, after:$after) {
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
				}
			`,
			{ q: query, first: 100, after: cursor },
			token
		);
		const page = data.search;
		for (const n of page.nodes || []) {
			const repo = n?.repository;
			if (!repo) continue;
			if (repo.isFork) continue;
			repos.push(repo);
		}
		hasNextPage = page.pageInfo?.hasNextPage;
		cursor = page.pageInfo?.endCursor || null;
	}
	return repos;
}

async function fetchAllTimeContributedRepositories({ username, token }) {
	const authoredQuery = `is:pr is:merged author:${username}`;
	const authored = await searchRepositoriesByPRs({ query: authoredQuery, token });
	const byRepo = new Map();
	for (const r of authored) {
		const owner = r.owner?.login || (r.nameWithOwner?.split('/')?.[0] ?? '');
		const name = r.name || (r.nameWithOwner?.split('/')?.[1] ?? '');
		const key = `${owner}/${name}`.toLowerCase();
		const existing = byRepo.get(key);
		if (existing) {
			existing.contribs += 1;
		} else {
			byRepo.set(key, {
				name,
				nameWithOwner: `${owner}/${name}`,
				stargazerCount: r.stargazerCount || 0,
				isFork: r.isFork || false,
				owner: { login: owner },
				contribs: 1,
			});
		}
	}
	return Array.from(byRepo.values());
}

function normalizeRepositories(repos, { username, excludeReposSet, hideOwnersSet }) {
	const filtered = [];
	for (const r of repos) {
		const owner = r.owner?.login || (r.nameWithOwner?.split('/')?.[0] ?? '');
		const name = r.name || (r.nameWithOwner?.split('/')?.[1] ?? '');
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
			stars: Math.max(0, Number(r.stargazerCount || 0)),
			contribs: Math.max(0, Number(r.contribs || 0)),
			isOwnedByUser,
		});
	}
	return filtered;
}

function computeTreemapLayout(items) {
	const root = hierarchy({ children: items })
		.sum((d) => (typeof d?.stars === 'number' ? Math.max(1, Math.log2(d.stars + 1)) : 1))
		.sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
	return treemap().tile(treemapBinary).size([WIDTH, HEIGHT]).paddingInner(2).round(true)(root);
}

function hexToRgb(hex) {
	const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	if (!m) return { r: 0, g: 0, b: 0 };
	return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function rgbToHex(r, g, b) {
	const toHex = (v) => v.toString(16).padStart(2, '0');
	return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(Math.max(0, Math.min(255, Math.round(g))))}${toHex(
		Math.max(0, Math.min(255, Math.round(b)))
	)}`;
}

function interpolateHexColor(minHex, maxHex, t) {
	const a = hexToRgb(minHex);
	const b = hexToRgb(maxHex);
	const clamped = Math.max(0, Math.min(1, t || 0));
	const r = a.r + (b.r - a.r) * clamped;
	const g = a.g + (b.g - a.g) * clamped;
	const bb = a.b + (b.b - a.b) * clamped;
	return rgbToHex(r, g, bb);
}

function renderSvgFromTreemapLeaves(leaves) {
	const padding = 4;
	let rects = '';
	let clips = '';
	let texts = '';

	// Heat range across all leaves
	let minContrib = Infinity;
	let maxContrib = -Infinity;
	for (const node of leaves) {
		const c = Math.max(0, Number(node?.data?.contribs || 0));
		if (c < minContrib) minContrib = c;
		if (c > maxContrib) maxContrib = c;
	}
	if (!isFinite(minContrib)) minContrib = 0;
	if (!isFinite(maxContrib)) maxContrib = 0;

	leaves.forEach((node, idx) => {
		const d = node.data;
		const x = Math.max(0, Math.floor(node.x0));
		const y = Math.max(0, Math.floor(node.y0));
		const w = Math.max(2, Math.floor(node.x1 - node.x0));
		const h = Math.max(2, Math.floor(node.y1 - node.y0));
		const id = `clip_${idx}`;
		let heatT = 0;
		if (maxContrib === minContrib) {
			heatT = maxContrib > 0 ? 1 : 0;
		} else {
			const c = Math.max(0, Number(d.contribs || 0));
			heatT = (c - minContrib) / Math.max(1, maxContrib - minContrib);
		}
		const fill = interpolateHexColor(HEAT_MIN, HEAT_MAX, heatT);
		rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
		clips += `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`;

		const maxTextWidth = Math.max(0, w - padding * 2);
		const startX = x + padding;
		const startY = y + padding;

		const MIN_FONT = 6;
		const GAP = 3;
		const availableHeight = Math.max(0, h - padding * 2);

		let nameDesired = Math.min(16, Math.floor(h * 0.34));
		let ownerDesired = Math.max(MIN_FONT, Math.floor(nameDesired * 0.75));
		let starDesired = Math.max(MIN_FONT, Math.floor(nameDesired * 0.9));

		let nameSize = Math.max(MIN_FONT, chooseFontSizeToFit(d.label, maxTextWidth, nameDesired, MIN_FONT) || MIN_FONT);
		let ownerSize = Math.max(MIN_FONT, chooseFontSizeToFit(d.owner, maxTextWidth, ownerDesired, MIN_FONT) || MIN_FONT);
		let starSize = 0;
		let starsLabel = '';
		if (d.stars >= 100) {
			starsLabel = `★ ${formatStars(d.stars)}`;
			starSize = Math.max(MIN_FONT, chooseFontSizeToFit(starsLabel, maxTextWidth, starDesired, MIN_FONT) || MIN_FONT);
		}

		let totalH = nameSize + GAP + ownerSize + (starSize > 0 ? GAP + starSize : 0);
		if (totalH > availableHeight && totalH > 0) {
			const factor = availableHeight / totalH;
			nameSize = Math.max(MIN_FONT, Math.floor(nameSize * factor));
			ownerSize = Math.max(MIN_FONT, Math.floor(ownerSize * factor));
			if (starSize > 0) starSize = Math.max(MIN_FONT, Math.floor(starSize * factor));
			totalH = nameSize + GAP + ownerSize + (starSize > 0 ? GAP + starSize : 0);
			while (totalH > availableHeight && (nameSize > MIN_FONT || ownerSize > MIN_FONT || starSize > MIN_FONT)) {
				if (nameSize > MIN_FONT) nameSize--;
				if (ownerSize > MIN_FONT) ownerSize--;
				if (starSize > MIN_FONT) starSize--;
				totalH = nameSize + GAP + ownerSize + (starSize > 0 ? GAP + starSize : 0);
			}
		}

		const nameText = truncateWithEllipsis(String(d.label), maxTextWidth, nameSize);
		const ownerText = truncateWithEllipsis(String(d.owner), maxTextWidth, ownerSize);
		const starsText = starSize > 0 ? truncateWithEllipsis(starsLabel, maxTextWidth, starSize) : '';

		let dy = 0;
		let lines = '';
		lines += `<tspan x="${startX}" dy="${dy}" fill="${TEXT_PRIMARY}" font-size="${nameSize}" font-weight="700">${escapeXml(
			nameText
		)}</tspan>`;
		dy = Math.max(GAP, Math.round(ownerSize + GAP));
		lines += `<tspan x="${startX}" dy="${dy}" fill="${TEXT_SECONDARY}" font-size="${ownerSize}" font-weight="400">${escapeXml(
			ownerText
		)}</tspan>`;
		if (starsText) {
			dy = Math.max(GAP, Math.round(starSize + GAP));
			lines += `<tspan x="${startX}" dy="${dy}" fill="${TEXT_PRIMARY}" font-size="${starSize}" font-weight="700">${escapeXml(
				starsText
			)}</tspan>`;
		}

		texts += `<text x="${startX}" y="${startY}" clip-path="url(#${id})" dominant-baseline="hanging" font-family=${JSON.stringify(
			FONT_FAMILY
		)}>${lines}</text>`;
	});

	const svg =
		`<?xml version="1.0" encoding="UTF-8"?>` +
		`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
		`<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${CANVAS_BG}"/>` +
		`<defs>${clips}</defs>` +
		`${rects}${texts}` +
		`</svg>`;

	return svg;
}

async function main() {
	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		throw new Error('GITHUB_TOKEN is required');
	}

	const username = await resolveUsername(token, process.env.GITHUB_USERNAME);
	const excludeReposSet = parseCsvSet('EXCLUDE_REPOS');
	const hideOwnersSet = parseCsvSet('HIDE_OWNERS');
	
	const raw = await fetchAllTimeContributedRepositories({ username, token });
	const repos = normalizeRepositories(raw, { username, excludeReposSet, hideOwnersSet });

	if (repos.length === 0) {
		const msg = 'No repositories found';
		const svg =
			`<?xml version="1.0" encoding="UTF-8"?>` +
			`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
			`<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="${CANVAS_BG}"/>` +
			`<text x="${Math.floor(WIDTH / 2)}" y="${Math.floor(HEIGHT / 2)}" fill="${TEXT_PRIMARY}" font-size="14" font-family=${JSON.stringify(
				FONT_FAMILY
			)} text-anchor="middle" dominant-baseline="middle">${escapeXml(
				msg
			)}</text>` +
			`</svg>`;
		process.stdout.write(svg);
		return;
	}

	const layout = computeTreemapLayout(repos);
	const svg = renderSvgFromTreemapLeaves(layout.leaves());
	process.stdout.write(svg);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});


