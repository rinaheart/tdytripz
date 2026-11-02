import { formatVND } from './format';
import {
  type EnrichedDebtTransaction,
  type EnrichedMemberBalance,
  type ExpenseReportData,
  type ExpenseReportOverview,
  type ExpenseReportRow,
  type ExpenseReportSettlement,
  type MemberAppendixData,
  type MemberReportSummary,
  type ReportCategoryBreakdown,
  type ReportDayBreakdown,
  buildExpenseReportData,
  formatSpentAtReportVN,
  sanitizeFileNameSegment,
  shortenCategoryLabelForTable,
} from './pdfReportData';

export {
  type EnrichedDebtTransaction,
  type EnrichedMemberBalance,
  type ExpenseReportData,
  type ExpenseReportOverview,
  type ExpenseReportRow,
  type ExpenseReportSettlement,
  type MemberAppendixData,
  type MemberReportSummary,
  type ReportCategoryBreakdown,
  type ReportDayBreakdown,
  buildExpenseReportData,
  formatSpentAtReportVN,
  sanitizeFileNameSegment,
  shortenCategoryLabelForTable,
};

// ============================================================================
// CDN LOADER CHO JSPDF & JSPDF-AUTOTABLE + FONT ROBOTO UNICODE TIẾNG VIỆT
// ============================================================================

const JSPDF_CDN_URL = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js';
const AUTOTABLE_CDN_URL =
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.9/dist/jspdf.plugin.autotable.min.js';
const ROBOTO_REGULAR_TTF_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/fonts/Roboto/Roboto-Regular.ttf';
const ROBOTO_MEDIUM_TTF_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/fonts/Roboto/Roboto-Medium.ttf';

let cachedRobotoRegularBase64: string | null = null;
let cachedRobotoMediumBase64: string | null = null;

function loadExternalScript(src: string, timeoutMs = 12000): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.remove();
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';

    const timer = window.setTimeout(() => {
      script.remove();
      reject(
        new Error(
          'Hết thời gian tải thư viện tạo PDF từ CDN (mạng yếu hoặc bị chặn). Vui lòng kiểm tra kết nối Internet và thử lại.'
        )
      );
    }, timeoutMs);

    script.onload = () => {
      window.clearTimeout(timer);
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      script.remove();
      reject(
        new Error(
          'Không thể tải thư viện tạo PDF từ CDN. Vui lòng kiểm tra kết nối Internet và thử lại.'
        )
      );
    };
    document.head.appendChild(script);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return window.btoa(binary);
}

async function fetchFontBase64(url: string, timeoutMs = 10000): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { mode: 'cors', signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Không thể tải font Unicode từ CDN (${res.status})`);
    }
    const buf = await res.arrayBuffer();
    return arrayBufferToBase64(buf);
  } finally {
    window.clearTimeout(timer);
  }
}

async function ensureRobotoFontsLoaded(): Promise<{ regular: string; medium: string } | null> {
  try {
    if (!cachedRobotoRegularBase64 || !cachedRobotoMediumBase64) {
      const [reg, med] = await Promise.all([
        fetchFontBase64(ROBOTO_REGULAR_TTF_URL),
        fetchFontBase64(ROBOTO_MEDIUM_TTF_URL),
      ]);
      cachedRobotoRegularBase64 = reg;
      cachedRobotoMediumBase64 = med;
    }
    return {
      regular: cachedRobotoRegularBase64,
      medium: cachedRobotoMediumBase64,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// HỆ THỐNG RENDER ICON LUCIDE (TƯƠNG ĐỒNG 100% VỚI WEB APP) + VECTOR ARROW SYMBOL
// ============================================================================

const LUCIDE_ICON_PATHS: Record<string, string[]> = {
  Plane: [
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ],
  Car: [
    'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
    'M7 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    'M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    'M9 17h6',
  ],
  Utensils: [
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
    'M7 2v20',
    'M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
  ],
  Hotel: [
    'M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z',
    'M9 22v-4h6v4',
    'M8 6h.01',
    'M16 6h.01',
    'M12 6h.01',
    'M12 10h.01',
    'M12 14h.01',
    'M16 10h.01',
    'M16 14h.01',
    'M8 10h.01',
    'M8 14h.01',
  ],
  Ticket: [
    'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
    'M13 5v2',
    'M13 17v2',
    'M13 11v2',
  ],
  Package: [
    'm7.5 4.27 9 5.15',
    'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
    'm3.3 7 8.7 5 8.7-5',
    'M12 22V12',
  ],
  Wallet: [
    'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
    'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  ],
  Users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  PieChart: [
    'M21.21 15.89A10 10 0 1 1 8 2.83',
    'M22 12A10 10 0 0 0 12 2v10z',
  ],
  Award: [
    'M6 9a6 6 0 1 0 12 0A6 6 0 1 0 6 9',
    'M15.477 12.89 17 22l-5-3-5 3 1.523-9.11',
  ],
  Calendar: [
    'M8 2v4',
    'M16 2v4',
    'M3 10h18',
    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  ],
  ArrowRightLeft: [
    'm16 3 4 4-4 4',
    'M20 7H4',
    'm8 21-4-4 4-4',
    'M4 17h16',
  ],
  Send: [
    'm22 2-7 20-4-9-9-4Z',
    'M22 2 11 13',
  ],
  CheckCircle: [
    'M22 11.08V12a10 10 0 1 1-5.93-9.14',
    'm9 11 3 3L22 4',
  ],
  MapPin: [
    'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z',
    'M9 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  ],
  RefreshCw: [
    'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
    'M21 3v5h-5',
    'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
    'M8 16H3v5',
  ],
  Calculator: [
    'M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z',
    'M8 6h8v4H8V6z',
    'M8 14h.01',
    'M12 14h.01',
    'M16 14h.01',
    'M8 18h.01',
    'M12 18h.01',
    'M16 18h.01',
  ],
};

const iconDataUrlCache = new Map<string, string>();

function renderLucideIconDataUrl(
  iconName: string,
  strokeRgb: [number, number, number],
  bgRgb?: [number, number, number]
): string | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;

  const cacheKey = `${iconName}_${strokeRgb.join(',')}_${bgRgb ? bgRgb.join(',') : 'none'}`;
  const cached = iconDataUrlCache.get(cacheKey);
  if (cached) return cached;

  try {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (bgRgb) {
      ctx.fillStyle = `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})`;
      const r = 22;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();
    }

    const pad = bgRgb ? 20 : 6;
    const scale = (size - pad * 2) / 24;
    ctx.save();
    ctx.translate(pad, pad);
    ctx.scale(scale, scale);
    ctx.strokeStyle = `rgb(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]})`;
    ctx.lineWidth = 2.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const paths = LUCIDE_ICON_PATHS[iconName] || LUCIDE_ICON_PATHS.Package;
    for (const d of paths) {
      const p = new Path2D(d);
      ctx.stroke(p);
    }
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    iconDataUrlCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

function drawIconBadge(
  doc: any,
  iconName: string,
  x: number,
  y: number,
  sizeMm: number,
  strokeRgb: [number, number, number],
  bgRgb?: [number, number, number]
): void {
  const dataUrl = renderLucideIconDataUrl(iconName, strokeRgb, bgRgb);
  if (dataUrl) {
    doc.addImage(dataUrl, 'PNG', x, y, sizeMm, sizeMm);
    return;
  }
  if (bgRgb) {
    doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
    doc.roundedRect(x, y, sizeMm, sizeMm, sizeMm * 0.22, sizeMm * 0.22, 'F');
  }
}

/**
 * Vẽ ký hiệu mũi tên vector (→) sắc nét tuyệt đối không phụ thuộc vào glyph của font
 */
function drawVectorArrowSymbol(
  doc: any,
  startX: number,
  centerY: number,
  lengthMm: number,
  rgb: [number, number, number]
): void {
  const headLen = 1.25;
  const headHalfH = 0.78;
  const endX = startX + lengthMm;
  const shaftEndX = endX - headLen * 0.65;

  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.4);
  doc.line(startX, centerY, shaftEndX, centerY);
  doc.triangle(
    endX,
    centerY,
    endX - headLen,
    centerY - headHalfH,
    endX - headLen,
    centerY + headHalfH,
    'F'
  );
}

/**
 * Vẽ cặp "Người chuyển → Người nhận" với mũi tên vector chính xác ở giữa
 */
function drawTransferPairWithArrow(
  doc: any,
  activeFont: string,
  fontStyle: 'normal' | 'bold',
  fontSize: number,
  leftText: string,
  rightText: string,
  startX: number,
  baselineY: number,
  leftRgb: [number, number, number],
  arrowRgb: [number, number, number],
  rightRgb: [number, number, number]
): number {
  doc.setFont(activeFont, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(leftRgb[0], leftRgb[1], leftRgb[2]);
  doc.text(leftText, startX, baselineY);

  const leftW = doc.getTextWidth(leftText);
  const gap = 2.1;
  const arrowLen = 3.8;
  const arrowStartX = startX + leftW + gap;
  const arrowCenterY = baselineY - fontSize * 0.115;

  drawVectorArrowSymbol(doc, arrowStartX, arrowCenterY, arrowLen, arrowRgb);

  const rightX = arrowStartX + arrowLen + gap;
  doc.setFont(activeFont, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(rightRgb[0], rightRgb[1], rightRgb[2]);
  doc.text(rightText, rightX, baselineY);

  return rightX + doc.getTextWidth(rightText);
}

function hexToRgb(hex: string, fallback: [number, number, number] = [13, 148, 136]): [number, number, number] {
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

// ============================================================================
// HỆ MÀU DIGITAL DASHBOARD NỔI BẬT, ẤN TƯỢNG TRÊN MÀN HÌNH PDF
// ============================================================================

const COLOR_HERO_DARK: [number, number, number] = [15, 23, 42]; // Slate 900
const COLOR_HERO_CARD: [number, number, number] = [30, 41, 59]; // Slate 800
const COLOR_INK: [number, number, number] = [15, 23, 42]; // Slate 900
const COLOR_SLATE: [number, number, number] = [71, 85, 105]; // Slate 600
const COLOR_MUTED: [number, number, number] = [100, 116, 139]; // Slate 500
const COLOR_BORDER: [number, number, number] = [226, 232, 240]; // Slate 200
const COLOR_TEAL: [number, number, number] = [13, 148, 136]; // Teal 600
const COLOR_TEAL_DARK: [number, number, number] = [15, 118, 110]; // Teal 700
const COLOR_EMERALD_BRIGHT: [number, number, number] = [52, 211, 153]; // Emerald 400
const COLOR_ROSE: [number, number, number] = [225, 29, 72]; // Rose 600
const COLOR_ROSE_DARK: [number, number, number] = [190, 18, 60]; // Rose 700

const CATEGORY_THEME_MAP: Record<
  string,
  { stroke: [number, number, number]; bg: [number, number, number]; bar: [number, number, number] }
> = {
  Plane: {
    stroke: [37, 99, 235],
    bg: [219, 234, 254],
    bar: [37, 99, 235], // Blue 600
  },
  Utensils: {
    stroke: [217, 119, 6],
    bg: [254, 243, 199],
    bar: [245, 158, 11], // Amber 500
  },
  Hotel: {
    stroke: [124, 58, 237],
    bg: [237, 233, 254],
    bar: [124, 58, 237], // Violet 600
  },
  Car: {
    stroke: [13, 148, 136],
    bg: [204, 251, 241],
    bar: [13, 148, 136], // Teal 600
  },
  Ticket: {
    stroke: [219, 39, 119],
    bg: [252, 231, 243],
    bar: [219, 39, 119], // Pink 600
  },
  Package: {
    stroke: [71, 85, 105],
    bg: [226, 232, 240],
    bar: [100, 116, 139], // Slate 500
  },
};

const DAY_BAR_PALETTE: Array<[number, number, number]> = [
  [13, 148, 136], // Teal 600
  [14, 116, 144], // Cyan 700
  [2, 132, 199], // Sky 600
  [37, 99, 235], // Blue 600
  [79, 70, 229], // Indigo 600
  [124, 58, 237], // Violet 600
];

function ensurePageSpace(doc: any, cursorY: number, neededHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + neededHeight > pageHeight - 14) {
    doc.addPage();
    return 13;
  }
  return cursorY;
}

function drawExecutiveMasthead(
  doc: any,
  activeFont: string,
  report: ExpenseReportData,
  subtitleBadge: string,
  marginX: number,
  startY: number,
  pageWidth: number
): number {
  const fullW = pageWidth - marginX * 2;
  const bannerH = 22;
  const y = startY;

  doc.setFillColor(...COLOR_HERO_DARK);
  doc.roundedRect(marginX, y, fullW, bannerH, 2.5, 2.5, 'F');

  doc.setFillColor(20, 184, 166);
  doc.roundedRect(marginX, y, fullW, 1.5, 1, 1, 'F');

  drawIconBadge(doc, 'Wallet', marginX + 4, y + 3.2, 4.4, [20, 184, 166], [30, 41, 59]);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...COLOR_EMERALD_BRIGHT);
  doc.text(`TDYTRIP  •  ${subtitleBadge}`, marginX + 9.8, y + 6.3);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  const maxTitleLen = report.tripName.length > 36 ? `${report.tripName.slice(0, 35)}…` : report.tripName;
  doc.text(maxTitleLen.toUpperCase(), marginX + 4, y + 13.4);

  let metaX = marginX + 4;
  const metaY = y + 18.8;
  if (report.location) {
    drawIconBadge(doc, 'MapPin', metaX, metaY - 3, 3.5, [56, 189, 248]);
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(203, 213, 225);
    doc.text(report.location, metaX + 4.3, metaY);
    metaX += doc.getTextWidth(report.location) + 8.5;
  }

  if (report.dateRangeLabel) {
    drawIconBadge(doc, 'Calendar', metaX, metaY - 3, 3.5, [52, 211, 153]);
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(203, 213, 225);
    doc.text(report.dateRangeLabel, metaX + 4.3, metaY);
  }

  // Hộp Highlight bên phải Hero Banner
  const rightBoxW = 56;
  const rightBoxX = pageWidth - marginX - rightBoxW - 3;
  const rightBoxY = y + 2.8;
  const rightBoxH = bannerH - 5.6;

  doc.setFillColor(...COLOR_HERO_CARD);
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.25);
  doc.roundedRect(rightBoxX, rightBoxY, rightBoxW, rightBoxH, 1.8, 1.8, 'FD');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('TỔNG CHI CHUYẾN ĐI', rightBoxX + rightBoxW - 3, rightBoxY + 4.2, {
    align: 'right',
  });

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(11.8);
  doc.setTextColor(...COLOR_EMERALD_BRIGHT);
  doc.text(
    `${formatVND(report.overview.totalExpenseAmount, false)} đ`,
    rightBoxX + rightBoxW - 3,
    rightBoxY + 10.4,
    { align: 'right' }
  );

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Xuất: ${report.generatedAt}`, rightBoxX + rightBoxW - 3, rightBoxY + 14.3, {
    align: 'right',
  });

  return y + bannerH + 3.5;
}

function drawSectionHeading(
  doc: any,
  activeFont: string,
  sectionCode: string,
  title: string,
  rightNote: string | null,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const y = ensurePageSpace(doc, cursorY, 11);

  doc.setFillColor(...COLOR_TEAL_DARK);
  doc.roundedRect(marginX, y - 0.5, 7.2, 5, 1.2, 1.2, 'F');
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(sectionCode, marginX + 3.6, y + 3, { align: 'center' });

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(10.2);
  doc.setTextColor(...COLOR_INK);
  doc.text(title, marginX + 9.4, y + 3.1);

  if (rightNote) {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...COLOR_TEAL_DARK);
    doc.text(rightNote, pageWidth - marginX, y + 3.1, { align: 'right' });
  }

  return y + 6.4;
}

function drawFourKpiRow(
  doc: any,
  activeFont: string,
  items: Array<{
    label: string;
    value: string;
    subtext?: string;
    iconName: string;
    accentColor: [number, number, number];
    surfaceColor: [number, number, number];
    borderColor: [number, number, number];
    iconBgColor: [number, number, number];
    valueColor?: [number, number, number];
  }>,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const boxHeight = 17.2;
  const y = ensurePageSpace(doc, cursorY, boxHeight + 3);
  const gap = 3;
  const totalWidth = pageWidth - marginX * 2;
  const colWidth = (totalWidth - gap * 3) / 4;

  items.slice(0, 4).forEach((item, idx) => {
    const x = marginX + idx * (colWidth + gap);

    doc.setFillColor(item.surfaceColor[0], item.surfaceColor[1], item.surfaceColor[2]);
    doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, y, colWidth, boxHeight, 1.8, 1.8, 'FD');

    doc.setFillColor(item.accentColor[0], item.accentColor[1], item.accentColor[2]);
    doc.roundedRect(x + 0.2, y + 0.2, colWidth - 0.4, 1.2, 0.8, 0.8, 'F');

    drawIconBadge(
      doc,
      item.iconName,
      x + colWidth - 7.6,
      y + 2.4,
      5.2,
      item.accentColor,
      item.iconBgColor
    );

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(item.label.toUpperCase(), x + 2.8, y + 5.1);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(9.8);
    const valColor = item.valueColor || COLOR_INK;
    doc.setTextColor(valColor[0], valColor[1], valColor[2]);
    doc.text(item.value, x + 2.8, y + 10.9);

    if (item.subtext) {
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...COLOR_SLATE);
      const cleanSub =
        item.subtext.length > 29 ? `${item.subtext.slice(0, 28)}…` : item.subtext;
      doc.text(cleanSub, x + 2.8, y + 14.9);
    }
  });

  return y + boxHeight + 3.4;
}

function drawCompactChartCard(
  doc: any,
  activeFont: string,
  title: string,
  headerIcon: string,
  headerIconColor: [number, number, number],
  headerIconBg: [number, number, number],
  items: Array<{
    label: string;
    iconName: string;
    iconStroke: [number, number, number];
    iconBg: [number, number, number];
    barColor: [number, number, number];
    amount: number;
    count: number;
    percentage: number;
  }>,
  x: number,
  y: number,
  width: number,
  fixedHeight?: number
): number {
  const maxItems = items.slice(0, 6);
  const itemHeight = 7.5;
  const headerH = 8;
  const cardH = fixedHeight || Math.max(24, headerH + maxItems.length * itemHeight + 2.2);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, cardH, 1.8, 1.8, 'FD');

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x + 0.2, y + 0.2, width - 0.4, headerH - 0.4, 1.6, 1.6, 'F');

  drawIconBadge(doc, headerIcon, x + 3, y + 1.7, 4.5, headerIconColor, headerIconBg);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.1);
  doc.setTextColor(...COLOR_INK);
  doc.text(title, x + 8.6, y + 5.1);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(x + 2.5, y + headerH, x + width - 2.5, y + headerH);

  let rowY = y + headerH + 1.1;
  const iconSize = 4.2;
  const textStartX = x + 3 + iconSize + 1.6;
  const trackW = width - (iconSize + 1.6) - 6;

  maxItems.forEach((item) => {
    drawIconBadge(doc, item.iconName, x + 3, rowY + 0.5, iconSize, item.iconStroke, item.iconBg);

    // Dòng 1: Tên hạng mục / ngày + số khoản chi
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(...COLOR_INK);
    const cleanLabel =
      item.label.length > 28 ? `${item.label.slice(0, 27)}…` : item.label;
    doc.text(`${cleanLabel} • ${item.count} khoản`, textStartX, rowY + 2.6);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(item.iconStroke[0], item.iconStroke[1], item.iconStroke[2]);
    doc.text(
      `${formatVND(item.amount, false)} đ (${item.percentage}%)`,
      x + width - 3,
      rowY + 2.6,
      { align: 'right' }
    );

    // Dòng 2: Thanh progress bar bo tròn sống động
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(textStartX, rowY + 3.8, trackW, 2, 0.8, 0.8, 'F');

    const ratio = Math.max(0, Math.min(1, item.percentage / 100));
    const fillW = Math.max(ratio > 0 ? 1.8 : 0, trackW * ratio);
    if (fillW > 0) {
      doc.setFillColor(item.barColor[0], item.barColor[1], item.barColor[2]);
      doc.roundedRect(textStartX, rowY + 3.8, fillW, 2, 0.8, 0.8, 'F');
    }

    rowY += itemHeight;
  });

  return y + cardH;
}

function drawSideBySideOverviewCharts(
  doc: any,
  activeFont: string,
  byCategory: ReportCategoryBreakdown[],
  byDay: ReportDayBreakdown[],
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const maxRows = Math.max(
    Math.min(6, byCategory.length),
    Math.min(6, byDay.length),
    1
  );
  const sharedHeight = 8 + maxRows * 7.5 + 2.2;
  const y = ensurePageSpace(doc, cursorY, sharedHeight + 4);

  const gap = 4;
  const fullW = pageWidth - marginX * 2;
  const colW = (fullW - gap) / 2;

  drawCompactChartCard(
    doc,
    activeFont,
    'Chi tiêu theo Hạng mục',
    'PieChart',
    [13, 148, 136],
    [204, 251, 241],
    byCategory.map((c) => {
      const theme = CATEGORY_THEME_MAP[c.categoryIcon] || CATEGORY_THEME_MAP.Package;
      return {
        label: shortenCategoryLabelForTable(c.categoryName),
        iconName: c.categoryIcon || 'Package',
        iconStroke: theme.stroke,
        iconBg: theme.bg,
        barColor: theme.bar,
        amount: c.amount,
        count: c.count,
        percentage: c.percentage,
      };
    }),
    marginX,
    y,
    colW,
    sharedHeight
  );

  drawCompactChartCard(
    doc,
    activeFont,
    'Chi tiêu theo Ngày',
    'Calendar',
    [37, 99, 235],
    [219, 234, 254],
    byDay.map((d, idx) => {
      const barCol = DAY_BAR_PALETTE[idx % DAY_BAR_PALETTE.length];
      return {
        label: d.label.replace(/\s*\((\d{2}\/\d{2})\/\d{4}\)/, ' ($1)'),
        iconName: 'Calendar',
        iconStroke: barCol,
        iconBg: [241, 245, 249],
        barColor: barCol,
        amount: d.amount,
        count: d.count,
        percentage: d.percentage,
      };
    }),
    marginX + colW + gap,
    y,
    colW,
    sharedHeight
  );

  return y + sharedHeight + 3.8;
}

function drawMemberBalanceComparisonChart(
  doc: any,
  activeFont: string,
  balances: EnrichedMemberBalance[],
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  if (balances.length === 0) return cursorY;

  const rowHeight = 7.4;
  const headerHeight = 8;
  const totalBoxHeight = headerHeight + balances.length * rowHeight + 2.2;

  const y = ensurePageSpace(doc, cursorY, totalBoxHeight + 3);
  const fullWidth = pageWidth - marginX * 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, y, fullWidth, totalBoxHeight, 1.8, 1.8, 'FD');

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX + 0.2, y + 0.2, fullWidth - 0.4, headerHeight - 0.4, 1.6, 1.6, 'F');
  drawIconBadge(doc, 'ArrowRightLeft', marginX + 3, y + 1.7, 4.5, [13, 148, 136], [204, 251, 241]);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.1);
  doc.setTextColor(...COLOR_INK);
  doc.text('So sánh Đã chi & Phải chịu theo Thành viên', marginX + 8.6, y + 5.1);

  const legendRightX = marginX + fullWidth - 3.5;
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.1);

  doc.setFillColor(...COLOR_TEAL);
  doc.roundedRect(legendRightX - 54, y + 2.7, 2.8, 2.8, 0.5, 0.5, 'F');
  doc.setTextColor(...COLOR_SLATE);
  doc.text('Đã chi', legendRightX - 50, y + 4.9);

  doc.setFillColor(148, 163, 184);
  doc.roundedRect(legendRightX - 28, y + 2.7, 2.8, 2.8, 0.5, 0.5, 'F');
  doc.text('Phải chịu', legendRightX - 24, y + 4.9);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(marginX + 2.5, y + headerHeight, marginX + fullWidth - 2.5, y + headerHSpacer(headerHeight));

  const maxVal = Math.max(
    1,
    ...balances.map((b) => Math.max(b.paidExpense, b.owedExpense))
  );

  let rowY = y + headerHeight + 0.9;
  const nameColWidth = 34;
  const statusColWidth = 42;
  const barTrackX = marginX + 3.5 + nameColWidth;
  const barTrackWidth = fullWidth - 7 - nameColWidth - statusColWidth;

  balances.forEach((b) => {
    const avatarRgb = hexToRgb(b.avatarColor, [13, 148, 136]);
    doc.setFillColor(avatarRgb[0], avatarRgb[1], avatarRgb[2]);
    doc.circle(marginX + 5.6, rowY + 3.1, 2.2, 'F');
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(6.3);
    doc.setTextColor(255, 255, 255);
    const initial = (b.memberName || '?').trim().charAt(0).toUpperCase();
    doc.text(initial, marginX + 5.6, rowY + 3.85, { align: 'center' });

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_INK);
    const shortName = b.memberName.length > 15 ? `${b.memberName.slice(0, 14)}…` : b.memberName;
    doc.text(shortName, marginX + 9.2, rowY + 3.9);

    // Thanh 1: Đã chi (Teal 600)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 0.8, barTrackWidth, 2, 0.7, 0.7, 'F');
    const paidW = Math.max(
      b.paidExpense > 0 ? 1.5 : 0,
      (b.paidExpense / maxVal) * barTrackWidth
    );
    if (paidW > 0) {
      doc.setFillColor(...COLOR_TEAL);
      doc.roundedRect(barTrackX, rowY + 0.8, paidW, 2, 0.7, 0.7, 'F');
    }

    // Thanh 2: Phải chịu (Slate 400)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 3.4, barTrackWidth, 2, 0.7, 0.7, 'F');
    const owedW = Math.max(
      b.owedExpense > 0 ? 1.5 : 0,
      (b.owedExpense / maxVal) * barTrackWidth
    );
    if (owedW > 0) {
      doc.setFillColor(148, 163, 184);
      doc.roundedRect(barTrackX, rowY + 3.4, owedW, 2, 0.7, 0.7, 'F');
    }

    // Pill Số dư cuối bên phải
    let balLabel = '0 đ';
    let pillBg: [number, number, number] = [241, 245, 249];
    let pillText: [number, number, number] = COLOR_MUTED;
    if (b.balance > 0) {
      pillBg = [209, 250, 229];
      pillText = COLOR_TEAL_DARK;
      balLabel = `+${formatVND(b.balance, false)} đ`;
    } else if (b.balance < 0) {
      pillBg = [255, 228, 230];
      pillText = COLOR_ROSE_DARK;
      balLabel = `${formatVND(b.balance, false)} đ`;
    }

    const pillW = 31;
    const pillX = marginX + fullWidth - 3.2 - pillW;
    doc.setFillColor(pillBg[0], pillBg[1], pillBg[2]);
    doc.roundedRect(pillX, rowY + 0.6, pillW, 4.9, 1.2, 1.2, 'F');

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(pillText[0], pillText[1], pillText[2]);
    doc.text(balLabel, marginX + fullWidth - 4.8, rowY + 3.95, { align: 'right' });

    rowY += rowHeight;
  });

  return y + totalBoxHeight + 3.2;
}

function headerHSpacer(h: number): number {
  return h;
}

export interface AppendixGridMetrics {
  fullWidth: number;
  gridGap: number;
  kpiColWidth: number;
  kpiCardHeight: number;
  kpiCardX: [number, number, number, number];
  mainColWidth: number;
  leftColX: number;
  rightColX: number;
  headerHeight: number;
  blockHeight: number;
}

/**
 * Tính toán hệ lưới Bento Grid cho Phụ lục cá nhân đảm bảo:
 * - 4 thẻ KPI hàng trên và 2 khối chính hàng dưới dùng chung `gridGap`.
 * - Cạnh phải của KPI #2 thẳng hàng tuyệt đối 100% với cạnh phải của Cột trái (`leftColX + mainColWidth`).
 * - Cạnh trái của KPI #3 thẳng hàng tuyệt đối 100% với cạnh trái của Cột phải (`rightColX`).
 */
export function computeAppendixGridMetrics(
  pageWidth: number,
  marginX: number,
  categoryCount: number,
  actionCount: number
): AppendixGridMetrics {
  const fullWidth = pageWidth - marginX * 2;
  const gridGap = 3.2;
  const kpiColWidth = (fullWidth - gridGap * 3) / 4;
  const kpiCardHeight = 20.8;
  const kpiCardX: [number, number, number, number] = [
    marginX,
    marginX + kpiColWidth + gridGap,
    marginX + (kpiColWidth + gridGap) * 2,
    marginX + (kpiColWidth + gridGap) * 3,
  ];

  const mainColWidth = (fullWidth - gridGap) / 2;
  const leftColX = marginX;
  const rightColX = marginX + mainColWidth + gridGap;
  const headerHeight = 9.8;

  const visibleCats = Math.min(6, Math.max(0, categoryCount));
  const rightNeededH = visibleCats > 0 ? headerHeight + visibleCats * 8.0 + 3.4 : 50;
  const leftNeededH =
    actionCount > 1 ? headerHeight + 21 + actionCount * 6.2 + 9.5 : 51.5;
  const blockHeight = Math.max(51.5, rightNeededH, leftNeededH);

  return {
    fullWidth,
    gridGap,
    kpiColWidth,
    kpiCardHeight,
    kpiCardX,
    mainColWidth,
    leftColX,
    rightColX,
    headerHeight,
    blockHeight,
  };
}

const flatIconCache = new Map<string, string>();

/**
 * Render hệ thống Icon Minimalist Flat-Design sắc nét (Filled Geometric Shapes)
 * chuyên biệt cho Phụ lục báo cáo cá nhân theo đúng thiết kế chuẩn Infographic.
 */
function renderFlatAppendixIconDataUrl(
  kind: string,
  fgRgb: [number, number, number],
  bgRgb?: [number, number, number]
): string | null {
  if (typeof document === 'undefined') return null;
  const key = `flat_${kind}_${fgRgb.join(',')}_${bgRgb ? bgRgb.join(',') : 'none'}`;
  const cached = flatIconCache.get(key);
  if (cached) return cached;

  try {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (bgRgb) {
      ctx.fillStyle = `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})`;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
    }

    const fg = `rgb(${fgRgb[0]}, ${fgRgb[1]}, ${fgRgb[2]})`;
    const cutBg = bgRgb ? `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})` : '#ffffff';
    ctx.fillStyle = fg;
    ctx.strokeStyle = fg;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const s = size / 24;
    ctx.save();
    ctx.scale(s, s);

    switch (kind) {
      case 'Wallet': {
        // Thân ví phẳng bo góc + nắp ví trên + khóa cài bên phải
        ctx.beginPath();
        ctx.roundRect(5.2, 7.6, 13.4, 10.2, 2.2);
        ctx.fill();

        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(6.5, 7.6);
        ctx.lineTo(15.8, 5.4);
        ctx.quadraticCurveTo(17.4, 5.1, 17.6, 6.8);
        ctx.stroke();

        ctx.fillStyle = cutBg;
        ctx.beginPath();
        ctx.roundRect(14.0, 10.6, 5.2, 4.2, 1.4);
        ctx.fill();

        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.roundRect(14.6, 11.2, 4.2, 3.0, 1.1);
        ctx.fill();

        ctx.fillStyle = cutBg;
        ctx.beginPath();
        ctx.arc(16.2, 12.7, 0.75, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'Users': {
        // 2 hình người phẳng (Flat geometric silhouettes)
        // Người phụ bên phải
        ctx.beginPath();
        ctx.arc(15.6, 9.2, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(12.2, 16.8);
        ctx.quadraticCurveTo(12.4, 12.7, 15.6, 12.7);
        ctx.quadraticCurveTo(18.8, 12.7, 19.0, 16.8);
        ctx.closePath();
        ctx.fill();

        // Viền tách nhẹ giữa 2 người
        ctx.strokeStyle = cutBg;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.arc(9.5, 8.6, 2.65, 0, Math.PI * 2);
        ctx.stroke();

        // Người chính bên trái
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(9.5, 8.6, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(5.0, 17.2);
        ctx.quadraticCurveTo(5.2, 12.3, 9.5, 12.3);
        ctx.quadraticCurveTo(13.8, 12.3, 14.0, 17.2);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'CheckSolid': {
        // Dấu tích trắng đậm trên nền tròn tím đặc
        ctx.strokeStyle = fg;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(7.2, 12.3);
        ctx.lineTo(10.6, 15.7);
        ctx.lineTo(17.0, 8.8);
        ctx.stroke();
        break;
      }
      case 'RefreshCw': {
        // Mũi tên vòng tròn cân đối (Circular balance arrow)
        ctx.strokeStyle = fg;
        ctx.lineWidth = 2.35;
        ctx.beginPath();
        ctx.arc(12, 12, 5.5, 0.35, Math.PI * 1.78);
        ctx.stroke();

        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(16.9, 5.7);
        ctx.lineTo(17.7, 10.3);
        ctx.lineTo(13.2, 9.3);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'PieChartHeader': {
        // Biểu đồ tròn phẳng trắng trên thanh tiêu đề xanh
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.moveTo(11.3, 12.7);
        ctx.arc(11.3, 12.7, 7.2, Math.PI * 0.02, Math.PI * 1.48);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(12.7, 11.3);
        ctx.arc(12.7, 11.3, 7.2, -Math.PI * 0.48, -Math.PI * 0.02);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'Plane': {
        // Máy bay phẳng nghiêng 45 độ
        const p = new Path2D(
          'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'
        );
        ctx.fill(p);
        break;
      }
      case 'Utensils': {
        // Nĩa & Dao phẳng (Flat Fork & Knife)
        ctx.lineWidth = 1.65;
        ctx.beginPath();
        ctx.moveTo(7.2, 5.2);
        ctx.lineTo(7.2, 10.2);
        ctx.moveTo(9.2, 5.2);
        ctx.lineTo(9.2, 10.2);
        ctx.moveTo(11.2, 5.2);
        ctx.lineTo(11.2, 10.2);
        ctx.stroke();

        ctx.beginPath();
        ctx.roundRect(6.5, 9.4, 5.4, 2.4, 1.1);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(8.2, 11.2, 2.0, 7.8, 0.9);
        ctx.fill();

        // Dao bên phải
        ctx.beginPath();
        ctx.moveTo(15.8, 5.0);
        ctx.quadraticCurveTo(13.2, 5.5, 13.2, 12.2);
        ctx.lineTo(14.8, 12.8);
        ctx.lineTo(14.8, 18.0);
        ctx.arc(15.7, 18.0, 0.9, Math.PI, 0, true);
        ctx.lineTo(16.6, 5.0);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'Hotel': {
        // Tòa nhà khách sạn phẳng kèm ô cửa sổ
        ctx.beginPath();
        ctx.roundRect(7.0, 5.0, 10.0, 13.5, 1.2);
        ctx.fill();
        ctx.fillRect(5.6, 17.4, 12.8, 1.5);

        ctx.fillStyle = cutBg;
        const winCoords = [
          [8.8, 6.8],
          [13.0, 6.8],
          [8.8, 9.8],
          [13.0, 9.8],
          [8.8, 12.8],
          [13.0, 12.8],
        ];
        winCoords.forEach(([wx, wy]) => {
          ctx.fillRect(wx, wy, 2.1, 1.8);
        });
        ctx.beginPath();
        ctx.roundRect(10.6, 15.4, 2.8, 3.2, 0.6);
        ctx.fill();
        break;
      }
      case 'MoreDots': {
        // 3 dấu chấm tròn ngang cho hạng mục Khác (...)
        [7.2, 12.0, 16.8].forEach((cx) => {
          ctx.beginPath();
          ctx.arc(cx, 12.0, 1.55, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      }
      case 'Car': {
        // Ô tô góc nhìn chính diện phẳng (Flat Front-View Car)
        ctx.beginPath();
        ctx.moveTo(7.4, 7.2);
        ctx.lineTo(16.6, 7.2);
        ctx.lineTo(18.4, 11.0);
        ctx.lineTo(5.6, 11.0);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.roundRect(4.8, 10.5, 14.4, 5.2, 1.8);
        ctx.fill();

        ctx.beginPath();
        ctx.roundRect(5.6, 14.8, 2.4, 2.8, 0.8);
        ctx.roundRect(16.0, 14.8, 2.4, 2.8, 0.8);
        ctx.fill();

        ctx.fillStyle = cutBg;
        ctx.beginPath();
        ctx.moveTo(8.2, 8.2);
        ctx.lineTo(15.8, 8.2);
        ctx.lineTo(16.9, 10.5);
        ctx.lineTo(7.1, 10.5);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.arc(7.4, 13.1, 1.1, 0, Math.PI * 2);
        ctx.arc(16.6, 13.1, 1.1, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'Calculator': {
        ctx.strokeStyle = fg;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.roundRect(4.5, 2.5, 15.0, 19.0, 2.4);
        ctx.stroke();

        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.roundRect(7.0, 5.2, 10.0, 3.6, 0.9);
        ctx.fill();

        const dots = [
          [8.2, 12.2],
          [12.0, 12.2],
          [15.8, 12.2],
          [8.2, 15.5],
          [12.0, 15.5],
          [15.8, 15.5],
          [8.2, 18.6],
          [12.0, 18.6],
          [15.8, 18.6],
        ];
        dots.forEach(([dx, dy]) => {
          ctx.beginPath();
          ctx.arc(dx, dy, 1.05, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      }
      default: {
        const paths = LUCIDE_ICON_PATHS[kind] || LUCIDE_ICON_PATHS.Package;
        ctx.lineWidth = 2.3;
        for (const d of paths) {
          ctx.stroke(new Path2D(d));
        }
        break;
      }
    }

    ctx.restore();
    const url = canvas.toDataURL('image/png');
    flatIconCache.set(key, url);
    return url;
  } catch {
    return null;
  }
}

function drawFlatAppendixIcon(
  doc: any,
  kind: string,
  centerX: number,
  centerY: number,
  diameterMm: number,
  fgRgb: [number, number, number],
  bgRgb?: [number, number, number]
): void {
  const url = renderFlatAppendixIconDataUrl(kind, fgRgb, bgRgb);
  if (url) {
    doc.addImage(
      url,
      'PNG',
      centerX - diameterMm / 2,
      centerY - diameterMm / 2,
      diameterMm,
      diameterMm
    );
    return;
  }
  if (bgRgb) {
    doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
    doc.circle(centerX, centerY, diameterMm / 2, 'F');
  }
}

let cachedHeroBannerBgUrl: string | null = null;

/**
 * Vẽ nền Hero Banner màu xanh Navy đậm kết hợp mảng hình học lượn sóng tối giản (Minimalist Flat Geometric Waves)
 */
function drawAppendixHeroBannerBackground(
  doc: any,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  if (typeof document !== 'undefined') {
    if (!cachedHeroBannerBgUrl) {
      try {
        const cw = 1400;
        const ch = 152;
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.beginPath();
          ctx.roundRect(0, 0, cw, ch, 22);
          ctx.clip();

          // Nền xanh Navy chủ đạo
          ctx.fillStyle = 'rgb(17, 36, 77)';
          ctx.fillRect(0, 0, cw, ch);

          // Mảng sóng hình học thứ nhất (bên phải)
          ctx.fillStyle = 'rgb(22, 48, 102)';
          ctx.beginPath();
          ctx.moveTo(cw * 0.56, 0);
          ctx.bezierCurveTo(cw * 0.68, ch * 0.25, cw * 0.75, ch * 0.85, cw * 0.89, ch);
          ctx.lineTo(cw, ch);
          ctx.lineTo(cw, 0);
          ctx.closePath();
          ctx.fill();

          // Mảng sóng hình học thứ hai (góc phải)
          ctx.fillStyle = 'rgb(28, 60, 126)';
          ctx.beginPath();
          ctx.moveTo(cw * 0.78, ch);
          ctx.bezierCurveTo(cw * 0.84, ch * 0.55, cw * 0.91, ch * 0.22, cw * 0.97, 0);
          ctx.lineTo(cw, 0);
          ctx.lineTo(cw, ch);
          ctx.closePath();
          ctx.fill();

          cachedHeroBannerBgUrl = canvas.toDataURL('image/png');
        }
      } catch {
        cachedHeroBannerBgUrl = null;
      }
    }
    if (cachedHeroBannerBgUrl) {
      doc.addImage(cachedHeroBannerBgUrl, 'PNG', x, y, width, height);
      return;
    }
  }
  doc.setFillColor(17, 36, 77);
  doc.roundedRect(x, y, width, height, 2.6, 2.6, 'F');
}

function drawCardSolidHeader(
  doc: any,
  x: number,
  y: number,
  width: number,
  headerHeight: number,
  blockHeight: number,
  radius: number,
  bodyFillRgb: [number, number, number],
  headerFillRgb: [number, number, number],
  borderRgb: [number, number, number],
  leftAccentBarRgb?: [number, number, number]
): void {
  // 1. Nền thân thẻ bo góc
  doc.setFillColor(bodyFillRgb[0], bodyFillRgb[1], bodyFillRgb[2]);
  doc.roundedRect(x, y, width, blockHeight, radius, radius, 'F');

  // 2. Thanh nhấn dọc bên trái thân thẻ (Left Vertical Accent Bar theo mockup)
  if (leftAccentBarRgb) {
    doc.setFillColor(leftAccentBarRgb[0], leftAccentBarRgb[1], leftAccentBarRgb[2]);
    doc.roundedRect(x, y, 2.4, blockHeight, radius, radius, 'F');
    doc.setFillColor(bodyFillRgb[0], bodyFillRgb[1], bodyFillRgb[2]);
    doc.roundedRect(
      x + 1.15,
      y + headerHeight,
      width - 1.15,
      blockHeight - headerHeight,
      radius,
      radius,
      'F'
    );
  }

  // 3. Thanh tiêu đề đặc (Solid Header Bar) bo góc trên, phẳng cạnh dưới
  doc.setFillColor(headerFillRgb[0], headerFillRgb[1], headerFillRgb[2]);
  doc.roundedRect(x, y, width, headerHeight, radius, radius, 'F');
  doc.rect(x, y + headerHeight - radius, width, radius, 'F');

  // 4. Viền ngoài sắc nét bao quanh toàn thẻ
  doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
  doc.setLineWidth(0.28);
  doc.roundedRect(x, y, width, blockHeight, radius, radius, 'D');
}

function drawCenteredTransferPairWithArrow(
  doc: any,
  activeFont: string,
  fontSize: number,
  leftText: string,
  rightText: string,
  centerX: number,
  baselineY: number,
  textRgb: [number, number, number],
  arrowRgb: [number, number, number]
): void {
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(fontSize);
  const leftW = doc.getTextWidth(leftText);
  const rightW = doc.getTextWidth(rightText);
  const gap = 3.2;
  const arrowLen = 5.6;
  const totalW = leftW + gap + arrowLen + gap + rightW;
  const startX = centerX - totalW / 2;

  doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
  doc.text(leftText, startX, baselineY);

  const arrowStartX = startX + leftW + gap;
  const arrowCenterY = baselineY - fontSize * 0.115;
  const headLen = 1.75;
  const headHalfH = 1.12;
  const endX = arrowStartX + arrowLen;
  const shaftEndX = endX - headLen * 0.58;

  doc.setDrawColor(arrowRgb[0], arrowRgb[1], arrowRgb[2]);
  doc.setFillColor(arrowRgb[0], arrowRgb[1], arrowRgb[2]);
  doc.setLineWidth(0.72);
  doc.line(arrowStartX, arrowCenterY, shaftEndX, arrowCenterY);
  doc.triangle(
    endX,
    arrowCenterY,
    endX - headLen,
    arrowCenterY - headHalfH,
    endX - headLen,
    arrowCenterY + headHalfH,
    'F'
  );

  const rightX = arrowStartX + arrowLen + gap;
  doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);
  doc.text(rightText, rightX, baselineY);
}

/**
 * Vẽ dòng thông tin Tài khoản nhận với ký hiệu chấm tròn rỗng (◦) ở giữa tên NH và số TK
 * Ví dụ: "TK nhận: VTB  ◦  0375090782"
 */
function drawBankInfoWithHollowDot(
  doc: any,
  activeFont: string,
  fontSize: number,
  rawBankInfo: string,
  centerX: number,
  baselineY: number,
  textRgb: [number, number, number]
): void {
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(textRgb[0], textRgb[1], textRgb[2]);

  const parts = rawBankInfo
    .split(/\s*(?:-|•|◦|\|)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const leftStr = `TK nhận: ${parts[0]}`;
    const rightStr = parts.slice(1).join(' • ');
    const leftW = doc.getTextWidth(leftStr);
    const rightW = doc.getTextWidth(rightStr);
    const dotGap = 2.3;
    const dotRadius = 0.58;
    const totalW = leftW + dotGap + dotRadius * 2 + dotGap + rightW;
    const startX = centerX - totalW / 2;

    doc.text(leftStr, startX, baselineY);

    const dotCenterX = startX + leftW + dotGap + dotRadius;
    const dotCenterY = baselineY - fontSize * 0.11;
    doc.setDrawColor(textRgb[0], textRgb[1], textRgb[2]);
    doc.setLineWidth(0.35);
    doc.circle(dotCenterX, dotCenterY, dotRadius, 'S');

    doc.text(rightStr, dotCenterX + dotRadius + dotGap, baselineY);
    return;
  }

  doc.text(`TK nhận: ${rawBankInfo}`, centerX, baselineY, { align: 'center' });
}

function drawAppendixFourKpiGrid(
  doc: any,
  activeFont: string,
  items: Array<{
    label: string;
    value: string;
    subtext: string;
    flatIconKind: string;
    topBarColor: [number, number, number];
    iconFgColor: [number, number, number];
    iconBgColor: [number, number, number];
    surfaceColor: [number, number, number];
    borderColor: [number, number, number];
    valueColor: [number, number, number];
  }>,
  metrics: AppendixGridMetrics,
  cursorY: number
): number {
  const y = ensurePageSpace(doc, cursorY, metrics.kpiCardHeight + 3);
  const colW = metrics.kpiColWidth;
  const boxH = metrics.kpiCardHeight;
  const radius = 2.4;
  const topBarH = 1.35;

  items.slice(0, 4).forEach((item, idx) => {
    const x = metrics.kpiCardX[idx];

    // 1. Vẽ thanh màu nhấn phía trên thẻ (Top Colored Accent Bar) + thân thẻ pastel
    doc.setFillColor(item.topBarColor[0], item.topBarColor[1], item.topBarColor[2]);
    doc.roundedRect(x, y, colW, boxH, radius, radius, 'F');

    doc.setFillColor(item.surfaceColor[0], item.surfaceColor[1], item.surfaceColor[2]);
    doc.roundedRect(x, y + topBarH, colW, boxH - topBarH, radius, radius, 'F');

    doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
    doc.setLineWidth(0.26);
    doc.roundedRect(x, y, colW, boxH, radius, radius, 'D');

    // 2. Badge Icon phẳng kích thước lớn bên trái (bao trọn chiều cao của Nhãn + Chỉ số)
    const iconDiameter = 8.4;
    const iconCenterX = x + 6.3;
    const iconCenterY = y + 8.0;
    drawFlatAppendixIcon(
      doc,
      item.flatIconKind,
      iconCenterX,
      iconCenterY,
      iconDiameter,
      item.iconFgColor,
      item.iconBgColor
    );

    // 3. Nhãn in hoa đậm + Chỉ số chính đặt bên phải Badge Icon (hoặc căn giữa vùng bên phải)
    const textLeftX = x + 11.8;
    const availableTextW = colW - 13.0;

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.1);
    doc.setTextColor(15, 28, 56);
    doc.text(item.label.toUpperCase(), textLeftX, y + 6.2);

    doc.setFont(activeFont, 'bold');
    let valFontSize = 11.8;
    doc.setFontSize(valFontSize);
    while (doc.getTextWidth(item.value) > availableTextW && valFontSize > 8.4) {
      valFontSize -= 0.35;
      doc.setFontSize(valFontSize);
    }
    doc.setTextColor(item.valueColor[0], item.valueColor[1], item.valueColor[2]);
    doc.text(item.value, textLeftX, y + 12.1);

    // 4. Dòng mô tả phụ (Subtext) căn giữa toàn chiều ngang thẻ ở phía dưới
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.1);
    doc.setTextColor(30, 41, 59);
    const cleanSub =
      item.subtext.length > 31 ? `${item.subtext.slice(0, 30)}…` : item.subtext;
    doc.text(cleanSub, x + colW / 2, y + 17.8, { align: 'center' });
  });

  return y + boxH + metrics.gridGap;
}

const APPENDIX_CATEGORY_FLAT_THEME: Record<
  string,
  {
    flatKind: string;
    iconFg: [number, number, number];
    iconBg: [number, number, number];
    textColor: [number, number, number];
    barColor: [number, number, number];
  }
> = {
  Plane: {
    flatKind: 'Plane',
    iconFg: [24, 98, 236],
    iconBg: [212, 232, 255],
    textColor: [20, 86, 218],
    barColor: [37, 109, 245],
  },
  Utensils: {
    flatKind: 'Utensils',
    iconFg: [232, 132, 20],
    iconBg: [254, 234, 202],
    textColor: [224, 124, 14],
    barColor: [242, 146, 29],
  },
  Hotel: {
    flatKind: 'Hotel',
    iconFg: [118, 56, 218],
    iconBg: [233, 218, 255],
    textColor: [114, 48, 212],
    barColor: [122, 60, 224],
  },
  Package: {
    flatKind: 'MoreDots',
    iconFg: [64, 82, 104],
    iconBg: [222, 230, 238],
    textColor: [64, 82, 104],
    barColor: [13, 148, 136],
  },
  Car: {
    flatKind: 'Car',
    iconFg: [16, 152, 108],
    iconBg: [209, 247, 232],
    textColor: [16, 148, 104],
    barColor: [16, 158, 114],
  },
  Ticket: {
    flatKind: 'Ticket',
    iconFg: [219, 39, 119],
    iconBg: [252, 224, 240],
    textColor: [190, 24, 93],
    barColor: [219, 39, 119],
  },
};

function drawAppendixCategoryCard(
  doc: any,
  activeFont: string,
  memberName: string,
  categories: ReportCategoryBreakdown[],
  x: number,
  y: number,
  width: number,
  headerHeight: number,
  blockHeight: number
): void {
  const headerBlue: [number, number, number] = [14, 73, 166];
  const borderSlate: [number, number, number] = [208, 218, 230];

  drawCardSolidHeader(
    doc,
    x,
    y,
    width,
    headerHeight,
    blockHeight,
    2.4,
    [255, 255, 255],
    headerBlue,
    borderSlate
  );

  drawFlatAppendixIcon(
    doc,
    'PieChartHeader',
    x + 7.2,
    y + headerHeight / 2,
    5.8,
    [255, 255, 255]
  );
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Chi phí theo Hạng mục (${memberName})`, x + 12.2, y + 6.5);

  const visibleCats = categories.slice(0, 6);
  if (visibleCats.length === 0) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(8.2);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(
      `${memberName} chưa phát sinh chi phí theo hạng mục.`,
      x + width / 2,
      y + headerHeight + (blockHeight - headerHeight) / 2,
      { align: 'center' }
    );
    return;
  }

  const bodyTopY = y + headerHeight + 2.3;
  const availableBodyH = blockHeight - headerHeight - 3.6;
  const stepY = Math.min(8.3, availableBodyH / visibleCats.length);
  const badgeDiameter = 5.7;
  const badgeCenterX = x + 3.8 + badgeDiameter / 2;
  const textStartX = x + 3.8 + badgeDiameter + 2.2;
  const trackW = width - (textStartX - x) - 4.2;

  visibleCats.forEach((cat, idx) => {
    const rowY = bodyTopY + idx * stepY;
    const flatTheme =
      APPENDIX_CATEGORY_FLAT_THEME[cat.categoryIcon] ||
      APPENDIX_CATEGORY_FLAT_THEME.Package;
    const label = shortenCategoryLabelForTable(cat.categoryName);

    drawFlatAppendixIcon(
      doc,
      flatTheme.flatKind,
      badgeCenterX,
      rowY + 3.25,
      badgeDiameter,
      flatTheme.iconFg,
      flatTheme.iconBg
    );

    // Dòng 1: Tên hạng mục đậm + "• X khoản" bên trái; Số tiền + % màu sắc bên phải
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(15, 23, 42);
    doc.text(label, textStartX, rowY + 2.8);
    const labelW = doc.getTextWidth(label);

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(30, 41, 59);
    doc.text(` • ${cat.count} khoản`, textStartX + labelW, rowY + 2.8);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(
      flatTheme.textColor[0],
      flatTheme.textColor[1],
      flatTheme.textColor[2]
    );
    doc.text(
      `${formatVND(cat.amount, false)} đ (${cat.percentage}%)`,
      x + width - 4.2,
      rowY + 2.8,
      { align: 'right' }
    );

    // Dòng 2: Thanh progress bar phẳng bo tròn sắc nét
    const barY = rowY + 4.15;
    const barH = 2.15;
    doc.setFillColor(235, 240, 246);
    doc.roundedRect(textStartX, barY, trackW, barH, 1.05, 1.05, 'F');

    const ratio = Math.max(0, Math.min(1, cat.percentage / 100));
    const fillW = Math.max(ratio > 0 ? 3.2 : 0, trackW * ratio);
    if (fillW > 0) {
      doc.setFillColor(
        flatTheme.barColor[0],
        flatTheme.barColor[1],
        flatTheme.barColor[2]
      );
      doc.roundedRect(textStartX, barY, fillW, barH, 1.05, 1.05, 'F');
    }
  });
}

function renderMemberAppendixSection(
  doc: any,
  autoTableFn: any,
  activeFont: string,
  report: ExpenseReportData,
  appendix: MemberAppendixData,
  badgeLabel: string,
  marginX: number,
  startCursorY: number,
  pageWidth: number
): number {
  let cursorY = startCursorY;
  const actions = appendix.finalSettlementActions;
  const metrics = computeAppendixGridMetrics(
    pageWidth,
    marginX,
    appendix.byCategory.length,
    actions.length
  );
  const { fullWidth, gridGap, mainColWidth, leftColX, rightColX, headerHeight, blockHeight } =
    metrics;

  // ==========================================================================
  // 1. HERO HEADER CHO TRANG PHỤ LỤC CÁ NHÂN (MINIMALIST GEOMETRIC WAVE BANNER)
  // ==========================================================================
  const bannerH = 19.0;
  drawAppendixHeroBannerBackground(doc, marginX, cursorY, fullWidth, bannerH);

  const avatarRgb = hexToRgb(appendix.avatarColor, [206, 34, 70]);
  doc.setFillColor(avatarRgb[0], avatarRgb[1], avatarRgb[2]);
  doc.circle(marginX + 9.4, cursorY + bannerH / 2, 5.2, 'F');
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(12.2);
  doc.setTextColor(255, 255, 255);
  doc.text(
    (appendix.memberName || '?').trim().charAt(0).toUpperCase(),
    marginX + 9.4,
    cursorY + bannerH / 2 + 1.5,
    { align: 'center' }
  );

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(45, 212, 168);
  doc.text(`${badgeLabel}  •  ${report.tripName.toUpperCase()}`, marginX + 18.0, cursorY + 6.9);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(14.0);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `QUYẾT TOÁN CÁ NHÂN: ${appendix.memberName.toUpperCase()}`,
    marginX + 18.0,
    cursorY + 14.4
  );

  if (appendix.bankInfo) {
    doc.setFillColor(24, 48, 98);
    doc.setDrawColor(56, 86, 148);
    doc.setLineWidth(0.22);
    const bankText = `TK cá nhân: ${appendix.bankInfo}`;
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.3);
    const bw = Math.min(78, doc.getTextWidth(bankText) + 6);
    doc.roundedRect(pageWidth - marginX - bw - 3.2, cursorY + 5.5, bw, 8, 1.5, 1.5, 'FD');
    doc.setTextColor(226, 232, 240);
    doc.text(bankText, pageWidth - marginX - 6.2, cursorY + 10.4, { align: 'right' });
  }

  cursorY += bannerH + gridGap;

  // ==========================================================================
  // 2. HÀNG GRID 4 Ô KPI CÁ NHÂN (FLAT DESIGN + TOP ACCENT BAR + LARGE LEFT BADGE)
  // ==========================================================================
  const isPositive = appendix.balance > 0;
  const isNegative = appendix.balance < 0;
  const balanceTopBar: [number, number, number] = isPositive
    ? [16, 185, 129]
    : isNegative
      ? [242, 58, 92]
      : [100, 116, 139];
  const balanceAccent: [number, number, number] = isPositive
    ? [12, 120, 86]
    : isNegative
      ? [194, 18, 52]
      : COLOR_SLATE;
  const balanceSurface: [number, number, number] = isPositive
    ? [230, 250, 242]
    : isNegative
      ? [254, 234, 237]
      : [248, 250, 252];
  const balanceBorder: [number, number, number] = isPositive
    ? [167, 243, 208]
    : isNegative
      ? [252, 198, 208]
      : [226, 232, 240];
  const balanceIconBg: [number, number, number] = isPositive
    ? [198, 243, 226]
    : isNegative
      ? [253, 210, 218]
      : [226, 232, 240];

  const balanceStatusText = isPositive
    ? 'Số tiền được nhận về'
    : isNegative
      ? 'Số tiền cần chuyển trả'
      : 'Đã cân bằng thu chi';
  const balPrefix = isPositive ? '+' : '';

  const hasMemberTransfers =
    appendix.sentTransfer > 0 || appendix.receivedTransfer > 0;
  const shareRatioPct =
    report.overview.totalExpenseAmount > 0
      ? Math.round((appendix.paidExpense / report.overview.totalExpenseAmount) * 1000) / 10
      : 0;

  cursorY = drawAppendixFourKpiGrid(
    doc,
    activeFont,
    [
      {
        label: 'ĐÃ CHI',
        value: `${formatVND(appendix.paidExpense, false)} đ`,
        subtext: `${appendix.paidRows.filter((r) => r.recordType === 'expense').length} khoản (${shareRatioPct}% tổng chi)`,
        flatIconKind: 'Wallet',
        topBarColor: [16, 185, 129],
        iconFgColor: [14, 142, 98],
        iconBgColor: [198, 243, 226],
        surfaceColor: [230, 250, 242],
        borderColor: [176, 240, 216],
        valueColor: [12, 118, 84],
      },
      {
        label: 'PHẢI CHỊU',
        value: `${formatVND(appendix.owedExpense, false)} đ`,
        subtext: `Tham gia ${appendix.participatedRows.filter((r) => r.recordType === 'expense').length} khoản chi`,
        flatIconKind: 'Users',
        topBarColor: [43, 122, 246],
        iconFgColor: [29, 98, 232],
        iconBgColor: [196, 224, 255],
        surfaceColor: [232, 244, 255],
        borderColor: [188, 218, 255],
        valueColor: [15, 32, 68],
      },
      hasMemberTransfers
        ? {
            label: 'ĐÃ CHUYỂN / NHẬN',
            value: `${formatVND(appendix.netTransfer, false)} đ`,
            subtext: `Chuyển ${formatVND(appendix.sentTransfer, false)} / Nhận ${formatVND(appendix.receivedTransfer, false)}`,
            flatIconKind: 'CheckSolid',
            topBarColor: [132, 62, 236],
            iconFgColor: [255, 255, 255],
            iconBgColor: [122, 50, 224],
            surfaceColor: [243, 235, 255],
            borderColor: [216, 198, 252],
            valueColor: [24, 28, 64],
          }
        : {
            label: 'GIAO DỊCH TẤT TOÁN',
            value:
              actions.length > 0
                ? `${actions.length} giao dịch`
                : 'Không cần chuyển',
            subtext:
              actions.length > 0
                ? isNegative
                  ? 'Chuyển khoản tất toán'
                  : 'Nhận tiền tất toán'
                : 'Đã cân bằng',
            flatIconKind: 'CheckSolid',
            topBarColor: [132, 62, 236],
            iconFgColor: [255, 255, 255],
            iconBgColor: [122, 50, 224],
            surfaceColor: [243, 235, 255],
            borderColor: [216, 198, 252],
            valueColor: [24, 28, 64],
          },
      {
        label: 'SỐ DƯ CUỐI',
        value: `${balPrefix}${formatVND(appendix.balance, false)} đ`,
        subtext: balanceStatusText,
        flatIconKind: 'RefreshCw',
        topBarColor: balanceTopBar,
        iconFgColor: balanceAccent,
        iconBgColor: balanceIconBg,
        surfaceColor: balanceSurface,
        borderColor: balanceBorder,
        valueColor: balanceAccent,
      },
    ],
    metrics,
    cursorY
  );

  // ==========================================================================
  // 3. GRID 2 CỘT CÂN ĐỐI 50/50:
  //    - Cột trái: Nổi bật chỉ số quan trọng nhất (SỐ TIỀN CẦN CHUYỂN TRẢ / NHẬN VỀ)
  //    - Cột phải: Chi phí theo Hạng mục (cùng chiều rộng & chiều cao)
  // ==========================================================================
  cursorY = ensurePageSpace(doc, cursorY, blockHeight + 4);

  const leftHeaderFill: [number, number, number] = isNegative
    ? [196, 24, 60]
    : isPositive
      ? [13, 148, 136]
      : [51, 65, 85];
  const leftAccentStripe: [number, number, number] = isNegative
    ? [238, 42, 82]
    : isPositive
      ? [16, 185, 129]
      : [100, 116, 139];
  const leftBodyFill: [number, number, number] = isNegative
    ? [254, 246, 247]
    : isPositive
      ? [242, 252, 249]
      : [248, 250, 252];
  const leftBorderColor: [number, number, number] = isNegative
    ? [244, 192, 202]
    : isPositive
      ? [167, 243, 208]
      : [208, 218, 230];
  const leftHeaderTitle = isNegative
    ? 'SỐ TIỀN CẦN CHUYỂN TRẢ'
    : isPositive
      ? 'SỐ TIỀN ĐƯỢC NHẬN VỀ'
      : 'KẾT QUẢ QUYẾT TOÁN CÁ NHÂN';

  drawCardSolidHeader(
    doc,
    leftColX,
    cursorY,
    mainColWidth,
    headerHeight,
    blockHeight,
    2.4,
    leftBodyFill,
    leftHeaderFill,
    leftBorderColor,
    leftAccentStripe
  );

  drawIconBadge(doc, 'Send', leftColX + 5.2, cursorY + 2.3, 5.2, [255, 255, 255]);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(leftHeaderTitle, leftColX + 12.2, cursorY + 6.5);

  const leftCenterX = leftColX + mainColWidth / 2 + 0.4;
  const heroPrimaryAmount = `${isPositive ? '+' : ''}${formatVND(Math.abs(appendix.balance), false)} đ`;
  const heroPrimaryColor: [number, number, number] = isNegative
    ? [194, 18, 52]
    : isPositive
      ? [12, 120, 86]
      : COLOR_SLATE;

  if (actions.length <= 1) {
    // 1. CHỈ SỐ QUAN TRỌNG NHẤT: Số tiền quyết toán kích thước lớn nổi bật ở tâm điểm
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(25.0);
    doc.setTextColor(heroPrimaryColor[0], heroPrimaryColor[1], heroPrimaryColor[2]);
    doc.text(heroPrimaryAmount, leftCenterX, cursorY + headerHeight + 12.4, {
      align: 'center',
    });

    // 2. Hộp Pill hiển thị cặp chuyển khoản (VD: Loan → Nhi)
    const pillX = leftColX + 4.8;
    const pillY = cursorY + headerHeight + 15.6;
    const pillW = mainColWidth - 8.8;
    const pillH = 10.2;
    const pillFill: [number, number, number] = isNegative
      ? [251, 224, 229]
      : isPositive
        ? [209, 250, 229]
        : [226, 232, 240];

    doc.setFillColor(pillFill[0], pillFill[1], pillFill[2]);
    doc.roundedRect(pillX, pillY, pillW, pillH, 2.3, 2.3, 'F');

    if (actions.length === 1) {
      const act = actions[0];
      drawCenteredTransferPairWithArrow(
        doc,
        activeFont,
        14.0,
        act.fromMemberName,
        act.toMemberName,
        leftCenterX,
        pillY + 6.9,
        [15, 28, 63],
        isNegative ? [198, 26, 60] : [13, 148, 136]
      );

      // 3. Hàng thông tin Tài khoản nhận đặt ngay dưới Pill (với chấm tròn rỗng ◦ như mockup)
      const rawBank = act.toBankInfo || appendix.bankInfo || 'Chưa cập nhật STK';
      drawBankInfoWithHollowDot(
        doc,
        activeFont,
        9.6,
        rawBank,
        leftCenterX,
        pillY + pillH + 5.8,
        [15, 28, 63]
      );
    } else {
      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8.8);
      doc.setTextColor(...COLOR_SLATE);
      doc.text(
        `${appendix.memberName} đã cân bằng thu chi • Không cần chuyển khoản`,
        leftCenterX,
        pillY + 6.4,
        { align: 'center' }
      );

      drawBankInfoWithHollowDot(
        doc,
        activeFont,
        9.0,
        appendix.bankInfo || 'Chưa cập nhật STK',
        leftCenterX,
        pillY + pillH + 5.8,
        COLOR_SLATE
      );
    }
  } else {
    // Trường hợp thành viên có >= 2 giao dịch tất toán
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(19.5);
    doc.setTextColor(heroPrimaryColor[0], heroPrimaryColor[1], heroPrimaryColor[2]);
    doc.text(heroPrimaryAmount, leftCenterX, cursorY + headerHeight + 9.6, {
      align: 'center',
    });

    const pillX = leftColX + 4.8;
    const pillY = cursorY + headerHeight + 12.2;
    const pillW = mainColWidth - 8.8;
    const pillH = actions.length * 6.0 + 2.4;
    const pillFill: [number, number, number] = isNegative
      ? [251, 224, 229]
      : [209, 250, 229];

    doc.setFillColor(pillFill[0], pillFill[1], pillFill[2]);
    doc.roundedRect(pillX, pillY, pillW, pillH, 2.0, 2.0, 'F');

    let actY = pillY + 4.6;
    actions.forEach((act) => {
      const isSender = act.fromMemberId === appendix.memberId;
      drawTransferPairWithArrow(
        doc,
        activeFont,
        'bold',
        8.4,
        act.fromMemberName,
        act.toMemberName,
        pillX + 3.2,
        actY,
        [15, 28, 63],
        isSender ? [198, 26, 60] : [13, 148, 136],
        [15, 28, 63]
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...(isSender ? COLOR_ROSE_DARK : COLOR_TEAL_DARK));
      doc.text(
        `${isSender ? '' : '+'}${formatVND(act.amount, false)} đ`,
        pillX + pillW - 3.2,
        actY,
        { align: 'right' }
      );
      actY += 6.0;
    });

    const firstBank = actions.find((a) => a.toBankInfo)?.toBankInfo || appendix.bankInfo;
    if (firstBank) {
      drawBankInfoWithHollowDot(
        doc,
        activeFont,
        8.2,
        firstBank,
        leftCenterX,
        pillY + pillH + 4.6,
        [15, 28, 63]
      );
    }
  }

  // 4. Dòng công thức tính nhanh kèm icon Calculator dưới đáy hộp Quyết toán cá nhân
  const formulaLineY = cursorY + blockHeight - 7.6;
  doc.setDrawColor(214, 220, 230);
  doc.setLineWidth(0.22);
  doc.line(leftColX + 4.6, formulaLineY, leftColX + mainColWidth - 4.0, formulaLineY);

  drawFlatAppendixIcon(
    doc,
    'Calculator',
    leftColX + 6.4,
    cursorY + blockHeight - 3.9,
    4.0,
    [38, 66, 104]
  );
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.95);
  doc.setTextColor(30, 41, 59);
  doc.text(
    `Tính toán: Đã chi (${formatVND(appendix.paidExpense, false)}) - Phải chịu (${formatVND(appendix.owedExpense, false)}) = ${balPrefix}${formatVND(appendix.balance, false)} đ`,
    leftColX + 9.4,
    cursorY + blockHeight - 2.9
  );

  // Vẽ Cột phải: Thẻ Chi phí theo Hạng mục đồng bộ chiều cao & header
  drawAppendixCategoryCard(
    doc,
    activeFont,
    appendix.memberName,
    appendix.byCategory,
    rightColX,
    cursorY,
    mainColWidth,
    headerHeight,
    blockHeight
  );

  cursorY += blockHeight + 4.8;

  // Bảng các khoản thành viên đã chi
  cursorY = ensurePageSpace(doc, cursorY, 20);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...COLOR_INK);
  doc.text(
    `CÁC KHOẢN ${appendix.memberName.toUpperCase()} ĐÃ CHI (${appendix.paidRows.length} KHOẢN)`,
    marginX,
    cursorY + 3
  );
  cursorY += 4.2;

  if (typeof autoTableFn === 'function') {
    const paidBody = appendix.paidRows.map((r, i) => [
      `${i + 1}`,
      r.date,
      r.title,
      r.participantsSummary,
      r.compactTypeLabel,
      r.amountFormatted,
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: [
        [
          { content: '#', styles: { halign: 'center' } },
          'Thời gian',
          'Nội dung khoản chi',
          'Chia cho',
          'Hạng mục',
          { content: 'Số tiền (đ)', styles: { halign: 'right' } },
        ],
      ],
      body:
        paidBody.length > 0
          ? paidBody
          : [['—', '—', `${appendix.memberName} chưa chi khoản nào`, '—', '—', '0']],
      foot:
        paidBody.length > 0
          ? [
              [
                {
                  content: `TỔNG ĐÃ CHI (${appendix.paidRows.length} khoản)`,
                  colSpan: 5,
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_INK },
                },
                {
                  content: formatVND(appendix.paidExpense, false),
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
                },
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX, bottom: 14 },
      styles: {
        font: activeFont,
        fontSize: 7.8,
        cellPadding: 1.65,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.12,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: [30, 41, 59],
        lineWidth: 0.15,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [240, 253, 250],
        textColor: COLOR_TEAL_DARK,
        lineColor: [153, 246, 228],
        lineWidth: 0.2,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 27 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 32, textColor: COLOR_SLATE },
        4: { cellWidth: 24, textColor: COLOR_SLATE },
        5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            data.cell.text = [''];
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            const [p1, p2] = raw.split('→').map((s) => s.trim());
            const textX = data.cell.x + data.cell.padding('left');
            const midY = data.cell.y + data.cell.height / 2 + 0.9;
            drawTransferPairWithArrow(
              doc,
              activeFont,
              'normal',
              7.6,
              p1 || '',
              p2 || '',
              textX,
              midY,
              COLOR_SLATE,
              COLOR_TEAL,
              COLOR_SLATE
            );
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 10) + 5;
  }

  return cursorY;
}

function stampPageFooters(doc: any, activeFont: string, report: ExpenseReportData): void {
  const totalPages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 10.5, pageWidth - marginX, pageHeight - 10.5);

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      `TdyTrip  •  ${report.tripName}  •  Báo cáo chi tiêu & quyết toán`,
      marginX,
      pageHeight - 6.8
    );
    doc.setFont(activeFont, 'bold');
    doc.text(`Trang ${p} / ${totalPages}`, pageWidth - marginX, pageHeight - 6.8, {
      align: 'right',
    });
  }
}

export async function exportExpenseReportPdf(report: ExpenseReportData): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(
      'Cần kết nối Internet để xuất báo cáo PDF. Các chức năng ghi chép và quyết toán vẫn hoạt động Offline bình thường.'
    );
  }
  await loadExternalScript(JSPDF_CDN_URL);
  await loadExternalScript(AUTOTABLE_CDN_URL);

  const win = window as unknown as {
    jspdf?: { jsPDF: new (options?: Record<string, unknown>) => any };
    jsPDF?: new (options?: Record<string, unknown>) => any;
  };

  const JsPDFConstructor = win.jspdf?.jsPDF || win.jsPDF;
  if (!JsPDFConstructor) {
    throw new Error('Không khởi tạo được thư viện jsPDF từ CDN.');
  }

  const doc = new JsPDFConstructor({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const fonts = await ensureRobotoFontsLoaded();
  let activeFont = 'helvetica';

  if (fonts) {
    doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Medium.ttf', fonts.medium);
    doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto', 'normal');
    activeFont = 'Roboto';
  }

  const autoTableFn = (doc as any).autoTable || (win as any).jspdf?.autoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  // Trường hợp lọc theo 1 thành viên cụ thể: Xuất báo cáo cá nhân
  if (report.filterMemberId !== 'all' && report.memberAppendices.length > 0) {
    renderMemberAppendixSection(
      doc,
      autoTableFn,
      activeFont,
      report,
      report.memberAppendices[0],
      'BÁO CÁO QUYẾT TOÁN CÁ NHÂN',
      marginX,
      10.5,
      pageWidth
    );
    stampPageFooters(doc, activeFont, report);
    doc.save(report.suggestedFileName);
    return;
  }

  // ==========================================================================
  // TRANG 1: TỔNG QUAN CHUYẾN ĐI & KẾT QUẢ QUYẾT TOÁN
  // ==========================================================================
  let cursorY = drawExecutiveMasthead(
    doc,
    activeFont,
    report,
    'BÁO CÁO CHI TIÊU & QUYẾT TOÁN',
    marginX,
    10,
    pageWidth
  );

  // PHẦN 01: TỔNG QUAN CHI TIÊU
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '01',
    'TỔNG QUAN CHI TIÊU',
    `${report.overview.memberCount} thành viên  •  ${report.overview.expenseCount} khoản chi`,
    marginX,
    cursorY,
    pageWidth
  );

  const topCat = report.overview.byCategory[0];
  const topPayer = [...report.settlement.balances].sort(
    (a, b) => b.paidExpense - a.paidExpense
  )[0];
  const topPayerPct =
    topPayer && report.overview.totalExpenseAmount > 0
      ? Math.round((topPayer.paidExpense / report.overview.totalExpenseAmount) * 1000) / 10
      : 0;

  cursorY = drawFourKpiRow(
    doc,
    activeFont,
    [
      {
        label: 'Tổng chi tiêu',
        value: `${formatVND(report.overview.totalExpenseAmount, false)} đ`,
        subtext: `${report.overview.expenseCount} khoản chi • ${report.overview.byDay.length} ngày`,
        iconName: 'Wallet',
        accentColor: COLOR_TEAL,
        surfaceColor: [240, 253, 250],
        borderColor: [153, 246, 228],
        iconBgColor: [204, 251, 241],
        valueColor: COLOR_TEAL_DARK,
      },
      {
        label: 'Bình quân / người',
        value: `${formatVND(report.overview.averagePerMember, false)} đ`,
        subtext: `Chia cho ${report.overview.memberCount} thành viên`,
        iconName: 'Users',
        accentColor: [37, 99, 235],
        surfaceColor: [239, 246, 255],
        borderColor: [191, 219, 254],
        iconBgColor: [219, 234, 254],
        valueColor: [30, 64, 175],
      },
      {
        label: 'Hạng mục lớn nhất',
        value: topCat ? `${formatVND(topCat.amount, false)} đ` : '0 đ',
        subtext: topCat
          ? `${shortenCategoryLabelForTable(topCat.categoryName)} (${topCat.percentage}%)`
          : 'Chưa phát sinh',
        iconName: topCat?.categoryIcon || 'PieChart',
        accentColor: [217, 119, 6],
        surfaceColor: [255, 251, 235],
        borderColor: [253, 230, 138],
        iconBgColor: [254, 243, 199],
        valueColor: [180, 83, 9],
      },
      report.overview.totalTransferAmount > 0
        ? {
            label: 'Đã chuyển trả',
            value: `${formatVND(report.overview.totalTransferAmount, false)} đ`,
            subtext: `${report.overview.transferCount} giao dịch đã chuyển`,
            iconName: 'ArrowRightLeft',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: [109, 40, 217],
          }
        : {
            label: 'Chi nhiều nhất',
            value: topPayer ? `${formatVND(topPayer.paidExpense, false)} đ` : '0 đ',
            subtext: topPayer
              ? `${topPayer.memberName} (${topPayerPct}% tổng chi)`
              : 'Chưa phát sinh',
            iconName: 'Award',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: [109, 40, 217],
          },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // 2 Biểu đồ đặt song song 2 cột (Chi tiêu theo Hạng mục & Chi tiêu theo Ngày) kèm Icon
  cursorY = drawSideBySideOverviewCharts(
    doc,
    activeFont,
    report.overview.byCategory,
    report.overview.byDay,
    marginX,
    cursorY,
    pageWidth
  );

  // PHẦN 02: QUYẾT TOÁN CHIA TIỀN
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '02',
    'CÂN ĐỐI THU CHI & QUYẾT TOÁN',
    `${report.settlement.simplifiedDebts.length} giao dịch tất toán`,
    marginX,
    cursorY,
    pageWidth
  );

  // Biểu đồ tương quan Đã chi vs. Phải chịu kèm Avatar tròn
  cursorY = drawMemberBalanceComparisonChart(
    doc,
    activeFont,
    report.settlement.balances,
    marginX,
    cursorY,
    pageWidth
  );

  const hasAnyTransfers = report.overview.totalTransferAmount > 0;

  // Bảng 2.1: Bảng cân đối tổng hợp từng thành viên (Cột cuối Trạng thái canh phải)
  if (typeof autoTableFn === 'function') {
    const balanceHead = hasAnyTransfers
      ? [
          [
            'Thành viên',
            { content: 'Đã chi (đ)', styles: { halign: 'right' } },
            { content: 'Phải chịu (đ)', styles: { halign: 'right' } },
            { content: 'Đã chuyển (đ)', styles: { halign: 'right' } },
            { content: 'Số dư cuối (đ)', styles: { halign: 'right' } },
            { content: 'Trạng thái', styles: { halign: 'right' } },
          ],
        ]
      : [
          [
            'Thành viên',
            { content: 'Đã chi (đ)', styles: { halign: 'right' } },
            { content: 'Phải chịu (đ)', styles: { halign: 'right' } },
            { content: 'Số dư cuối (đ)', styles: { halign: 'right' } },
            { content: 'Trạng thái', styles: { halign: 'right' } },
          ],
        ];

    const balanceRows = report.settlement.balances.map((b) => {
      const prefix = b.balance > 0 ? '+' : '';
      const status =
        b.balance > 0 ? 'Nhận về' : b.balance < 0 ? 'Cần chuyển' : 'Đã cân bằng';
      if (hasAnyTransfers) {
        return [
          b.memberName,
          formatVND(b.paidExpense, false),
          formatVND(b.owedExpense, false),
          formatVND(b.netTransfer, false),
          `${prefix}${formatVND(b.balance, false)}`,
          status,
        ];
      }
      return [
        b.memberName,
        formatVND(b.paidExpense, false),
        formatVND(b.owedExpense, false),
        `${prefix}${formatVND(b.balance, false)}`,
        status,
      ];
    });

    autoTableFn.call(doc, {
      startY: cursorY,
      rowPageBreak: 'avoid',
      head: balanceHead,
      body: balanceRows,
      margin: { left: marginX, right: marginX, bottom: 14 },
      styles: {
        font: activeFont,
        fontSize: 8.1,
        cellPadding: 1.8,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.12,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: [30, 41, 59],
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: hasAnyTransfers
        ? {
            0: { cellWidth: 34, fontStyle: 'bold' },
            1: { cellWidth: 30, halign: 'right' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
            5: { cellWidth: 'auto', halign: 'right' },
          }
        : {
            0: { cellWidth: 38, fontStyle: 'bold' },
            1: { cellWidth: 36, halign: 'right' },
            2: { cellWidth: 36, halign: 'right' },
            3: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
            4: { cellWidth: 'auto', halign: 'right' },
          },
      didParseCell: (data: any) => {
        const balColIdx = hasAnyTransfers ? 4 : 3;
        const statusColIdx = hasAnyTransfers ? 5 : 4;
        if (data.section === 'body' && (data.column.index === balColIdx || data.column.index === statusColIdx)) {
          const rawText = String(data.cell.raw || '');
          if (rawText.startsWith('+') || rawText === 'Nhận về') {
            data.cell.styles.textColor = COLOR_TEAL_DARK;
            data.cell.styles.fontStyle = 'bold';
          } else if (rawText.startsWith('-') || rawText === 'Cần chuyển') {
            data.cell.styles.textColor = COLOR_ROSE_DARK;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 3.8;
  }

  // Bảng 2.2: DANH SÁCH CHUYỂN KHOẢN QUYẾT TOÁN (Nổi bật nhất trên Trang 1, cột cuối canh phải)
  cursorY = ensurePageSpace(doc, cursorY, 22);
  drawIconBadge(doc, 'Send', marginX, cursorY - 0.5, 4.4, [15, 118, 110], [204, 251, 241]);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...COLOR_TEAL_DARK);
  doc.text(
    'DANH SÁCH CHUYỂN KHOẢN QUYẾT TOÁN',
    marginX + 5.6,
    cursorY + 2.8
  );
  cursorY += 4.2;

  if (typeof autoTableFn === 'function') {
    const hasDebts = report.settlement.simplifiedDebts.length > 0;
    const simplifiedBody = report.settlement.simplifiedDebts.map((d, idx) => [
      `${idx + 1}`,
      `${d.fromMemberName} → ${d.toMemberName}`,
      formatVND(d.amount, false),
      d.toBankInfo || 'Chưa cập nhật STK',
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      rowPageBreak: 'avoid',
      head: [
        [
          { content: '#', styles: { halign: 'center' } },
          '', // Vẽ tiêu đề "Người chuyển → Người nhận" bằng vector arrow trong didDrawCell
          { content: 'Số tiền chuyển (đ)', styles: { halign: 'right' } },
          { content: 'Tài khoản nhận', styles: { halign: 'right' } },
        ],
      ],
      body: hasDebts
        ? simplifiedBody
        : [['—', 'Tất cả thành viên đã cân bằng thu chi', '0', '—']],
      margin: { left: marginX, right: marginX, bottom: 14 },
      styles: {
        font: activeFont,
        fontSize: 8.4,
        cellPadding: 2,
        textColor: COLOR_INK,
        lineColor: [153, 246, 228],
        lineWidth: 0.16,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: COLOR_TEAL_DARK,
        textColor: [255, 255, 255],
      },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 56, fontStyle: 'bold' },
        2: { cellWidth: 42, halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
        3: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold', textColor: COLOR_SLATE },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1 && hasDebts) {
          // Xóa text mặc định để vẽ tên + mũi tên vector sắc nét trong didDrawCell
          data.cell.text = [''];
        }
      },
      didDrawCell: (data: any) => {
        if (data.column.index === 1) {
          const textX = data.cell.x + data.cell.padding('left');
          const midY = data.cell.y + data.cell.height / 2 + 1;
          if (data.section === 'head') {
            drawTransferPairWithArrow(
              doc,
              activeFont,
              'bold',
              8.3,
              'Người chuyển',
              'Người nhận',
              textX,
              midY,
              [255, 255, 255],
              [153, 246, 228],
              [255, 255, 255]
            );
          } else if (data.section === 'body' && hasDebts) {
            const debt = report.settlement.simplifiedDebts[data.row.index];
            if (debt) {
              drawTransferPairWithArrow(
                doc,
                activeFont,
                'bold',
                8.5,
                debt.fromMemberName,
                debt.toMemberName,
                textX,
                midY,
                COLOR_ROSE_DARK,
                COLOR_TEAL,
                COLOR_TEAL_DARK
              );
            }
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 5;
  }

  // ==========================================================================
  // PHẦN 03: DANH SÁCH CHI TIẾT KHOẢN CHI (Tối ưu dòng gọn để 42 mục vừa khít 1 trang)
  // ==========================================================================
  if (cursorY > 195) {
    doc.addPage();
    cursorY = 12;
  }

  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '03',
    'DANH SÁCH CHI TIẾT KHOẢN CHI',
    `${report.rows.length} giao dịch theo thời gian`,
    marginX,
    cursorY,
    pageWidth
  );

  if (typeof autoTableFn === 'function') {
    const tableHead = [
      [
        { content: '#', styles: { halign: 'center' } },
        'Thời gian',
        'Nội dung khoản chi',
        'Người chi',
        'Chia cho',
        'Hạng mục',
        { content: 'Số tiền (đ)', styles: { halign: 'right' } },
      ],
    ];
    const tableBody = report.rows.map((r, idx) => [
      `${idx + 1}`,
      r.date,
      r.title,
      r.payerName,
      r.participantsSummary,
      r.compactTypeLabel,
      r.amountFormatted,
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: tableHead,
      body:
        tableBody.length > 0
          ? tableBody
          : [['—', '—', 'Chưa có khoản chi nào trong chuyến đi', '—', '—', '—', '0']],
      foot:
        tableBody.length > 0
          ? [
              [
                {
                  content:
                    report.overview.transferCount > 0
                      ? `TỔNG CHI TIÊU CHUYẾN ĐI (${report.overview.expenseCount} khoản chi • Đã chuyển: ${formatVND(report.totalTransferAmount, false)} đ)`
                      : `TỔNG CHI TIÊU CHUYẾN ĐI (${report.overview.expenseCount} khoản chi)`,
                  colSpan: 6,
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_INK },
                },
                {
                  content: formatVND(report.overview.totalExpenseAmount, false),
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
                },
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX, bottom: 13 },
      styles: {
        font: activeFont,
        fontSize: 7.45,
        cellPadding: 1.25,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: [30, 41, 59],
        lineWidth: 0.15,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [240, 253, 250],
        textColor: COLOR_TEAL_DARK,
        lineColor: [153, 246, 228],
        lineWidth: 0.2,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 26 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 22 },
        4: { cellWidth: 31, textColor: COLOR_SLATE },
        5: { cellWidth: 23, textColor: COLOR_SLATE },
        6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            data.cell.text = [''];
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            const [p1, p2] = raw.split('→').map((s) => s.trim());
            const textX = data.cell.x + data.cell.padding('left');
            const midY = data.cell.y + data.cell.height / 2 + 0.9;
            drawTransferPairWithArrow(
              doc,
              activeFont,
              'normal',
              7.3,
              p1 || '',
              p2 || '',
              textX,
              midY,
              COLOR_SLATE,
              COLOR_TEAL,
              COLOR_SLATE
            );
          }
        }
      },
    });
  }

  // ==========================================================================
  // PHẦN 04: PHỤ LỤC THỐNG KÊ THEO TỪNG CÁ NHÂN (MỖI THÀNH VIÊN 1 TRANG TINH GỌN)
  // ==========================================================================
  report.memberAppendices.forEach((appendix, idx) => {
    doc.addPage();
    renderMemberAppendixSection(
      doc,
      autoTableFn,
      activeFont,
      report,
      appendix,
      `PHỤ LỤC CÁ NHÂN (${idx + 1}/${report.memberAppendices.length})`,
      marginX,
      10.5,
      pageWidth
    );
  });

  stampPageFooters(doc, activeFont, report);
  doc.save(report.suggestedFileName);
}
