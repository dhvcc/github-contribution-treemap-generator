import type { TreemapConfig, TreemapNode } from './types';
import { DEFAULT_CONFIG, FONT_SIZES, LAYOUT } from './constants';
import {
  formatStars,
  escapeXml,
  chooseFontSizeToFit,
  truncateWithEllipsis,
  interpolateHexColor,
} from './utils';

export class TreemapRenderer {
  private config: TreemapConfig;

  constructor(config: Partial<TreemapConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  render(leaves: TreemapNode[]): string {
    if (leaves.length === 0) {
      return this.renderEmptyState();
    }

    const padding = LAYOUT.PADDING;

    let rects = '';
    let clips = '';
    let texts = '';

    // Calculate heat range across all leaves
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

      // Calculate heat color
      let heatT = 0;
      if (maxContrib === minContrib) {
        heatT = maxContrib > 0 ? 1 : 0;
      } else {
        const c = Math.max(0, Number(d?.contribs || 0));
        heatT = (c - minContrib) / Math.max(1, maxContrib - minContrib);
      }

      const fill = interpolateHexColor(this.config.heatMin, this.config.heatMax, heatT);

      rects += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`;
      clips += `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath>`;

      const maxTextWidth = Math.max(0, w - padding * 2);
      const startX = x + padding;
      const startY = y + padding;
      const availableHeight = Math.max(0, h - padding * 2);

      // Calculate font sizes
      let nameDesired = Math.min(FONT_SIZES.NAME_DESIRED, Math.floor(h * 0.34));
      let ownerDesired = Math.max(FONT_SIZES.MIN, Math.floor(nameDesired * FONT_SIZES.OWNER_RATIO));
      let starDesired = Math.max(FONT_SIZES.MIN, Math.floor(nameDesired * FONT_SIZES.STARS_RATIO));

      let nameSize = Math.max(
        FONT_SIZES.MIN,
        chooseFontSizeToFit(d.label, maxTextWidth, nameDesired, FONT_SIZES.MIN) || FONT_SIZES.MIN
      );
      let ownerSize = Math.max(
        FONT_SIZES.MIN,
        chooseFontSizeToFit(d.owner, maxTextWidth, ownerDesired, FONT_SIZES.MIN) || FONT_SIZES.MIN
      );

      let starSize = 0;
      let starsLabel = '';

      if (d.stars >= 100) {
        starsLabel = `★ ${formatStars(d.stars)}`;
        starSize = Math.max(
          FONT_SIZES.MIN,
          chooseFontSizeToFit(starsLabel, maxTextWidth, starDesired, FONT_SIZES.MIN) ||
            FONT_SIZES.MIN
        );
      }

      // Adjust font sizes to fit available height
      let totalH =
        nameSize + FONT_SIZES.GAP + ownerSize + (starSize > 0 ? FONT_SIZES.GAP + starSize : 0);

      if (totalH > availableHeight && totalH > 0) {
        const factor = availableHeight / totalH;
        nameSize = Math.max(FONT_SIZES.MIN, Math.floor(nameSize * factor));
        ownerSize = Math.max(FONT_SIZES.MIN, Math.floor(ownerSize * factor));
        if (starSize > 0) starSize = Math.max(FONT_SIZES.MIN, Math.floor(starSize * factor));

        totalH =
          nameSize + FONT_SIZES.MIN + ownerSize + (starSize > 0 ? FONT_SIZES.GAP + starSize : 0);

        while (
          totalH > availableHeight &&
          (nameSize > FONT_SIZES.MIN || ownerSize > FONT_SIZES.MIN || starSize > FONT_SIZES.MIN)
        ) {
          if (nameSize > FONT_SIZES.MIN) nameSize--;
          if (ownerSize > FONT_SIZES.MIN) ownerSize--;
          if (starSize > FONT_SIZES.MIN) starSize--;
          totalH =
            nameSize + FONT_SIZES.GAP + ownerSize + (starSize > 0 ? FONT_SIZES.GAP + starSize : 0);
        }
      }

      // Prepare text content
      const nameText = truncateWithEllipsis(String(d.label), maxTextWidth, nameSize);
      const ownerText = truncateWithEllipsis(String(d.owner), maxTextWidth, ownerSize);
      const starsText =
        starSize > 0 ? truncateWithEllipsis(starsLabel, maxTextWidth, starSize) : '';

      // Build text elements
      let dy = 0;
      let lines = '';

      lines += `<tspan x="${startX}" dy="${dy}" fill="${this.config.textPrimary}" font-size="${nameSize}" font-weight="700">${escapeXml(nameText)}</tspan>`;

      dy = Math.max(FONT_SIZES.GAP, Math.round(ownerSize + FONT_SIZES.GAP));
      lines += `<tspan x="${startX}" dy="${dy}" fill="${this.config.textSecondary}" font-size="${ownerSize}" font-weight="400">${escapeXml(ownerText)}</tspan>`;

      if (starsText) {
        dy = Math.max(FONT_SIZES.GAP, Math.round(starSize + FONT_SIZES.GAP));
        lines += `<tspan x="${startX}" dy="${dy}" fill="${this.config.textPrimary}" font-size="${starSize}" font-weight="700">${escapeXml(starsText)}</tspan>`;
      }

      texts += `<text x="${startX}" y="${startY}" clip-path="url(#${id})" dominant-baseline="hanging" font-family="${this.config.fontFamily}">${lines}</text>`;
    });

    return this.wrapSvg(rects, clips, texts);
  }

  private renderEmptyState(): string {
    const { width, height } = this.config;
    const msg = 'No repositories found';

    return this.wrapSvg(
      '',
      '',
      `<text x="${Math.floor(width / 2)}" y="${Math.floor(height / 2)}" fill="${this.config.textPrimary}" font-size="14" font-family="${this.config.fontFamily}" text-anchor="middle" dominant-baseline="middle">${escapeXml(msg)}</text>`
    );
  }

  private wrapSvg(rects: string, clips: string, texts: string): string {
    const { width, height, canvasBg } = this.config;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${canvasBg}"/>
  <defs>${clips}</defs>
  ${rects}${texts}
</svg>`;
  }
}
