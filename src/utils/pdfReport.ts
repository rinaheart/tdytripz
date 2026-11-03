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

// Hệ thống Font Plus Jakarta Sans Unicode tiếng Việt đồng nhất 100% với Web App (kèm fallback dự phòng)
const PLUS_JAKARTA_REGULAR_URLS = [
  'https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_m07NShXUEKmARA.ttf', // Medium 500 cho độ nét chữ nội dung tối ưu
  'https://cdn.jsdelivr.net/gh/tokotype/PlusJakartaSans@master/fonts/ttf/PlusJakartaSans-Medium.ttf',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/fonts/Roboto/Roboto-Regular.ttf',
];

const PLUS_JAKARTA_BOLD_URLS = [
  'https://fonts.gstatic.com/s/plusjakartasans/v12/LDIbaomQNQcsA88c7O9yZ4KMCoOg4IA6-91aHEjcWuA_TknNShXUEKmARA.ttf', // Bold 700 thực thụ
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
// HỆ THỐNG RENDER ICON VECTOR NGUYÊN BẢN 100% (KHÔNG DÙNG ẢNH PNG/CANVAS)
// Đảm bảo khi phóng lớn (Zoom 400% - 1600%) mọi biểu tượng đều sắc nét tuyệt đối
// ============================================================================

function drawVectorStrokeIconGeometry(
  doc: any,
  iconName: string,
  originX: number,
  originY: number,
  boxSize: number,
  strokeRgb: [number, number, number]
): void {
  const s = boxSize / 24;
  const tx = (u: number) => originX + u * s;
  const ty = (v: number) => originY + v * s;
  const ts = (len: number) => len * s;

  doc.setDrawColor(strokeRgb[0], strokeRgb[1], strokeRgb[2]);
  doc.setFillColor(strokeRgb[0], strokeRgb[1], strokeRgb[2]);
  const lw = Math.max(0.24, boxSize * 0.088);
  doc.setLineWidth(lw);

  switch (iconName) {
    case 'Wallet': {
      doc.roundedRect(tx(3), ty(6.6), ts(17.6), ts(13.4), ts(2.0), ts(2.0), 'S');
      doc.line(tx(4.2), ty(6.6), tx(16.2), ty(3.8));
      doc.line(tx(16.2), ty(3.8), tx(17.8), ty(6.6));
      doc.roundedRect(tx(14.8), ty(11.3), ts(5.8), ts(4.0), ts(1.0), ts(1.0), 'S');
      doc.circle(tx(16.9), ty(13.3), ts(0.6), 'F');
      break;
    }
    case 'Users': {
      doc.circle(tx(9.0), ty(7.5), ts(3.3), 'S');
      doc.lines(
        [[ts(0.2), ts(-4.6), ts(11.4), ts(-4.6), ts(11.6), 0]],
        tx(3.2),
        ty(19.5),
        [1, 1],
        'S',
        false
      );
      doc.circle(tx(16.4), ty(8.2), ts(2.5), 'S');
      doc.lines(
        [[ts(2.6), ts(0.2), ts(4.4), ts(1.8), ts(4.6), ts(4.6)]],
        tx(16.2),
        ty(14.6),
        [1, 1],
        'S',
        false
      );
      break;
    }
    case 'PieChart': {
      doc.circle(tx(12), ty(12), ts(8.6), 'S');
      doc.line(tx(12), ty(3.4), tx(12), ty(12));
      doc.line(tx(12), ty(12), tx(20.6), ty(12));
      doc.line(tx(12), ty(12), tx(18.1), ty(5.9));
      break;
    }
    case 'Award': {
      doc.circle(tx(12), ty(9.0), ts(5.6), 'S');
      doc.lines(
        [
          [ts(-1.4), ts(7.4)],
          [ts(4.8), ts(-2.5)],
          [ts(4.8), ts(2.5)],
          [ts(-1.4), ts(-7.4)],
        ],
        tx(8.6),
        ty(13.8),
        [1, 1],
        'S',
        false
      );
      break;
    }
    case 'Calendar': {
      doc.roundedRect(tx(3.2), ty(4.6), ts(17.6), ts(16.4), ts(2.0), ts(2.0), 'S');
      doc.line(tx(3.2), ty(9.8), tx(20.8), ty(9.8));
      doc.line(tx(8.0), ty(2.6), tx(8.0), ty(6.2));
      doc.line(tx(16.0), ty(2.6), tx(16.0), ty(6.2));
      break;
    }
    case 'ArrowRightLeft': {
      doc.line(tx(4), ty(7.5), tx(20), ty(7.5));
      doc.line(tx(16.2), ty(4.0), tx(20), ty(7.5));
      doc.line(tx(16.2), ty(11.0), tx(20), ty(7.5));
      doc.line(tx(20), ty(16.5), tx(4), ty(16.5));
      doc.line(tx(7.8), ty(13.0), tx(4), ty(16.5));
      doc.line(tx(7.8), ty(20.0), tx(4), ty(16.5));
      break;
    }
    case 'Send': {
      doc.lines(
        [
          [ts(-7.0), ts(19.0)],
          [ts(-3.6), ts(-8.4)],
          [ts(-8.4), ts(-3.6)],
        ],
        tx(21.4),
        ty(2.6),
        [1, 1],
        'S',
        true
      );
      doc.line(tx(21.4), ty(2.6), tx(10.8), ty(13.2));
      break;
    }
    case 'CheckCircle': {
      doc.circle(tx(12), ty(12), ts(8.8), 'S');
      doc.line(tx(8.0), ty(12.2), tx(10.8), ty(15.0));
      doc.line(tx(10.8), ty(15.0), tx(16.4), ty(9.0));
      break;
    }
    case 'MapPin': {
      doc.circle(tx(12), ty(9.8), ts(6.4), 'S');
      doc.line(tx(6.6), ty(13.4), tx(12), ty(21.2));
      doc.line(tx(17.4), ty(13.4), tx(12), ty(21.2));
      doc.circle(tx(12), ty(9.8), ts(2.3), 'S');
      break;
    }
    case 'Plane': {
      doc.lines(
        [
          [ts(-4.4), ts(4.4)],
          [ts(-8.4), ts(-1.8)],
          [ts(-1.4), ts(1.4)],
          [ts(5.8), ts(3.8)],
          [ts(-3.0), ts(3.0)],
          [ts(-3.0), ts(-0.5)],
          [ts(-1.0), ts(1.0)],
          [ts(3.2), ts(1.8)],
          [ts(1.8), ts(3.2)],
          [ts(1.0), ts(-1.0)],
          [ts(-0.5), ts(-3.0)],
          [ts(3.0), ts(-3.0)],
          [ts(3.8), ts(5.8)],
          [ts(1.4), ts(-1.4)],
          [ts(-1.8), ts(-8.4)],
          [ts(4.4), ts(-4.4)],
          [ts(0.8), ts(-1.8)],
          [ts(-1.8), ts(0.8)],
        ],
        tx(19.5),
        ty(3.5),
        [1, 1],
        'F',
        true
      );
      break;
    }
    case 'Car': {
      doc.lines(
        [
          [ts(2.0), ts(-4.2)],
          [ts(9.2), 0],
          [ts(2.0), ts(4.2)],
        ],
        tx(5.4),
        ty(11.0),
        [1, 1],
        'S',
        true
      );
      doc.roundedRect(tx(3.2), ty(11.0), ts(17.6), ts(5.2), ts(1.4), ts(1.4), 'S');
      doc.circle(tx(7.4), ty(16.6), ts(1.8), 'S');
      doc.circle(tx(16.6), ty(16.6), ts(1.8), 'S');
      break;
    }
    case 'Utensils': {
      doc.line(tx(5.2), ty(3.2), tx(5.2), ty(9.4));
      doc.line(tx(7.6), ty(3.2), tx(7.6), ty(9.4));
      doc.line(tx(10.0), ty(3.2), tx(10.0), ty(9.4));
      doc.line(tx(5.2), ty(9.4), tx(10.0), ty(9.4));
      doc.line(tx(7.6), ty(9.4), tx(7.6), ty(20.6));
      doc.line(tx(17.6), ty(3.2), tx(17.6), ty(20.6));
      doc.lines(
        [
          [ts(-3.2), ts(2.2)],
          [0, ts(6.8)],
          [ts(3.2), 0],
        ],
        tx(17.6),
        ty(3.2),
        [1, 1],
        'S',
        false
      );
      break;
    }
    case 'Hotel': {
      doc.roundedRect(tx(5.2), ty(3.0), ts(13.6), ts(18.0), ts(1.4), ts(1.4), 'S');
      doc.rect(tx(9.6), ty(16.2), ts(4.8), ts(4.8), 'S');
      const wins = [
        [8.0, 5.8],
        [13.4, 5.8],
        [8.0, 9.4],
        [13.4, 9.4],
        [8.0, 12.8],
        [13.4, 12.8],
      ];
      wins.forEach(([wx, wy]) => {
        doc.rect(tx(wx), ty(wy), ts(2.4), ts(1.8), 'F');
      });
      break;
    }
    case 'Ticket': {
      doc.roundedRect(tx(2.6), ty(5.6), ts(18.8), ts(12.8), ts(1.8), ts(1.8), 'S');
      doc.line(tx(13.4), ty(6.8), tx(13.4), ty(8.8));
      doc.line(tx(13.4), ty(11.0), tx(13.4), ty(13.0));
      doc.line(tx(13.4), ty(15.2), tx(13.4), ty(17.2));
      break;
    }
    default: {
      // Package (hình lập phương isometric chuẩn vector)
      doc.lines(
        [
          [ts(8.2), ts(4.6)],
          [0, ts(9.2)],
          [ts(-8.2), ts(4.6)],
          [ts(-8.2), ts(-4.6)],
          [0, ts(-9.2)],
        ],
        tx(12.0),
        ty(2.8),
        [1, 1],
        'S',
        true
      );
      doc.line(tx(3.8), ty(7.4), tx(12.0), ty(12.0));
      doc.line(tx(20.2), ty(7.4), tx(12.0), ty(12.0));
      doc.line(tx(12.0), ty(12.0), tx(12.0), ty(21.2));
      break;
    }
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
  if (bgRgb) {
    doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
    doc.roundedRect(x, y, sizeMm, sizeMm, sizeMm * 0.23, sizeMm * 0.23, 'F');
  }
  const pad = bgRgb ? sizeMm * 0.2 : sizeMm * 0.05;
  drawVectorStrokeIconGeometry(
    doc,
    iconName,
    x + pad,
    y + pad,
    sizeMm - pad * 2,
    strokeRgb
  );
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

function formatPctVN(pct: number): string {
  return `${String(pct).replace('.', ',')}%`;
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

  // Badge tròn phẳng bên trái chứa icon Ví trắng trên nền xanh dương sáng
  drawFlatAppendixIcon(
    doc,
    'Wallet',
    marginX + 9.6,
    y + bannerH / 2,
    10.4,
    [255, 255, 255],
    [22, 98, 232]
  );

  // Dòng phụ phía trên theo chuẩn thiết kế phẳng
  const metaParts = [subtitleBadge, report.location, report.dateRangeLabel].filter(Boolean);
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(8.1);
  doc.setTextColor(210, 226, 250);
  doc.text(metaParts.join('  •  '), marginX + 18.2, y + 7.2);

  // Tiêu đề chính chuyến đi in đậm nổi bật
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(255, 255, 255);
  const maxTitleLen =
    report.tripName.length > 42 ? `${report.tripName.slice(0, 41)}…` : report.tripName;
  doc.text(maxTitleLen.toUpperCase(), marginX + 18.2, y + 14.5);

  // Thời gian xuất báo cáo gọn gàng bên phải
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
 * Vẽ hàng 4 thẻ KPI trên Trang 1 theo đúng ngôn ngữ thiết kế phẳng (Minimalist Flat KPI Cards):
 * - Nền pastel dịu + viền mảnh đồng màu (không dùng thanh đậm trên đỉnh)
 * - Huy hiệu tròn lớn bên trái chứa icon phẳng
 * - 3 dòng chữ căn trái thẳng hàng bên phải huy hiệu (Nhãn tự nhiên -> Số lớn in đậm -> Mô tả phụ)
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

    const iconDiameter = 7.6;
    const iconCenterX = x + 5.6;
    const iconCenterY = y + boxHeight / 2;
    const flatKind =
      item.iconName === 'PieChart'
        ? 'PieChartHeader'
        : item.iconName === 'Package'
          ? 'MoreDots'
          : item.iconName;

    drawFlatAppendixIcon(
      doc,
      flatKind,
      iconCenterX,
      iconCenterY,
      iconDiameter,
      item.accentColor,
      item.iconBgColor
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
      `${formatVND(item.amount, false)} ₫ (${formatPctVN(item.percentage)})`,
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
    let balLabel = '0 ₫';
    let pillBg: [number, number, number] = [241, 245, 249];
    let pillText: [number, number, number] = COLOR_MUTED;
    if (b.balance > 0) {
      pillBg = [209, 250, 229];
      pillText = COLOR_TEAL_DARK;
      balLabel = `+${formatVND(b.balance, false)} ₫`;
    } else if (b.balance < 0) {
      pillBg = [255, 228, 230];
      pillText = COLOR_ROSE_DARK;
      balLabel = `${formatVND(b.balance, false)} ₫`;
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
  kpi3ColWidth: number;
  kpi3CardX: [number, number, number];
  mainColWidth: number;
  leftColX: number;
  rightColX: number;
  headerHeight: number;
  blockHeight: number;
}

/**
 * Tính toán hệ lưới Bento Grid cho Phụ lục cá nhân đảm bảo:
 * - Hàng KPI phía trên và 2 khối chính hàng dưới dùng chung `gridGap` và căn thẳng lề trái/phải tuyệt đối.
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

/**
 * Vẽ đa giác hoặc hình khép kín bằng lệnh vector gốc của jsPDF (`doc.lines`)
 * từ danh sách các đỉnh tuyệt đối `[[x0, y0], [x1, y1], ...]`.
 */
function drawVectorPolygon(
  doc: any,
  points: Array<[number, number]>,
  style: 'F' | 'S' | 'FD' = 'F',
  closed = true
): void {
  if (points.length < 2) return;
  const [x0, y0] = points[0];
  const deltas: Array<[number, number]> = [];
  for (let i = 1; i < points.length; i++) {
    deltas.push([points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]]);
  }
  doc.lines(deltas, x0, y0, [1, 1], style, closed);
}

/**
 * Tạo danh sách điểm xấp xỉ cung tròn mượt bằng đa giác vector độ phân giải cao
 */
function buildArcPoints(
  cx: number,
  cy: number,
  r: number,
  startRad: number,
  endRad: number,
  steps = 20
): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const t = startRad + ((endRad - startRad) * i) / steps;
    pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
  }
  return pts;
}

/**
 * Vẽ trực tiếp 100% Vector cho hệ thống Icon Minimalist Flat-Design
 * trong Phụ lục báo cáo cá nhân (không dùng ảnh bitmap / canvas),
 * đảm bảo phóng to 800%–1600% vẫn giữ nguyên độ sắc nét tuyệt đối.
 */
function drawFlatAppendixIcon(
  doc: any,
  kind: string,
  centerX: number,
  centerY: number,
  diameterMm: number,
  fgRgb: [number, number, number],
  bgRgb?: [number, number, number]
): void {
  if (bgRgb) {
    doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
    doc.circle(centerX, centerY, diameterMm / 2, 'F');
  }

  const cutRgb: [number, number, number] = bgRgb || [255, 255, 255];
  const s = diameterMm / 24;
  const originX = centerX - diameterMm / 2;
  const originY = centerY - diameterMm / 2;
  const tx = (vx: number) => originX + vx * s;
  const ty = (vy: number) => originY + vy * s;
  const tr = (vr: number) => vr * s;

  doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
  doc.setDrawColor(fgRgb[0], fgRgb[1], fgRgb[2]);
  doc.setLineCap('round');
  doc.setLineJoin('round');

  switch (kind) {
    case 'Wallet': {
      // Nắp ví nghiêng phía trên
      drawVectorPolygon(
        doc,
        [
          [tx(6.4), ty(8.2)],
          [tx(15.6), ty(5.3)],
          [tx(17.4), ty(6.1)],
          [tx(17.4), ty(8.4)],
        ],
        'F',
        true
      );
      // Khe trắng tách nhẹ giữa nắp ví và thân ví
      doc.setDrawColor(cutRgb[0], cutRgb[1], cutRgb[2]);
      doc.setLineWidth(Math.max(0.18, s * 0.7));
      doc.line(tx(6.0), ty(7.65), tx(17.8), ty(7.65));

      // Thân ví phẳng bo góc
      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.roundedRect(tx(5.2), ty(7.6), tr(13.4), tr(10.2), tr(2.1), tr(2.1), 'F');

      // Hốc khóa cài bên phải (Cutout)
      doc.setFillColor(cutRgb[0], cutRgb[1], cutRgb[2]);
      doc.roundedRect(tx(14.0), ty(10.5), tr(5.1), tr(4.4), tr(1.3), tr(1.3), 'F');

      // Nút khóa cài nổi bật
      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.roundedRect(tx(14.6), ty(11.15), tr(4.1), tr(3.1), tr(1.0), tr(1.0), 'F');

      // Chấm khóa tròn
      doc.setFillColor(cutRgb[0], cutRgb[1], cutRgb[2]);
      doc.circle(tx(16.15), ty(12.7), tr(0.68), 'F');
      break;
    }

    case 'Users': {
      // Người phụ bên phải
      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.circle(tx(15.6), ty(9.1), tr(2.05), 'F');
      const rightBodyPts = buildArcPoints(
        tx(15.6),
        ty(16.7),
        tr(3.35),
        Math.PI,
        Math.PI * 2,
        14
      );
      drawVectorPolygon(doc, rightBodyPts, 'F', true);

      // Viền tách nhẹ giữa 2 người
      doc.setFillColor(cutRgb[0], cutRgb[1], cutRgb[2]);
      doc.circle(tx(9.5), ty(8.6), tr(3.05), 'F');
      const cutBodyPts = buildArcPoints(
        tx(9.5),
        ty(17.2),
        tr(5.05),
        Math.PI,
        Math.PI * 2,
        16
      );
      drawVectorPolygon(doc, cutBodyPts, 'F', true);

      // Người chính bên trái
      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.circle(tx(9.5), ty(8.6), tr(2.45), 'F');
      const leftBodyPts = buildArcPoints(
        tx(9.5),
        ty(17.2),
        tr(4.45),
        Math.PI,
        Math.PI * 2,
        16
      );
      drawVectorPolygon(doc, leftBodyPts, 'F', true);
      break;
    }

    case 'CheckSolid': {
      doc.setDrawColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.setLineWidth(Math.max(0.35, s * 2.55));
      doc.line(tx(7.2), ty(12.3), tx(10.6), ty(15.7));
      doc.line(tx(10.6), ty(15.7), tx(17.0), ty(8.8));
      break;
    }

    case 'RefreshCw': {
      doc.setDrawColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.setLineWidth(Math.max(0.32, s * 2.3));
      const arcPts = buildArcPoints(
        tx(12.0),
        ty(12.0),
        tr(5.45),
        0.38,
        Math.PI * 1.76,
        24
      );
      drawVectorPolygon(doc, arcPts, 'S', false);

      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.triangle(
        tx(16.9),
        ty(5.6),
        tx(17.8),
        ty(10.4),
        tx(13.1),
        ty(9.3),
        'F'
      );
      break;
    }

    case 'PieChartHeader': {
      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      const mainSector: Array<[number, number]> = [
        [tx(11.3), ty(12.7)],
        ...buildArcPoints(
          tx(11.3),
          ty(12.7),
          tr(7.1),
          Math.PI * 0.02,
          Math.PI * 1.48,
          22
        ),
      ];
      drawVectorPolygon(doc, mainSector, 'F', true);

      const wedgeSector: Array<[number, number]> = [
        [tx(12.7), ty(11.3)],
        ...buildArcPoints(
          tx(12.7),
          ty(11.3),
          tr(7.1),
          -Math.PI * 0.48,
          -Math.PI * 0.02,
          12
        ),
      ];
      drawVectorPolygon(doc, wedgeSector, 'F', true);
      break;
    }

    case 'Plane': {
      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      const planePoly: Array<[number, number]> = [
        [tx(20.6), ty(3.4)],
        [tx(19.3), ty(3.1)],
        [tx(16.5), ty(4.6)],
        [tx(13.0), ty(8.0)],
        [tx(4.8), ty(6.2)],
        [tx(3.5), ty(7.2)],
        [tx(9.0), ty(12.0)],
        [tx(7.0), ty(15.0)],
        [tx(4.0), ty(15.0)],
        [tx(3.0), ty(16.0)],
        [tx(6.0), ty(18.0)],
        [tx(8.0), ty(21.0)],
        [tx(9.0), ty(20.0)],
        [tx(9.0), ty(17.0)],
        [tx(12.0), ty(15.0)],
        [tx(16.8), ty(20.5)],
        [tx(17.8), ty(19.2)],
        [tx(16.0), ty(11.0)],
        [tx(19.4), ty(7.5)],
        [tx(20.9), ty(4.7)],
      ];
      drawVectorPolygon(doc, planePoly, 'F', true);
      break;
    }

    case 'Utensils': {
      // Nĩa bên trái (Fork)
      doc.setDrawColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.setLineWidth(Math.max(0.22, s * 1.55));
      doc.line(tx(7.2), ty(5.2), tx(7.2), ty(10.0));
      doc.line(tx(9.2), ty(5.2), tx(9.2), ty(10.0));
      doc.line(tx(11.2), ty(5.2), tx(11.2), ty(10.0));

      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.roundedRect(tx(6.5), ty(9.3), tr(5.4), tr(2.4), tr(1.0), tr(1.0), 'F');
      doc.roundedRect(tx(8.2), ty(11.1), tr(2.0), tr(7.9), tr(0.85), tr(0.85), 'F');

      // Dao bên phải (Knife)
      const knifeBlade: Array<[number, number]> = [
        [tx(16.5), ty(5.0)],
        [tx(15.2), ty(5.3)],
        [tx(13.9), ty(7.2)],
        [tx(13.3), ty(9.8)],
        [tx(13.3), ty(12.3)],
        [tx(14.8), ty(12.8)],
        [tx(16.5), ty(12.8)],
      ];
      drawVectorPolygon(doc, knifeBlade, 'F', true);
      doc.roundedRect(tx(14.75), ty(12.0), tr(1.8), tr(7.0), tr(0.8), tr(0.8), 'F');
      break;
    }

    case 'Bed':
    case 'Hotel': {
      // Giường ngủ phẳng (Flat Bed Icon) theo đúng thiết kế mẫu Lưu trú
      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      // Chân giường đầu trái (cao) và chân phải (thấp)
      doc.roundedRect(tx(4.8), ty(7.4), tr(1.8), tr(9.8), tr(0.7), tr(0.7), 'F');
      doc.roundedRect(tx(17.4), ty(12.2), tr(1.8), tr(5.0), tr(0.7), tr(0.7), 'F');
      // Khung đệm ngang
      doc.roundedRect(tx(5.0), ty(12.6), tr(14.0), tr(2.3), tr(0.7), tr(0.7), 'F');
      // Gối nằm bên trái
      doc.circle(tx(8.5), ty(10.6), tr(1.35), 'F');
      // Chăn đắp bo tròn bên phải
      doc.roundedRect(tx(10.8), ty(9.5), tr(7.4), tr(3.4), tr(1.3), tr(1.3), 'F');
      break;
    }

    case 'MoreDots': {
      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      [7.2, 12.0, 16.8].forEach((cx) => {
        doc.circle(tx(cx), ty(12.0), tr(1.55), 'F');
      });
      break;
    }

    case 'Car': {
      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      // Mui xe hình thang cân
      drawVectorPolygon(
        doc,
        [
          [tx(7.4), ty(7.2)],
          [tx(16.6), ty(7.2)],
          [tx(18.4), ty(11.0)],
          [tx(5.6), ty(11.0)],
        ],
        'F',
        true
      );
      // Thân xe bo tròn
      doc.roundedRect(tx(4.8), ty(10.5), tr(14.4), tr(5.2), tr(1.6), tr(1.6), 'F');
      // 2 bánh xe
      doc.roundedRect(tx(5.6), ty(14.8), tr(2.4), tr(2.8), tr(0.75), tr(0.75), 'F');
      doc.roundedRect(tx(16.0), ty(14.8), tr(2.4), tr(2.8), tr(0.75), tr(0.75), 'F');

      // Kính chắn gió (Cutout)
      doc.setFillColor(cutRgb[0], cutRgb[1], cutRgb[2]);
      drawVectorPolygon(
        doc,
        [
          [tx(8.2), ty(8.2)],
          [tx(15.8), ty(8.2)],
          [tx(16.9), ty(10.5)],
          [tx(7.1), ty(10.5)],
        ],
        'F',
        true
      );
      // 2 đèn pha tròn
      doc.circle(tx(7.4), ty(13.1), tr(1.1), 'F');
      doc.circle(tx(16.6), ty(13.1), tr(1.1), 'F');
      break;
    }

    case 'Calculator': {
      doc.setDrawColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.setLineWidth(Math.max(0.24, s * 1.9));
      doc.roundedRect(tx(4.5), ty(2.5), tr(15.0), tr(19.0), tr(2.2), tr(2.2), 'S');

      doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
      doc.roundedRect(tx(7.0), ty(5.2), tr(10.0), tr(3.6), tr(0.85), tr(0.85), 'F');

      const dots: Array<[number, number]> = [
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
        doc.circle(tx(dx), ty(dy), tr(0.95), 'F');
      });
      break;
    }

    default: {
      const innerSize = diameterMm * 0.58;
      drawVectorStrokeIconGeometry(
        doc,
        kind,
        centerX - innerSize / 2,
        centerY - innerSize / 2,
        innerSize,
        fgRgb
      );
      break;
    }
  }
}

/**
 * Vẽ trực tiếp 100% Vector cho nền Hero Banner màu xanh Navy đậm kết hợp
 * mảng hình học lượn sóng tối giản (Minimalist Flat Geometric Waves)
 */
function drawAppendixHeroBannerBackground(
  doc: any,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const r = 2.6;
  // 1. Nền xanh Navy chủ đạo bo góc
  doc.setFillColor(17, 36, 77);
  doc.roundedRect(x, y, width, height, r, r, 'F');

  // 2. Mảng sóng hình học thứ nhất (bên phải, dùng đường cong Bezier vector gốc của jsPDF)
  doc.setFillColor(22, 48, 102);
  const w1StartX = x + width * 0.56;
  const w1EndX = x + width - r;
  doc.lines(
    [
      [
        width * 0.12,
        height * 0.25,
        width * 0.19,
        height * 0.85,
        width * 0.33,
        height,
      ],
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

  // 3. Mảng sóng hình học thứ hai (góc phải, dùng đường cong Bezier vector gốc của jsPDF)
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
  // 1. Nền thân thẻ trắng bo góc
  doc.setFillColor(bodyFillRgb[0], bodyFillRgb[1], bodyFillRgb[2]);
  doc.roundedRect(x, y, width, blockHeight, radius, radius, 'F');

  // 2. Thanh tiêu đề đặc (Solid Header Bar) bo góc trên, phẳng cạnh dưới
  doc.setFillColor(headerFillRgb[0], headerFillRgb[1], headerFillRgb[2]);
  doc.roundedRect(x, y, width, headerHeight, radius, radius, 'F');
  doc.rect(x, y + headerHeight - radius, width, radius, 'F');

  // 3. Viền mảnh đồng bộ bao quanh toàn thẻ (Card trái viền red nhạt, Card phải viền blue nhạt)
  doc.setDrawColor(borderRgb[0], borderRgb[1], borderRgb[2]);
  doc.setLineWidth(0.32);
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

/**
 * Vẽ hàng 3 thẻ KPI phẳng cho Phụ lục cá nhân (Đã chi, Phải chịu, Số dư cuối)
 * theo đúng thiết kế phẳng trong ảnh mẫu:
 * - Không có thanh màu trên đỉnh
 * - Huy hiệu icon phẳng tròn lớn bên trái
 * - 3 dòng chữ căn trái thẳng hàng bên phải huy hiệu
 */
function drawAppendixThreeKpiGrid(
  doc: any,
  activeFont: string,
  items: Array<{
    label: string;
    value: string;
    subtext: string;
    subtextBold?: boolean;
    subtextColor?: [number, number, number];
    flatIconKind: string;
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

    // 1. Thân thẻ pastel phẳng + viền mảnh đồng màu
    doc.setFillColor(item.surfaceColor[0], item.surfaceColor[1], item.surfaceColor[2]);
    doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, y, colW, boxH, radius, radius, 'FD');

    // 2. Huy hiệu Icon tròn phẳng kích thước lớn đặt căn giữa theo chiều dọc ở bên trái
    const iconDiameter = 9.2;
    const iconCenterX = x + 7.2;
    const iconCenterY = y + boxH / 2;
    drawFlatAppendixIcon(
      doc,
      item.flatIconKind,
      iconCenterX,
      iconCenterY,
      iconDiameter,
      item.iconFgColor,
      item.iconBgColor
    );

    // 3. Khối 3 dòng văn bản căn trái thẳng hàng bên phải huy hiệu
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
    flatKind: 'Bed',
    iconFg: [118, 56, 218],
    iconBg: [235, 224, 255],
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

  drawFlatAppendixIcon(
    doc,
    'PieChartHeader',
    x + 7.2,
    y + headerHeight / 2,
    5.8,
    [255, 255, 255]
  );
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(255, 255, 255);
  doc.text(`Chi phí theo Hạng mục (${memberName})`, x + 12.4, y + 6.6);

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
      `${formatVND(cat.amount, false)} ₫ (${formatPctVN(cat.percentage)})`,
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

  const avatarRgb = hexToRgb(appendix.avatarColor, [22, 98, 232]);
  doc.setFillColor(avatarRgb[0], avatarRgb[1], avatarRgb[2]);
  doc.circle(marginX + 9.6, cursorY + bannerH / 2, 5.2, 'F');
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(12.4);
  doc.setTextColor(255, 255, 255);
  doc.text(
    (appendix.memberName || '?').trim().charAt(0).toUpperCase(),
    marginX + 9.6,
    cursorY + bannerH / 2 + 1.5,
    { align: 'center' }
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

  // ==========================================================================
  // 2. HÀNG GRID 3 Ô KPI CÁ NHÂN PHẲNG (Đã chi, Phải chịu, Số dư cuối)
  // ==========================================================================
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
        flatIconKind: 'Wallet',
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
        flatIconKind: 'Users',
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
        flatIconKind: 'RefreshCw',
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
  //    - Cột trái: "Số tiền cần chuyển" / "Số tiền cần nhận" (Header nền Red, viền Red nhạt)
  //    - Cột phải: "Chi phí theo Hạng mục ([username])" (Header nền Blue, viền Blue nhạt)
  // ==========================================================================
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

  drawIconBadge(doc, 'Send', leftColX + 4.8, cursorY + 2.3, 5.2, [255, 255, 255]);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.8);
  doc.setTextColor(255, 255, 255);
  doc.text(leftHeaderTitle, leftColX + 11.8, cursorY + 6.6);

  const leftCenterX = leftColX + mainColWidth / 2;
  const heroPrimaryAmount = `${formatVND(Math.abs(appendix.balance), false)} ₫`;
  const heroPrimaryColor: [number, number, number] = isPositive
    ? [13, 128, 86]
    : [198, 24, 48];

  if (actions.length <= 1) {
    // 1. CHỈ SỐ QUAN TRỌNG NHẤT: Số tiền quyết toán kích thước lớn nổi bật ở tâm điểm
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(25.0);
    doc.setTextColor(heroPrimaryColor[0], heroPrimaryColor[1], heroPrimaryColor[2]);
    doc.text(heroPrimaryAmount, leftCenterX, cursorY + headerHeight + 12.6, {
      align: 'center',
    });

    // 2. Hộp Pill hiển thị cặp chuyển khoản (VD: Đức → Nhi)
    const pillX = leftColX + 4.4;
    const pillY = cursorY + headerHeight + 15.8;
    const pillW = mainColWidth - 8.8;
    const pillH = 10.2;
    const pillFill: [number, number, number] = [252, 234, 237];

    doc.setFillColor(pillFill[0], pillFill[1], pillFill[2]);
    doc.roundedRect(pillX, pillY, pillW, pillH, 2.4, 2.4, 'F');

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
        [206, 26, 48]
      );

      if (act.toBankInfo || appendix.bankInfo) {
        const rawBank = act.toBankInfo || appendix.bankInfo;
        drawBankInfoWithHollowDot(
          doc,
          activeFont,
          9.0,
          rawBank,
          leftCenterX,
          pillY + pillH + 5.5,
          [15, 28, 63]
        );
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
    // Trường hợp thành viên có >= 2 giao dịch tất toán
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
        isSender ? [206, 26, 48] : [13, 148, 136],
        [15, 28, 63]
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...(isSender ? COLOR_ROSE_DARK : COLOR_TEAL_DARK));
      doc.text(
        `${isSender ? '' : '+'}${formatVND(act.amount, false)} ₫`,
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
  const formulaLineY = cursorY + blockHeight - 7.8;
  doc.setDrawColor(224, 230, 238);
  doc.setLineWidth(0.24);
  doc.line(leftColX + 4.4, formulaLineY, leftColX + mainColWidth - 4.4, formulaLineY);

  drawFlatAppendixIcon(
    doc,
    'Calculator',
    leftColX + 6.4,
    cursorY + blockHeight - 4.0,
    4.2,
    [24, 98, 236]
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
          { content: 'Số tiền (₫)', styles: { halign: 'right' } },
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

  // Trường hợp lọc theo 1 thành viên cụ thể: Xuất báo cáo cá nhân
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
            { content: 'Đã chi (₫)', styles: { halign: 'right' } },
            { content: 'Phải chịu (₫)', styles: { halign: 'right' } },
            { content: 'Đã chuyển (₫)', styles: { halign: 'right' } },
            { content: 'Số dư cuối (₫)', styles: { halign: 'right' } },
            { content: 'Trạng thái', styles: { halign: 'right' } },
          ],
        ]
      : [
          [
            'Thành viên',
            { content: 'Đã chi (₫)', styles: { halign: 'right' } },
            { content: 'Phải chịu (₫)', styles: { halign: 'right' } },
            { content: 'Số dư cuối (₫)', styles: { halign: 'right' } },
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
          { content: 'Số tiền chuyển (₫)', styles: { halign: 'right' } },
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
        { content: 'Số tiền (₫)', styles: { halign: 'right' } },
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
                      ? `TỔNG CHI TIÊU CHUYẾN ĐI (${report.overview.expenseCount} khoản chi • Đã chuyển: ${formatVND(report.totalTransferAmount, false)} ₫)`
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
      `Phụ lục cá nhân (${idx + 1}/${report.memberAppendices.length})`,
      marginX,
      10.5,
      pageWidth
    );
  });

  stampPageFooters(doc, activeFont, report);
  doc.save(report.suggestedFileName);
}
