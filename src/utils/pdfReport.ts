import { formatVND } from './format';
import { drawLucideIcon } from './pdfLucideIcons';
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
  buildReportFileName,
  formatReportLocationSegment,
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
  buildReportFileName,
  formatReportLocationSegment,
  formatSpentAtReportVN,
  sanitizeFileNameSegment,
  shortenCategoryLabelForTable,
};

// ============================================================================
// CDN LOADER CHO JSPDF & JSPDF-AUTOTABLE + FONT PLUS JAKARTA SANS (ĐỒNG NHẤT WEB APP)
// ============================================================================

const JSPDF_CDN_URL = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js';
const AUTOTABLE_CDN_URL =
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.9/dist/jspdf.plugin.autotable.min.js';

const PLUS_JAKARTA_REGULAR_URLS = [
  'https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_m07NShXUEKmARA.ttf', // Medium 500
  'https://cdn.jsdelivr.net/gh/tokotype/PlusJakartaSans@master/fonts/ttf/PlusJakartaSans-Medium.ttf',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/fonts/Roboto/Roboto-Regular.ttf',
];

const PLUS_JAKARTA_BOLD_URLS = [
  'https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_TknNShXUEKmARA.ttf', // Bold 700
  'https://cdn.jsdelivr.net/gh/tokotype/PlusJakartaSans@master/fonts/ttf/PlusJakartaSans-Bold.ttf',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/fonts/Roboto/Roboto-Medium.ttf',
];

let cachedFontRegularBase64: string | null = null;
let cachedFontBoldBase64: string | null = null;

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

async function fetchFontBase64WithFallbacks(urls: string[], timeoutMs = 9000): Promise<string> {
  let lastErr: unknown = null;
  for (const url of urls) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { mode: 'cors', signal: controller.signal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await res.arrayBuffer();
      return arrayBufferToBase64(buf);
    } catch (err) {
      lastErr = err;
    } finally {
      window.clearTimeout(timer);
    }
  }
  throw lastErr || new Error('Không thể tải font Unicode từ CDN');
}

async function ensurePlusJakartaFontsLoaded(): Promise<{ regular: string; bold: string } | null> {
  try {
    if (!cachedFontRegularBase64 || !cachedFontBoldBase64) {
      const [reg, bold] = await Promise.all([
        fetchFontBase64WithFallbacks(PLUS_JAKARTA_REGULAR_URLS),
        fetchFontBase64WithFallbacks(PLUS_JAKARTA_BOLD_URLS),
      ]);
      cachedFontRegularBase64 = reg;
      cachedFontBoldBase64 = bold;
    }
    return {
      regular: cachedFontRegularBase64,
      bold: cachedFontBoldBase64,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// HỆ MÀU & HELPER VẼ AVATAR THÀNH VIÊN + UNICODE SYMBOL (→, •) ĐỒNG NHẤT WEB APP
// ============================================================================

const COLOR_INK: [number, number, number] = [15, 23, 42]; // Slate 900
const COLOR_SLATE: [number, number, number] = [71, 85, 105]; // Slate 600
const COLOR_MUTED: [number, number, number] = [100, 116, 139]; // Slate 500
const COLOR_BORDER: [number, number, number] = [226, 232, 240]; // Slate 200
const COLOR_TEAL: [number, number, number] = [13, 148, 136]; // Teal 600
const COLOR_TEAL_DARK: [number, number, number] = [15, 118, 110]; // Teal 700
const COLOR_ROSE_DARK: [number, number, number] = [190, 18, 60]; // Rose 700

const CATEGORY_THEME_MAP: Record<
  string,
  {
    lucideIcon: string;
    stroke: [number, number, number];
    bg: [number, number, number];
    bar: [number, number, number];
    text: [number, number, number];
  }
> = {
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

const DAY_BAR_PALETTE: Array<[number, number, number]> = [
  [13, 148, 136], // Teal 600
  [14, 116, 144], // Cyan 700
  [2, 132, 199], // Sky 600
  [37, 99, 235], // Blue 600
  [79, 70, 229], // Indigo 600
  [124, 58, 237], // Violet 600
];

function hexToRgb(
  hex: string,
  fallback: [number, number, number] = [13, 148, 136]
): [number, number, number] {
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

function ensurePageSpace(doc: any, cursorY: number, neededHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + neededHeight > pageHeight - 14) {
    doc.addPage();
    return 13;
  }
  return cursorY;
}

function formatPctVN(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return `${String(rounded).replace('.', ',')}%`;
}

/**
 * Vẽ Avatar tròn chứa chữ cái đầu của tên thành viên (đồng bộ 100% với `<MemberAvatar />` trên Web App)
 */
function drawMemberAvatarCircle(
  doc: any,
  activeFont: string,
  memberName: string,
  avatarColorHex: string,
  centerX: number,
  centerY: number,
  radiusMm = 2.05
): void {
  const rgb = hexToRgb(avatarColorHex, [13, 148, 136]);
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.circle(centerX, centerY, radiusMm, 'F');

  const initial = (memberName || '?').trim().charAt(0).toUpperCase();
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(Math.max(5.4, radiusMm * 2.95));
  doc.setTextColor(255, 255, 255);
  doc.text(initial, centerX, centerY + radiusMm * 0.36, { align: 'center' });
}

/**
 * Vẽ `[Avatar] Tên thành viên` tại tọa độ `(startX, baselineY)` và trả về tọa độ X kết thúc
 */
function drawMemberAvatarAndName(
  doc: any,
  activeFont: string,
  memberName: string,
  avatarColorHex: string,
  startX: number,
  baselineY: number,
  options?: {
    radiusMm?: number;
    fontSize?: number;
    fontStyle?: 'normal' | 'bold';
    textColor?: [number, number, number];
    maxChars?: number;
  }
): number {
  const radius = options?.radiusMm ?? 1.95;
  const fontSize = options?.fontSize ?? 7.8;
  const fontStyle = options?.fontStyle ?? 'bold';
  const textColor = options?.textColor ?? COLOR_INK;
  const maxChars = options?.maxChars ?? 16;

  const circleCenterX = startX + radius;
  const circleCenterY = baselineY - fontSize * 0.115;
  drawMemberAvatarCircle(
    doc,
    activeFont,
    memberName,
    avatarColorHex,
    circleCenterX,
    circleCenterY,
    radius
  );

  const textX = startX + radius * 2 + 1.35;
  const cleanName =
    memberName.length > maxChars ? `${memberName.slice(0, maxChars - 1)}…` : memberName;

  doc.setFont(activeFont, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);
  doc.text(cleanName, textX, baselineY);

  return textX + doc.getTextWidth(cleanName);
}

/**
 * Vẽ cặp `[Avatar] Người chuyển  →  [Avatar] Người nhận` sử dụng ký tự Unicode `→` gốc của font Plus Jakarta Sans
 */
function drawTransferPairWithAvatars(
  doc: any,
  activeFont: string,
  fromName: string,
  fromAvatarHex: string,
  toName: string,
  toAvatarHex: string,
  startX: number,
  baselineY: number,
  options?: {
    radiusMm?: number;
    fontSize?: number;
    fromColor?: [number, number, number];
    arrowColor?: [number, number, number];
    toColor?: [number, number, number];
    centeredAtX?: number;
  }
): number {
  const radius = options?.radiusMm ?? 1.95;
  const fontSize = options?.fontSize ?? 8.2;
  const fromColor = options?.fromColor ?? COLOR_ROSE_DARK;
  const arrowColor = options?.arrowColor ?? COLOR_MUTED;
  const toColor = options?.toColor ?? COLOR_TEAL_DARK;

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(fontSize);
  const fromW = radius * 2 + 1.35 + doc.getTextWidth(fromName);
  const arrowStr = '  →  ';
  const arrowW = doc.getTextWidth(arrowStr);
  const toW = radius * 2 + 1.35 + doc.getTextWidth(toName);
  const totalW = fromW + arrowW + toW;

  const originX =
    typeof options?.centeredAtX === 'number' ? options.centeredAtX - totalW / 2 : startX;

  const afterFromX = drawMemberAvatarAndName(
    doc,
    activeFont,
    fromName,
    fromAvatarHex,
    originX,
    baselineY,
    {
      radiusMm: radius,
      fontSize,
      fontStyle: 'bold',
      textColor: fromColor,
    }
  );

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(fontSize);
  doc.setTextColor(arrowColor[0], arrowColor[1], arrowColor[2]);
  doc.text(arrowStr, afterFromX, baselineY);

  const toStartX = afterFromX + arrowW;
  return drawMemberAvatarAndName(doc, activeFont, toName, toAvatarHex, toStartX, baselineY, {
    radiusMm: radius,
    fontSize,
    fontStyle: 'bold',
    textColor: toColor,
  });
}

// ============================================================================
// CÁC THÀNH PHẦN ĐỒ HỌA VECTOR PHẲNG (HERO BANNER, KPI CARDS, CHARTS, TABLES)
// ============================================================================

function drawAppendixHeroBannerBackground(
  doc: any,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const r = 2.6;
  doc.setFillColor(17, 36, 77);
  doc.roundedRect(x, y, width, height, r, r, 'F');

  doc.setFillColor(22, 48, 102);
  const w1StartX = x + width * 0.56;
  const w1EndX = x + width - r;
  doc.lines(
    [
      [width * 0.12, height * 0.25, width * 0.19, height * 0.85, width * 0.33, height],
      [w1EndX - (x + width * 0.89), 0],
      [0, -height],
    ],
    w1StartX,
    y,
    [1, 1],
    'F',
    true
  );
  doc.roundedRect(x + width - r * 2.4, y, r * 2.4, height, r, r, 'F');

  doc.setFillColor(28, 60, 126);
  const w2StartX = x + width * 0.78;
  const w2TopX = x + width * 0.965;
  doc.lines(
    [
      [
        width * 0.06,
        -height * 0.45,
        width * 0.13,
        -height * 0.78,
        w2TopX - w2StartX,
        -height,
      ],
      [x + width - r - w2TopX, 0],
      [0, height],
    ],
    w2StartX,
    y + height,
    [1, 1],
    'F',
    true
  );
  doc.roundedRect(x + width - r * 2.1, y, r * 2.1, height, r, r, 'F');
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
  const bannerH = 19.5;
  const y = startY;

  drawAppendixHeroBannerBackground(doc, marginX, y, fullW, bannerH);

  // Badge tròn bên trái chứa icon Lucide Wallet
  drawLucideIcon(
    doc,
    'Wallet',
    marginX + 9.6,
    y + bannerH / 2,
    10.4,
    [255, 255, 255],
    [22, 98, 232],
    'solid-badge'
  );

  const metaParts = [subtitleBadge, report.location, report.dateRangeLabel].filter(Boolean);
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(8.1);
  doc.setTextColor(210, 226, 250);
  doc.text(metaParts.join('  •  '), marginX + 18.2, y + 7.2);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(255, 255, 255);
  const maxTitleLen =
    report.tripName.length > 42 ? `${report.tripName.slice(0, 41)}…` : report.tripName;
  doc.text(maxTitleLen.toUpperCase(), marginX + 18.2, y + 14.5);

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(7.1);
  doc.setTextColor(186, 208, 242);
  doc.text(`Xuất: ${report.generatedAt}`, pageWidth - marginX - 4.2, y + 7.2, {
    align: 'right',
  });

  return y + bannerH + 3.4;
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

/**
 * Vẽ hàng 4 thẻ KPI trên Trang 1 sử dụng 100% Lucide Icons (kiểu `duotone-circle`)
 * Chỉ số chính có đơn vị `₫`
 */
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
  const boxHeight = 18.8;
  const y = ensurePageSpace(doc, cursorY, boxHeight + 3);
  const gap = 3.2;
  const totalWidth = pageWidth - marginX * 2;
  const colWidth = (totalWidth - gap * 3) / 4;
  const radius = 2.4;

  items.slice(0, 4).forEach((item, idx) => {
    const x = marginX + idx * (colWidth + gap);

    doc.setFillColor(item.surfaceColor[0], item.surfaceColor[1], item.surfaceColor[2]);
    doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, y, colWidth, boxHeight, radius, radius, 'FD');

    drawLucideIcon(
      doc,
      item.iconName,
      x + 5.6,
      y + boxHeight / 2,
      7.6,
      item.accentColor,
      item.iconBgColor,
      'duotone-circle'
    );

    const textLeftX = x + 10.8;
    const availW = colWidth - 12.0;

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.0);
    doc.setTextColor(40, 54, 76);
    doc.text(item.label, textLeftX, y + 5.4);

    doc.setFont(activeFont, 'bold');
    let valFontSize = 10.6;
    doc.setFontSize(valFontSize);
    while (doc.getTextWidth(item.value) > availW && valFontSize > 8.0) {
      valFontSize -= 0.35;
      doc.setFontSize(valFontSize);
    }
    const valColor = item.valueColor || COLOR_INK;
    doc.setTextColor(valColor[0], valColor[1], valColor[2]);
    doc.text(item.value, textLeftX, y + 11.1);

    if (item.subtext) {
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(6.7);
      doc.setTextColor(64, 78, 98);
      const cleanSub =
        item.subtext.length > 26 ? `${item.subtext.slice(0, 25)}…` : item.subtext;
      doc.text(cleanSub, textLeftX, y + 15.6);
    }
  });

  return y + boxHeight + 3.4;
}

/**
 * Vẽ dòng mục thống kê theo đúng quy tắc trình bày của Web App (`OverviewTab.tsx`):
 * - Bên trái: `[Lucide Icon]  Tên mục` (ví dụ: `Vé đi/về (máy bay/tàu xe)`)
 * - Bên phải: `49%   11.021.005` (`%` màu phụ đứng trước, Số tiền in đậm đứng sau, KHÔNG kèm `₫`)
 */
function drawWebAppStyleStatRow(
  doc: any,
  activeFont: string,
  rowX: number,
  rowY: number,
  rowWidth: number,
  iconName: string,
  iconStroke: [number, number, number],
  iconBg: [number, number, number],
  barColor: [number, number, number],
  amountTextColor: [number, number, number],
  label: string,
  percentage: number,
  amount: number,
  badgeDiameter = 4.6
): void {
  const badgeCenterX = rowX + badgeDiameter / 2;
  const badgeCenterY = rowY + 2.9;

  drawLucideIcon(
    doc,
    iconName,
    badgeCenterX,
    badgeCenterY,
    badgeDiameter,
    iconStroke,
    iconBg,
    'duotone-circle'
  );

  const textStartX = rowX + badgeDiameter + 1.8;
  const rightEdgeX = rowX + rowWidth;
  const trackW = rowWidth - badgeDiameter - 1.8;

  // 1. Vẽ Số tiền in đậm sát lề phải (không có ₫)
  const amountStr = formatVND(amount, false);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(amountTextColor[0], amountTextColor[1], amountTextColor[2]);
  doc.text(amountStr, rightEdgeX, rowY + 2.6, { align: 'right' });
  const amountW = doc.getTextWidth(amountStr);

  // 2. Vẽ Tỷ lệ % đứng ngay trước Số tiền (giống Web App: `49%  11.021.005`)
  const pctStr = formatPctVN(Math.round(percentage));
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.9);
  doc.setTextColor(...COLOR_MUTED);
  const pctRightX = rightEdgeX - amountW - 2.0;
  doc.text(pctStr, pctRightX, rowY + 2.6, { align: 'right' });
  const pctW = doc.getTextWidth(pctStr);

  // 3. Vẽ Tên mục ở bên trái (tự động cắt gọn nếu quá dài để không chạm vào cột %)
  const maxLabelW = Math.max(18, pctRightX - pctW - textStartX - 2.2);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(...COLOR_INK);
  let displayLabel = label;
  while (doc.getTextWidth(displayLabel) > maxLabelW && displayLabel.length > 6) {
    displayLabel = `${displayLabel.slice(0, -2).trim()}…`;
  }
  doc.text(displayLabel, textStartX, rowY + 2.6);

  // 4. Thanh progress bar bo tròn phía dưới
  const barY = rowY + 3.85;
  const barH = 1.95;
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(textStartX, barY, trackW, barH, 0.9, 0.9, 'F');

  const ratio = Math.max(0, Math.min(1, percentage / 100));
  const fillW = Math.max(ratio > 0 ? 2.4 : 0, trackW * ratio);
  if (fillW > 0) {
    doc.setFillColor(barColor[0], barColor[1], barColor[2]);
    doc.roundedRect(textStartX, barY, fillW, barH, 0.9, 0.9, 'F');
  }
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
    textColor: [number, number, number];
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
  const itemHeight = 7.4;
  const headerH = 8;
  const cardH = fixedHeight || Math.max(24, headerH + maxItems.length * itemHeight + 2.2);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, cardH, 1.8, 1.8, 'FD');

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x + 0.2, y + 0.2, width - 0.4, headerH - 0.4, 1.6, 1.6, 'F');

  drawLucideIcon(
    doc,
    headerIcon,
    x + 5.2,
    y + headerH / 2,
    4.6,
    headerIconColor,
    headerIconBg,
    'rounded-badge'
  );

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.1);
  doc.setTextColor(...COLOR_INK);
  doc.text(title, x + 8.8, y + 5.1);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(x + 2.5, y + headerH, x + width - 2.5, y + headerH);

  let rowY = y + headerH + 1.1;
  maxItems.forEach((item) => {
    drawWebAppStyleStatRow(
      doc,
      activeFont,
      x + 3.0,
      rowY,
      width - 6.0,
      item.iconName,
      item.iconStroke,
      item.iconBg,
      item.barColor,
      item.textColor,
      item.label,
      item.percentage,
      item.amount,
      4.4
    );
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
  const maxRows = Math.max(Math.min(6, byCategory.length), Math.min(6, byDay.length), 1);
  const sharedHeight = 8 + maxRows * 7.4 + 2.2;
  const y = ensurePageSpace(doc, cursorY, sharedHeight + 4);

  const gap = 4;
  const fullW = pageWidth - marginX * 2;
  const colW = (fullW - gap) / 2;

  drawCompactChartCard(
    doc,
    activeFont,
    'Theo danh mục (₫)',
    'PieChart',
    [13, 148, 136],
    [204, 251, 241],
    byCategory.map((c) => {
      const theme = CATEGORY_THEME_MAP[c.categoryIcon] || CATEGORY_THEME_MAP.Package;
      return {
        label: c.fullCategoryName || c.categoryName,
        iconName: theme.lucideIcon,
        iconStroke: theme.stroke,
        iconBg: theme.bg,
        barColor: theme.bar,
        textColor: COLOR_INK,
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
    'Theo ngày (₫)',
    'Calendar',
    [37, 99, 235],
    [219, 234, 254],
    byDay.map((d, idx) => {
      const barCol = DAY_BAR_PALETTE[idx % DAY_BAR_PALETTE.length];
      return {
        label: d.label.replace(/\s*\((\d{2}\/\d{2})\/\d{4}\)/, ' ($1)'),
        iconName: 'Calendar',
        iconStroke: barCol,
        iconBg: [235, 243, 254],
        barColor: barCol,
        textColor: COLOR_INK,
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
  drawLucideIcon(
    doc,
    'ArrowRightLeft',
    marginX + 5.2,
    y + headerHeight / 2,
    4.6,
    [13, 148, 136],
    [204, 251, 241],
    'rounded-badge'
  );

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.1);
  doc.setTextColor(...COLOR_INK);
  doc.text('So sánh Đã chi & Phải chịu theo Thành viên (₫)', marginX + 8.8, y + 5.1);

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
  doc.line(marginX + 2.5, y + headerHeight, marginX + fullWidth - 2.5, y + headerHeight);

  const maxVal = Math.max(1, ...balances.map((b) => Math.max(b.paidExpense, b.owedExpense)));

  let rowY = y + headerHeight + 0.9;
  const nameColWidth = 34;
  const statusColWidth = 38;
  const barTrackX = marginX + 3.5 + nameColWidth;
  const barTrackWidth = fullWidth - 7 - nameColWidth - statusColWidth;

  balances.forEach((b) => {
    drawMemberAvatarAndName(
      doc,
      activeFont,
      b.memberName,
      b.avatarColor,
      marginX + 3.5,
      rowY + 3.9,
      {
        radiusMm: 2.1,
        fontSize: 7.8,
        fontStyle: 'bold',
        textColor: COLOR_INK,
        maxChars: 14,
      }
    );

    // Thanh 1: Đã chi (Teal 600)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 0.8, barTrackWidth, 2, 0.7, 0.7, 'F');
    const paidW = Math.max(b.paidExpense > 0 ? 1.5 : 0, (b.paidExpense / maxVal) * barTrackWidth);
    if (paidW > 0) {
      doc.setFillColor(...COLOR_TEAL);
      doc.roundedRect(barTrackX, rowY + 0.8, paidW, 2, 0.7, 0.7, 'F');
    }

    // Thanh 2: Phải chịu (Slate 400)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 3.4, barTrackWidth, 2, 0.7, 0.7, 'F');
    const owedW = Math.max(b.owedExpense > 0 ? 1.5 : 0, (b.owedExpense / maxVal) * barTrackWidth);
    if (owedW > 0) {
      doc.setFillColor(148, 163, 184);
      doc.roundedRect(barTrackX, rowY + 3.4, owedW, 2, 0.7, 0.7, 'F');
    }

    // Pill Số dư cuối bên phải (bỏ ₫ vì đã có (₫) ở tiêu đề box)
    let balLabel = '0';
    let pillBg: [number, number, number] = [241, 245, 249];
    let pillText: [number, number, number] = COLOR_MUTED;
    if (b.balance > 0) {
      pillBg = [209, 250, 229];
      pillText = COLOR_TEAL_DARK;
      balLabel = `+${formatVND(b.balance, false)}`;
    } else if (b.balance < 0) {
      pillBg = [255, 228, 230];
      pillText = COLOR_ROSE_DARK;
      balLabel = `${formatVND(b.balance, false)}`;
    }

    const pillW = 28;
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

export interface AppendixGridMetrics {
  fullWidth: number;
  gridGap: number;
  kpiColWidth: number;
  kpiCardHeight: number;
  kpiCardX: [number, number, number, number];
  kpi3ColWidth: number;
  kpi3CardX: [number, number, number];
  mainColWidth: number;
  leftColX: number;
  rightColX: number;
  headerHeight: number;
  blockHeight: number;
}

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

  const kpi3ColWidth = (fullWidth - gridGap * 2) / 3;
  const kpi3CardX: [number, number, number] = [
    marginX,
    marginX + kpi3ColWidth + gridGap,
    marginX + (kpi3ColWidth + gridGap) * 2,
  ];

  const mainColWidth = (fullWidth - gridGap) / 2;
  const leftColX = marginX;
  const rightColX = marginX + mainColWidth + gridGap;
  const headerHeight = 9.8;

  const visibleCats = Math.min(6, Math.max(0, categoryCount));
  const rightNeededH = visibleCats > 0 ? headerHeight + visibleCats * 8.0 + 3.4 : 50;
  const leftNeededH =
    actionCount > 1 ? headerHeight + 23.5 + actionCount * 6.0 + 10.5 : 51.5;
  const blockHeight = Math.max(51.5, rightNeededH, leftNeededH);

  return {
    fullWidth,
    gridGap,
    kpiColWidth,
    kpiCardHeight,
    kpiCardX,
    kpi3ColWidth,
    kpi3CardX,
    mainColWidth,
    leftColX,
    rightColX,
    headerHeight,
    blockHeight,
  };
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
  borderRgb: [number, number, number]
): void {
  doc.setFillColor(bodyFillRgb[0], bodyFillRgb[1], bodyFillRgb[2]);
  doc.roundedRect(x, y, width, blockHeight, radius, radius, 'F');

  doc.setFillColor(headerFillRgb[0], headerFillRgb[1], headerFillRgb[2]);
  doc.roundedRect(x, y, width, headerHeight, radius, radius, 'F');
  doc.rect(x, y + headerHeight - radius, width, radius, 'F');

  doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
  doc.setLineWidth(0.32);
  doc.roundedRect(x, y, width, blockHeight, radius, radius, 'D');
}

function drawAppendixThreeKpiGrid(
  doc: any,
  activeFont: string,
  items: Array<{
    label: string;
    value: string;
    subtext: string;
    subtextBold?: boolean;
    subtextColor?: [number, number, number];
    lucideIconName: string;
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
  const colW = metrics.kpi3ColWidth;
  const boxH = metrics.kpiCardHeight;
  const radius = 2.6;

  items.slice(0, 3).forEach((item, idx) => {
    const x = metrics.kpi3CardX[idx];

    doc.setFillColor(item.surfaceColor[0], item.surfaceColor[1], item.surfaceColor[2]);
    doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, y, colW, boxH, radius, radius, 'FD');

    drawLucideIcon(
      doc,
      item.lucideIconName,
      x + 7.2,
      y + boxH / 2,
      9.2,
      item.iconFgColor,
      item.iconBgColor,
      'duotone-circle'
    );

    const textLeftX = x + 14.2;
    const availableTextW = colW - 15.8;

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(38, 52, 74);
    doc.text(item.label, textLeftX, y + 5.7);

    doc.setFont(activeFont, 'bold');
    let valFontSize = 13.6;
    doc.setFontSize(valFontSize);
    while (doc.getTextWidth(item.value) > availableTextW && valFontSize > 9.0) {
      valFontSize -= 0.4;
      doc.setFontSize(valFontSize);
    }
    doc.setTextColor(item.valueColor[0], item.valueColor[1], item.valueColor[2]);
    doc.text(item.value, textLeftX, y + 12.1);

    doc.setFont(activeFont, item.subtextBold ? 'bold' : 'normal');
    doc.setFontSize(7.6);
    const subCol = item.subtextColor || [64, 78, 98];
    doc.setTextColor(subCol[0], subCol[1], subCol[2]);
    doc.text(item.subtext, textLeftX, y + 17.2);
  });

  return y + boxH + metrics.gridGap;
}

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
  const headerBlue: [number, number, number] = [14, 78, 178];
  const borderBlueLight: [number, number, number] = [196, 218, 248];

  drawCardSolidHeader(
    doc,
    x,
    y,
    width,
    headerHeight,
    blockHeight,
    2.6,
    [255, 255, 255],
    headerBlue,
    borderBlueLight
  );

  drawLucideIcon(
    doc,
    'PieChart',
    x + 7.2,
    y + headerHeight / 2,
    5.4,
    [255, 255, 255],
    undefined,
    'plain'
  );
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`Chi phí theo Hạng mục (${memberName}) (₫)`, x + 11.8, y + 6.5);

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

  visibleCats.forEach((cat, idx) => {
    const rowY = bodyTopY + idx * stepY;
    const theme = CATEGORY_THEME_MAP[cat.categoryIcon] || CATEGORY_THEME_MAP.Package;
    const label = cat.fullCategoryName || cat.categoryName;

    drawWebAppStyleStatRow(
      doc,
      activeFont,
      x + 3.6,
      rowY + 0.4,
      width - 7.2,
      theme.lucideIcon,
      theme.stroke,
      theme.bg,
      theme.bar,
      theme.text,
      label,
      cat.percentage,
      cat.amount,
      5.2
    );
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

  // 1. HERO HEADER CHO TRANG PHỤ LỤC CÁ NHÂN (AVATAR TRÒN ĐỒNG BỘ WEB APP)
  const bannerH = 19.0;
  drawAppendixHeroBannerBackground(doc, marginX, cursorY, fullWidth, bannerH);

  drawMemberAvatarCircle(
    doc,
    activeFont,
    appendix.memberName,
    appendix.avatarColor,
    marginX + 9.6,
    cursorY + bannerH / 2,
    5.2
  );

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(210, 226, 250);
  doc.text(`${badgeLabel}  •  ${report.tripName}`, marginX + 18.2, cursorY + 7.1);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(255, 255, 255);
  doc.text(appendix.memberName.toUpperCase(), marginX + 18.2, cursorY + 14.5);

  cursorY += bannerH + gridGap;

  // 2. HÀNG GRID 3 Ô KPI CÁ NHÂN PHẲNG (Đã chi, Phải chịu, Số dư cuối — giữ ₫ ở các chỉ số chính)
  const isPositive = appendix.balance > 0;
  const isNegative = appendix.balance < 0;
  const balanceAccent: [number, number, number] = isPositive
    ? [12, 120, 86]
    : isNegative
      ? [198, 24, 48]
      : COLOR_SLATE;
  const balanceSurface: [number, number, number] = isPositive
    ? [234, 249, 242]
    : isNegative
      ? [254, 236, 238]
      : [248, 250, 252];
  const balanceBorder: [number, number, number] = isPositive
    ? [196, 236, 218]
    : isNegative
      ? [248, 206, 214]
      : [226, 232, 240];
  const balanceIconBg: [number, number, number] = isPositive
    ? [202, 240, 224]
    : isNegative
      ? [252, 212, 218]
      : [226, 232, 240];

  const balanceStatusText = isPositive
    ? 'Cần nhận'
    : isNegative
      ? 'Cần chuyển'
      : 'Đã cân bằng';
  const balPrefix = isPositive ? '+' : '';

  const paidExpenseCount = appendix.paidRows.filter((r) => r.recordType === 'expense').length;
  const participatedExpenseCount = appendix.participatedRows.filter(
    (r) => r.recordType === 'expense'
  ).length;

  cursorY = drawAppendixThreeKpiGrid(
    doc,
    activeFont,
    [
      {
        label: 'Đã chi',
        value: `${formatVND(appendix.paidExpense, false)} ₫`,
        subtext: `${paidExpenseCount} khoản`,
        lucideIconName: 'Wallet',
        iconFgColor: [13, 128, 86],
        iconBgColor: [202, 240, 224],
        surfaceColor: [234, 249, 242],
        borderColor: [196, 236, 218],
        valueColor: [13, 124, 82],
      },
      {
        label: 'Phải chịu',
        value: `${formatVND(appendix.owedExpense, false)} ₫`,
        subtext: `${participatedExpenseCount} khoản`,
        lucideIconName: 'Users',
        iconFgColor: [26, 98, 232],
        iconBgColor: [204, 226, 255],
        surfaceColor: [235, 243, 254],
        borderColor: [198, 220, 250],
        valueColor: [15, 38, 84],
      },
      {
        label: 'Số dư cuối',
        value: `${balPrefix}${formatVND(appendix.balance, false)} ₫`,
        subtext: balanceStatusText,
        subtextBold: true,
        subtextColor: balanceAccent,
        lucideIconName: 'RefreshCw',
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

  // 3. GRID 2 CỘT CÂN ĐỐI 50/50
  cursorY = ensurePageSpace(doc, cursorY, blockHeight + 4);

  const leftHeaderRed: [number, number, number] = [206, 26, 48];
  const leftBorderRedLight: [number, number, number] = [244, 198, 204];
  const leftHeaderTitle = isPositive ? 'Số tiền cần nhận' : 'Số tiền cần chuyển';

  drawCardSolidHeader(
    doc,
    leftColX,
    cursorY,
    mainColWidth,
    headerHeight,
    blockHeight,
    2.6,
    [255, 255, 255],
    leftHeaderRed,
    leftBorderRedLight
  );

  drawLucideIcon(
    doc,
    'Send',
    leftColX + 7.2,
    cursorY + headerHeight / 2,
    5.0,
    [255, 255, 255],
    undefined,
    'plain'
  );
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.6);
  doc.setTextColor(255, 255, 255);
  doc.text(leftHeaderTitle, leftColX + 11.8, cursorY + 6.5);

  const leftCenterX = leftColX + mainColWidth / 2;
  const heroPrimaryAmount = `${formatVND(Math.abs(appendix.balance), false)} ₫`;
  const heroPrimaryColor: [number, number, number] = isPositive
    ? [13, 128, 86]
    : [198, 24, 48];

  if (actions.length <= 1) {
    // Số tiền quyết toán trọng tâm (Chỉ số chính -> giữ ₫)
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(24.5);
    doc.setTextColor(heroPrimaryColor[0], heroPrimaryColor[1], heroPrimaryColor[2]);
    doc.text(heroPrimaryAmount, leftCenterX, cursorY + headerHeight + 12.6, {
      align: 'center',
    });

    const pillX = leftColX + 4.4;
    const pillY = cursorY + headerHeight + 15.8;
    const pillW = mainColWidth - 8.8;
    const pillH = 10.2;
    const pillFill: [number, number, number] = [252, 234, 237];

    doc.setFillColor(pillFill[0], pillFill[1], pillFill[2]);
    doc.roundedRect(pillX, pillY, pillW, pillH, 2.4, 2.4, 'F');

    if (actions.length === 1) {
      const act = actions[0];
      drawTransferPairWithAvatars(
        doc,
        activeFont,
        act.fromMemberName,
        act.fromAvatarColor,
        act.toMemberName,
        act.toAvatarColor,
        pillX,
        pillY + 6.8,
        {
          radiusMm: 2.8,
          fontSize: 12.4,
          fromColor: [15, 28, 63],
          arrowColor: [206, 26, 48],
          toColor: [15, 28, 63],
          centeredAtX: leftCenterX,
        }
      );

      if (act.toBankInfo || appendix.bankInfo) {
        const rawBank = act.toBankInfo || appendix.bankInfo;
        doc.setFont(activeFont, 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(15, 28, 63);
        doc.text(`TK nhận: ${rawBank}`, leftCenterX, pillY + pillH + 5.4, {
          align: 'center',
        });
      }
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
    }
  } else {
    // Trường hợp thành viên có >= 2 giao dịch tất toán: số lớn ở trên giữ ₫, các dòng con bên dưới có Avatar + bỏ ₫
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(19.5);
    doc.setTextColor(heroPrimaryColor[0], heroPrimaryColor[1], heroPrimaryColor[2]);
    doc.text(heroPrimaryAmount, leftCenterX, cursorY + headerHeight + 9.6, {
      align: 'center',
    });

    const pillX = leftColX + 4.4;
    const pillY = cursorY + headerHeight + 12.2;
    const pillW = mainColWidth - 8.8;
    const pillH = actions.length * 6.0 + 2.4;
    const pillFill: [number, number, number] = [252, 234, 237];

    doc.setFillColor(pillFill[0], pillFill[1], pillFill[2]);
    doc.roundedRect(pillX, pillY, pillW, pillH, 2.0, 2.0, 'F');

    let actY = pillY + 4.6;
    actions.forEach((act) => {
      const isSender = act.fromMemberId === appendix.memberId;
      drawTransferPairWithAvatars(
        doc,
        activeFont,
        act.fromMemberName,
        act.fromAvatarColor,
        act.toMemberName,
        act.toAvatarColor,
        pillX + 3.0,
        actY,
        {
          radiusMm: 1.85,
          fontSize: 8.1,
          fromColor: [15, 28, 63],
          arrowColor: isSender ? [206, 26, 48] : [13, 148, 136],
          toColor: [15, 28, 63],
        }
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8.3);
      doc.setTextColor(...(isSender ? COLOR_ROSE_DARK : COLOR_TEAL_DARK));
      doc.text(
        `${isSender ? '' : '+'}${formatVND(act.amount, false)}`,
        pillX + pillW - 3.2,
        actY,
        { align: 'right' }
      );
      actY += 6.0;
    });

    const firstBank = actions.find((a) => a.toBankInfo)?.toBankInfo || appendix.bankInfo;
    if (firstBank) {
      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(15, 28, 63);
      doc.text(`TK nhận: ${firstBank}`, leftCenterX, pillY + pillH + 4.6, {
        align: 'center',
      });
    }
  }

  // 4. Dòng công thức tính nhanh kèm icon Lucide Calculator dưới đáy hộp Quyết toán cá nhân
  const formulaLineY = cursorY + blockHeight - 7.8;
  doc.setDrawColor(224, 230, 238);
  doc.setLineWidth(0.24);
  doc.line(leftColX + 4.4, formulaLineY, leftColX + mainColWidth - 4.4, formulaLineY);

  drawLucideIcon(
    doc,
    'Calculator',
    leftColX + 6.4,
    cursorY + blockHeight - 4.0,
    4.0,
    [24, 98, 236],
    undefined,
    'plain'
  );
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(15, 28, 56);
  doc.text(
    `Chi (${formatVND(appendix.paidExpense, false)}) - Chịu (${formatVND(appendix.owedExpense, false)}) = ${balPrefix}${formatVND(appendix.balance, false)} ₫`,
    leftColX + 9.8,
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

  // Bảng các khoản thành viên đã chi (Đưa (₫) lên tiêu đề bảng, các mục con không lặp lại ₫)
  cursorY = ensurePageSpace(doc, cursorY, 20);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...COLOR_INK);
  doc.text(
    `CÁC KHOẢN ${appendix.memberName.toUpperCase()} ĐÃ CHI (${appendix.paidRows.length} KHOẢN) (₫)`,
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
          { content: 'Số tiền', styles: { halign: 'right' } },
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

  const fonts = await ensurePlusJakartaFontsLoaded();
  let activeFont = 'helvetica';

  if (fonts) {
    doc.addFileToVFS('PlusJakartaSans-Medium.ttf', fonts.regular);
    doc.addFont('PlusJakartaSans-Medium.ttf', 'PlusJakartaSans', 'normal');
    doc.addFont('PlusJakartaSans-Medium.ttf', 'PlusJakartaSans', 'italic');
    doc.addFileToVFS('PlusJakartaSans-Bold.ttf', fonts.bold);
    doc.addFont('PlusJakartaSans-Bold.ttf', 'PlusJakartaSans', 'bold');
    doc.addFont('PlusJakartaSans-Bold.ttf', 'PlusJakartaSans', 'bolditalic');
    doc.setFont('PlusJakartaSans', 'normal');
    activeFont = 'PlusJakartaSans';
  }

  const autoTableFn = (doc as any).autoTable || (win as any).jspdf?.autoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  if (report.filterMemberId !== 'all' && report.memberAppendices.length > 0) {
    renderMemberAppendixSection(
      doc,
      autoTableFn,
      activeFont,
      report,
      report.memberAppendices[0],
      'Báo cáo quyết toán cá nhân',
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
    'Báo cáo chi tiêu & quyết toán',
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
        value: `${formatVND(report.overview.totalExpenseAmount, false)} ₫`,
        subtext: `${report.overview.expenseCount} khoản • ${report.overview.byDay.length} ngày`,
        iconName: 'Wallet',
        accentColor: [13, 128, 86],
        surfaceColor: [234, 249, 242],
        borderColor: [196, 236, 218],
        iconBgColor: [202, 240, 224],
        valueColor: [13, 124, 82],
      },
      {
        label: 'Bình quân / người',
        value: `${formatVND(report.overview.averagePerMember, false)} ₫`,
        subtext: `${report.overview.memberCount} thành viên`,
        iconName: 'Users',
        accentColor: [26, 98, 232],
        surfaceColor: [235, 243, 254],
        borderColor: [198, 220, 250],
        iconBgColor: [204, 226, 255],
        valueColor: [15, 38, 84],
      },
      {
        label: 'Hạng mục lớn nhất',
        value: topCat ? `${formatVND(topCat.amount, false)} ₫` : '0 ₫',
        subtext: topCat
          ? `${shortenCategoryLabelForTable(topCat.categoryName)} (${formatPctVN(topCat.percentage)})`
          : 'Chưa phát sinh',
        iconName: topCat?.categoryIcon || 'PieChart',
        accentColor: [224, 124, 14],
        surfaceColor: [255, 248, 235],
        borderColor: [252, 224, 182],
        iconBgColor: [254, 234, 202],
        valueColor: [180, 83, 9],
      },
      report.overview.totalTransferAmount > 0
        ? {
            label: 'Đã chuyển trả',
            value: `${formatVND(report.overview.totalTransferAmount, false)} ₫`,
            subtext: `${report.overview.transferCount} giao dịch đã chuyển`,
            iconName: 'ArrowRightLeft',
            accentColor: [118, 56, 218],
            surfaceColor: [244, 238, 255],
            borderColor: [221, 206, 252],
            iconBgColor: [233, 218, 255],
            valueColor: [109, 40, 217],
          }
        : {
            label: 'Chi nhiều nhất',
            value: topPayer ? `${formatVND(topPayer.paidExpense, false)} ₫` : '0 ₫',
            subtext: topPayer
              ? `${topPayer.memberName} (${formatPctVN(topPayerPct)} tổng chi)`
              : 'Chưa phát sinh',
            iconName: 'Award',
            accentColor: [118, 56, 218],
            surfaceColor: [244, 238, 255],
            borderColor: [221, 206, 252],
            iconBgColor: [233, 218, 255],
            valueColor: [109, 40, 217],
          },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // 2 Biểu đồ đặt song song 2 cột: `Theo danh mục (₫)` & `Theo ngày (₫)`
  cursorY = drawSideBySideOverviewCharts(
    doc,
    activeFont,
    report.overview.byCategory,
    report.overview.byDay,
    marginX,
    cursorY,
    pageWidth
  );

  // PHẦN 02: CÂN ĐỐI THU CHI & QUYẾT TOÁN (₫)
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '02',
    'CÂN ĐỐI THU CHI & QUYẾT TOÁN (₫)',
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

  // Bảng 2.1: Bảng cân đối tổng hợp từng thành viên (Có Avatar tròn ở cột Thành viên, bỏ ₫ lặp lại)
  if (typeof autoTableFn === 'function') {
    const balanceHead = hasAnyTransfers
      ? [
          [
            'Thành viên',
            { content: 'Đã chi', styles: { halign: 'right' } },
            { content: 'Phải chịu', styles: { halign: 'right' } },
            { content: 'Đã chuyển', styles: { halign: 'right' } },
            { content: 'Số dư cuối', styles: { halign: 'right' } },
            { content: 'Trạng thái', styles: { halign: 'right' } },
          ],
        ]
      : [
          [
            'Thành viên',
            { content: 'Đã chi', styles: { halign: 'right' } },
            { content: 'Phải chịu', styles: { halign: 'right' } },
            { content: 'Số dư cuối', styles: { halign: 'right' } },
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
            0: { cellWidth: 38, fontStyle: 'bold' },
            1: { cellWidth: 30, halign: 'right' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 28, halign: 'right' },
            4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
            5: { cellWidth: 'auto', halign: 'right' },
          }
        : {
            0: { cellWidth: 42, fontStyle: 'bold' },
            1: { cellWidth: 35, halign: 'right' },
            2: { cellWidth: 35, halign: 'right' },
            3: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
            4: { cellWidth: 'auto', halign: 'right' },
          },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 0) {
          // Ẩn chữ mặc định để vẽ [Avatar] + Tên thành viên trong didDrawCell
          data.cell.text = [''];
        }
        const balColIdx = hasAnyTransfers ? 4 : 3;
        const statusColIdx = hasAnyTransfers ? 5 : 4;
        if (
          data.section === 'body' &&
          (data.column.index === balColIdx || data.column.index === statusColIdx)
        ) {
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
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 0) {
          const bal = report.settlement.balances[data.row.index];
          if (bal) {
            const textX = data.cell.x + data.cell.padding('left');
            const midY = data.cell.y + data.cell.height / 2 + 0.95;
            drawMemberAvatarAndName(
              doc,
              activeFont,
              bal.memberName,
              bal.avatarColor,
              textX,
              midY,
              {
                radiusMm: 1.95,
                fontSize: 8.0,
                fontStyle: 'bold',
                textColor: COLOR_INK,
              }
            );
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 3.8;
  }

  // Bảng 2.2: DANH SÁCH CHUYỂN KHOẢN QUYẾT TOÁN (₫) (Có Avatar cho cả Người chuyển & Người nhận + Unicode →)
  cursorY = ensurePageSpace(doc, cursorY, 22);
  drawLucideIcon(
    doc,
    'Send',
    marginX + 2.2,
    cursorY + 1.6,
    4.4,
    [15, 118, 110],
    [204, 251, 241],
    'rounded-badge'
  );
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...COLOR_TEAL_DARK);
  doc.text('DANH SÁCH CHUYỂN KHOẢN QUYẾT TOÁN (₫)', marginX + 5.6, cursorY + 2.8);
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
          'Người chuyển  →  Người nhận',
          { content: 'Số tiền chuyển', styles: { halign: 'right' } },
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
        1: { cellWidth: 64, fontStyle: 'bold' },
        2: { cellWidth: 38, halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
        3: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold', textColor: COLOR_SLATE },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1 && hasDebts) {
          data.cell.text = [''];
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1 && hasDebts) {
          const debt = report.settlement.simplifiedDebts[data.row.index];
          if (debt) {
            const textX = data.cell.x + data.cell.padding('left');
            const midY = data.cell.y + data.cell.height / 2 + 1.0;
            drawTransferPairWithAvatars(
              doc,
              activeFont,
              debt.fromMemberName,
              debt.fromAvatarColor,
              debt.toMemberName,
              debt.toAvatarColor,
              textX,
              midY,
              {
                radiusMm: 1.95,
                fontSize: 8.3,
                fromColor: COLOR_ROSE_DARK,
                arrowColor: COLOR_TEAL,
                toColor: COLOR_TEAL_DARK,
              }
            );
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 5;
  }

  // ==========================================================================
  // PHẦN 03: DANH SÁCH CHI TIẾT KHOẢN CHI (₫) (Có Avatar ở cột Người chi, dùng Unicode →)
  // ==========================================================================
  if (cursorY > 195) {
    doc.addPage();
    cursorY = 12;
  }

  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '03',
    'DANH SÁCH CHI TIẾT KHOẢN CHI (₫)',
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
        { content: 'Số tiền', styles: { halign: 'right' } },
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
                      ? `TỔNG CHI TIÊU CHUYẾN ĐI (${report.overview.expenseCount} khoản chi • Đã chuyển: ${formatVND(report.totalTransferAmount, false)})`
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
        3: { cellWidth: 25 },
        4: { cellWidth: 30, textColor: COLOR_SLATE },
        5: { cellWidth: 22, textColor: COLOR_SLATE },
        6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3 && report.rows.length > 0) {
          data.cell.text = [''];
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3 && report.rows.length > 0) {
          const rowItem = report.rows[data.row.index];
          if (rowItem) {
            const textX = data.cell.x + data.cell.padding('left');
            const midY = data.cell.y + data.cell.height / 2 + 0.85;
            drawMemberAvatarAndName(
              doc,
              activeFont,
              rowItem.payerName,
              rowItem.payerAvatarColor,
              textX,
              midY,
              {
                radiusMm: 1.65,
                fontSize: 7.3,
                fontStyle: 'bold',
                textColor: COLOR_INK,
                maxChars: 11,
              }
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
      `Phụ lục cá nhân (${idx + 1}/${report.memberAppendices.length})`,
      marginX,
      10.5,
      pageWidth
    );
  });

  stampPageFooters(doc, activeFont, report);
  doc.save(report.suggestedFileName);
}
