import type { RGB } from '../pdfLucideIcons';

export type { RGB };

// ============================================================================
// DESIGN TOKENS CHUẨN A4 DỌC (MỤC 3)
// ============================================================================

export const PAGE_WIDTH = 210;
export const PAGE_HEIGHT = 297;
export const MARGIN_X = 14;
export const MARGIN_TOP = 10;
export const SAFE_BOTTOM = 14;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2; // 182mm
export const GRID_GAP = 3.2;
export const CARD_RADIUS = 2.4;

export const FONT_BANNER_TITLE = 14.5;
export const FONT_KPI_VALUE = 13.0;
export const FONT_CARD_BALANCE = 13.5;
export const FONT_SECTION_TITLE = 8.4;
export const FONT_BODY = 7.8;
export const FONT_LEDGER = 7.6;
export const LEDGER_CELL_PADDING = 1.15;
export const FONT_CAPTION = 7.0;

// ============================================================================
// HỆ MÀU NGỮ NGHĨA (TEAL = DƯƠNG, ROSE = ÂM, AMBER = CHIA RIÊNG, VIOLET = CHUYỂN TRẢ)
// ============================================================================

export const COLOR_INK: RGB = [15, 23, 42]; // Slate 900
export const COLOR_SLATE: RGB = [71, 85, 105]; // Slate 600
export const COLOR_MUTED: RGB = [100, 116, 139]; // Slate 500
export const COLOR_BORDER: RGB = [226, 232, 240]; // Slate 200
export const COLOR_SURFACE_MUTED: RGB = [248, 250, 252]; // Slate 50
export const COLOR_TRACK: RGB = [241, 245, 249]; // Slate 100

export const COLOR_TEAL: RGB = [13, 148, 136]; // Teal 600
export const COLOR_TEAL_DARK: RGB = [15, 118, 110]; // Teal 700
export const COLOR_TEAL_SOFT: RGB = [240, 253, 250]; // Teal 50
export const COLOR_TEAL_BORDER: RGB = [153, 246, 228]; // Teal 200

export const COLOR_ROSE: RGB = [225, 29, 72]; // Rose 600
export const COLOR_ROSE_DARK: RGB = [190, 18, 60]; // Rose 700
export const COLOR_ROSE_SOFT: RGB = [255, 241, 242]; // Rose 50
export const COLOR_ROSE_BORDER: RGB = [254, 205, 211]; // Rose 200

export const COLOR_AMBER_TEXT: RGB = [180, 83, 9]; // Amber 700
export const COLOR_AMBER_BG: RGB = [254, 243, 199]; // Amber 100
export const COLOR_AMBER_BORDER: RGB = [253, 230, 138]; // Amber 200

export const COLOR_TRANSFER_BG: RGB = [245, 243, 255]; // Violet 50
export const COLOR_TRANSFER_BORDER: RGB = [221, 214, 254]; // Violet 200
export const COLOR_TRANSFER_TEXT: RGB = [109, 40, 217]; // Violet 700

export interface CategoryTheme {
  lucideIcon: string;
  stroke: RGB;
  bg: RGB;
  bar: RGB;
  text: RGB;
}

export const CATEGORY_THEME_MAP: Record<string, CategoryTheme> = {
  Plane: {
    lucideIcon: 'Plane',
    stroke: [24, 98, 236],
    bg: [212, 232, 255],
    bar: [37, 109, 245],
    text: [20, 86, 218],
  },
  Utensils: {
    lucideIcon: 'Utensils',
    stroke: [224, 124, 14],
    bg: [254, 234, 202],
    bar: [242, 146, 29],
    text: [217, 119, 6],
  },
  Hotel: {
    lucideIcon: 'Bed',
    stroke: [118, 56, 218],
    bg: [235, 224, 255],
    bar: [122, 60, 224],
    text: [114, 48, 212],
  },
  Bed: {
    lucideIcon: 'Bed',
    stroke: [118, 56, 218],
    bg: [235, 224, 255],
    bar: [122, 60, 224],
    text: [114, 48, 212],
  },
  Car: {
    lucideIcon: 'Car',
    stroke: [16, 152, 108],
    bg: [209, 247, 232],
    bar: [16, 158, 114],
    text: [15, 118, 110],
  },
  Ticket: {
    lucideIcon: 'Ticket',
    stroke: [219, 39, 119],
    bg: [252, 224, 240],
    bar: [219, 39, 119],
    text: [190, 24, 93],
  },
  Package: {
    lucideIcon: 'Ellipsis',
    stroke: [64, 82, 104],
    bg: [222, 230, 238],
    bar: [13, 148, 136],
    text: [64, 82, 104],
  },
};

export function resolveCategoryTheme(iconKey?: string): CategoryTheme {
  return CATEGORY_THEME_MAP[iconKey || 'Package'] || CATEGORY_THEME_MAP.Package;
}

export const DAY_BAR_PALETTE: RGB[] = [
  [13, 148, 136], // Teal 600
  [14, 116, 144], // Cyan 700
  [2, 132, 199], // Sky 600
  [37, 99, 235], // Blue 600
  [79, 70, 229], // Indigo 600
  [124, 58, 237], // Violet 600
];

export function hexToRgb(hex: string, fallback: RGB = [0, 7, 119]): RGB {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  return fallback;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const hue2rgb = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1 / 3) * 255);
  return [r, g, b];
}

export interface BannerPalette {
  base: RGB;
  wave1: RGB;
  wave2: RGB;
  badgeBg: RGB;
  subtitleText: RGB;
}

/**
 * Dẫn xuất bảng màu Banner từ `config.accentColor`:
 * - Kẹp độ sáng nền gốc trong khoảng [14%, 26%] để chữ trắng luôn đạt tương phản chuẩn WCAG AAA.
 * - Hai tầng sóng đồ họa phẳng sáng hơn +8% và +16% độ sáng HSL.
 */
export function deriveBannerPalette(accentColor?: string): BannerPalette {
  const [r, g, b] = hexToRgb(accentColor || '#000777', [0, 7, 119]);
  const [h, s, l] = rgbToHsl(r, g, b);

  const clampedS = Math.max(0.45, Math.min(0.88, s));
  const clampedL = Math.max(0.14, Math.min(0.26, l));

  return {
    base: hslToRgb(h, clampedS, clampedL),
    wave1: hslToRgb(h, clampedS, Math.min(0.46, clampedL + 0.08)),
    wave2: hslToRgb(h, clampedS, Math.min(0.56, clampedL + 0.16)),
    badgeBg: hslToRgb(h, Math.min(0.92, clampedS + 0.1), Math.min(0.48, clampedL + 0.2)),
    subtitleText: hslToRgb(h, Math.min(0.75, clampedS), 0.88),
  };
}
