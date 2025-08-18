export function formatStars(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  if (n < 1000000) return Math.round(n / 100) / 10 + 'k';
  return (Math.round((n / 1000000) * 10) / 10).toString() + 'm';
}

export function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function estimateTextWidth(text: string, fontSizePx: number): number {
  const avgWidthFactor = 0.6; // average Latin char width ~0.55-0.65 of font size
  return text.length * fontSizePx * avgWidthFactor;
}

export function chooseFontSizeToFit(
  text: string,
  maxWidthPx: number,
  desiredPx: number,
  minPx: number
): number {
  let size = Math.min(desiredPx, 48);
  size = Math.max(size, minPx);

  // Shrink if needed
  while (size > minPx && estimateTextWidth(text, size) > maxWidthPx) {
    size -= 1;
  }

  if (estimateTextWidth(text, size) > maxWidthPx) return 0; // cannot fit
  return size;
}

export function truncateWithEllipsis(text: string, maxWidthPx: number, fontSizePx: number): string {
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

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${toHex(Math.max(0, Math.min(255, Math.round(r))))}${toHex(Math.max(0, Math.min(255, Math.round(g))))}${toHex(Math.max(0, Math.min(255, Math.round(b))))}`;
}

export function interpolateHexColor(minHex: string, maxHex: string, t: number): string {
  const a = hexToRgb(minHex);
  const b = hexToRgb(maxHex);
  const clamped = Math.max(0, Math.min(1, t || 0));

  const r = a.r + (b.r - a.r) * clamped;
  const g = a.g + (b.g - a.g) * clamped;
  const bb = a.b + (b.b - a.b) * clamped;

  return rgbToHex(r, g, bb);
}
