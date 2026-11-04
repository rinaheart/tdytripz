import type { jsPDF } from 'jspdf';

/**
 * Hệ thống Render Icon Lucide Vector 100% cho Báo cáo PDF (jsPDF).
 * Sử dụng trực tiếp dữ liệu hình học chuẩn 24x24 từ bộ `lucide-react` của Web App,
 * thông dịch các phần tử SVG (`path`, `circle`, `rect`, `line`, `polyline`) sang lệnh
 * vẽ vector nguyên bản của PDF (`doc.lines`, `doc.circle`, `doc.roundedRect`, `doc.line`).
 */

export type RGB = [number, number, number];

export type LucideIconElement =
  | ['path', { d: string; fillRule?: string }]
  | ['circle', { cx: number; cy: number; r: number }]
  | ['rect', { x: number; y: number; width: number; height: number; rx?: number }]
  | ['line', { x1: number; y1: number; x2: number; y2: number }]
  | ['polyline', { points: string }];

export type LucidePdfStyle =
  | 'plain'
  | 'circle-badge'
  | 'duotone-circle'
  | 'rounded-badge'
  | 'solid-badge';

/**
 * Từ điển dữ liệu gốc 24x24 chuẩn 100% từ `lucide-react`
 */
export const LUCIDE_ICON_NODES: Record<string, LucideIconElement[]> = {
  Wallet: [
    [
      'path',
      {
        d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
      },
    ],
    ['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }],
  ],
  Users: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
    ['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
    ['circle', { cx: 9, cy: 7, r: 4 }],
  ],
  PieChart: [
    [
      'path',
      {
        d: 'M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z',
      },
    ],
    ['path', { d: 'M21.21 15.89A10 10 0 1 1 8 2.83' }],
  ],
  Award: [
    [
      'path',
      {
        d: 'm15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526',
      },
    ],
    ['circle', { cx: 12, cy: 8, r: 6 }],
  ],
  Calendar: [
    ['path', { d: 'M8 2v3' }],
    ['path', { d: 'M16 2v3' }],
    ['rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }],
    ['path', { d: 'M3 9h18' }],
  ],
  ArrowRightLeft: [
    ['path', { d: 'm16 3 4 4-4 4' }],
    ['path', { d: 'M20 7H4' }],
    ['path', { d: 'm8 21-4-4 4-4' }],
    ['path', { d: 'M4 17h16' }],
  ],
  ArrowUpRight: [
    ['path', { d: 'M7 7h10v10' }],
    ['path', { d: 'M7 17 17 7' }],
  ],
  ArrowDownLeft: [
    ['path', { d: 'M17 7 7 17' }],
    ['path', { d: 'M17 17H7V7' }],
  ],
  Send: [
    [
      'path',
      {
        d: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z',
      },
    ],
    ['path', { d: 'm21.854 2.147-10.94 10.939' }],
  ],
  CheckCircle2: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'm16 9-5.5 5.5L8 12' }],
  ],
  MapPin: [
    [
      'path',
      {
        d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0',
      },
    ],
    ['circle', { cx: 12, cy: 10, r: 3 }],
  ],
  Plane: [
    [
      'path',
      {
        d: 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
      },
    ],
  ],
  Car: [
    [
      'path',
      {
        d: 'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
      },
    ],
    ['circle', { cx: 7, cy: 17, r: 2 }],
    ['path', { d: 'M9 17h6' }],
    ['circle', { cx: 17, cy: 17, r: 2 }],
  ],
  Utensils: [
    ['path', { d: 'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2' }],
    ['path', { d: 'M7 2v20' }],
    ['path', { d: 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7' }],
  ],
  Hotel: [
    ['path', { d: 'M10 22v-6.57' }],
    ['path', { d: 'M12 11h.01' }],
    ['path', { d: 'M12 7h.01' }],
    ['path', { d: 'M14 15.43V22' }],
    ['path', { d: 'M15 16a5 5 0 0 0-6 0' }],
    ['path', { d: 'M16 11h.01' }],
    ['path', { d: 'M16 7h.01' }],
    ['path', { d: 'M8 11h.01' }],
    ['path', { d: 'M8 7h.01' }],
    ['rect', { x: 4, y: 2, width: 16, height: 20, rx: 2 }],
  ],
  Bed: [
    ['path', { d: 'M2 4v16' }],
    ['path', { d: 'M2 8h18a2 2 0 0 1 2 2v10' }],
    ['path', { d: 'M2 17h20' }],
    ['path', { d: 'M6 8v9' }],
  ],
  Ticket: [
    [
      'path',
      {
        d: 'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
      },
    ],
    ['path', { d: 'M13 5v2' }],
    ['path', { d: 'M13 17v2' }],
    ['path', { d: 'M13 11v2' }],
  ],
  Package: [
    [
      'path',
      {
        d: 'M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z',
      },
    ],
    ['path', { d: 'M12 22V12' }],
    ['polyline', { points: '3.29 7 12 12 20.71 7' }],
    ['path', { d: 'm7.5 4.27 9 5.15' }],
  ],
  ShoppingBag: [
    ['path', { d: 'M16 10a4 4 0 0 1-8 0' }],
    ['path', { d: 'M3.103 6.034h17.794' }],
    [
      'path',
      {
        d: 'M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z',
      },
    ],
  ],
  RefreshCw: [
    ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
    ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
    ['path', { d: 'M8 16H3v5' }],
  ],
  Calculator: [
    ['rect', { width: 16, height: 20, x: 4, y: 2, rx: 2 }],
    ['line', { x1: 8, x2: 16, y1: 6, y2: 6 }],
    ['line', { x1: 16, x2: 16, y1: 14, y2: 18 }],
    ['path', { d: 'M16 10h.01' }],
    ['path', { d: 'M12 10h.01' }],
    ['path', { d: 'M8 10h.01' }],
    ['path', { d: 'M12 14h.01' }],
    ['path', { d: 'M8 14h.01' }],
    ['path', { d: 'M12 18h.01' }],
    ['path', { d: 'M8 18h.01' }],
  ],
  Ellipsis: [
    ['circle', { cx: 12, cy: 12, r: 1 }],
    ['circle', { cx: 19, cy: 12, r: 1 }],
    ['circle', { cx: 5, cy: 12, r: 1 }],
  ],
};

/**
 * Ánh xạ các bí danh tên icon sang chuẩn Lucide
 */
export function resolveLucideIconKey(rawName: string): string {
  const clean = (rawName || '').trim();
  if (LUCIDE_ICON_NODES[clean]) return clean;
  switch (clean) {
    case 'PieChartHeader':
    case 'ChartPie':
      return 'PieChart';
    case 'CheckCircle':
    case 'CheckSolid':
    case 'CircleCheck':
      return 'CheckCircle2';
    case 'MoreDots':
    case 'MoreHorizontal':
      return 'Ellipsis';
    default:
      return 'Package';
  }
}

export interface ParsedSubpath {
  points: Array<[number, number]>;
  closed: boolean;
  isDot: boolean;
}

function sampleSvgArc(
  x1: number,
  y1: number,
  rxInput: number,
  ryInput: number,
  phiDeg: number,
  largeArcFlag: number,
  sweepFlag: number,
  x2: number,
  y2: number,
  segments = 16
): Array<[number, number]> {
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
    return [[x2, y2]];
  }

  const phi = (phiDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const sqrtL = Math.sqrt(lambda);
    rx *= sqrtL;
    ry *= sqrtL;
  }

  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;

  const radicand = Math.max(
    0,
    (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq)
  );
  const sign = largeArcFlag === sweepFlag ? -1 : 1;
  const coef = sign * Math.sqrt(radicand);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);

  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angleBetween = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    const cosVal = Math.max(-1, Math.min(1, dot / (len || 1)));
    const angle = Math.acos(cosVal);
    return ux * vy - uy * vx < 0 ? -angle : angle;
  };

  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween(
    (x1p - cxp) / rx,
    (y1p - cyp) / ry,
    (-x1p - cxp) / rx,
    (-y1p - cyp) / ry
  );

  if (sweepFlag === 0 && dTheta > 0) {
    dTheta -= Math.PI * 2;
  } else if (sweepFlag === 1 && dTheta < 0) {
    dTheta += Math.PI * 2;
  }

  const steps = Math.max(4, Math.ceil((Math.abs(dTheta) / (Math.PI / 2)) * (segments / 2)));
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= steps; i++) {
    const theta = theta1 + (dTheta * i) / steps;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const px = cosPhi * rx * cosT - sinPhi * ry * sinT + cx;
    const py = sinPhi * rx * cosT + cosPhi * ry * sinT + cy;
    out.push([px, py]);
  }
  return out;
}

export function parseSvgPathToSubpaths(d: string): ParsedSubpath[] {
  const tokenRegex = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/gi;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(d)) !== null) {
    tokens.push(match[0]);
  }

  const subpaths: ParsedSubpath[] = [];
  let currentPts: Array<[number, number]> = [];
  let curX = 0;
  let curY = 0;
  let startX = 0;
  let startY = 0;
  let prevCmd = '';
  let prevCtrlX = 0;
  let prevCtrlY = 0;

  const flushSubpath = (closed: boolean) => {
    if (currentPts.length === 0) return;
    let totalLen = 0;
    for (let i = 1; i < currentPts.length; i++) {
      totalLen += Math.hypot(
        currentPts[i][0] - currentPts[i - 1][0],
        currentPts[i][1] - currentPts[i - 1][1]
      );
    }
    subpaths.push({
      points: currentPts,
      closed,
      isDot: totalLen <= 0.05,
    });
    currentPts = [];
  };

  let idx = 0;
  let cmd = '';

  const isCommand = (t: string) => /^[MmLlHhVvCcSsQqTtAaZz]$/.test(t);
  const nextNum = () => parseFloat(tokens[idx++]);

  while (idx < tokens.length) {
    if (isCommand(tokens[idx])) {
      cmd = tokens[idx++];
    } else if (!cmd) {
      break;
    }

    switch (cmd) {
      case 'M':
      case 'm': {
        flushSubpath(false);
        const rx = nextNum();
        const ry = nextNum();
        curX = cmd === 'm' ? curX + rx : rx;
        curY = cmd === 'm' ? curY + ry : ry;
        startX = curX;
        startY = curY;
        currentPts.push([curX, curY]);
        prevCmd = cmd;
        cmd = cmd === 'm' ? 'l' : 'L';
        break;
      }
      case 'L':
      case 'l': {
        const rx = nextNum();
        const ry = nextNum();
        curX = cmd === 'l' ? curX + rx : rx;
        curY = cmd === 'l' ? curY + ry : ry;
        currentPts.push([curX, curY]);
        prevCmd = cmd;
        break;
      }
      case 'H':
      case 'h': {
        const rx = nextNum();
        curX = cmd === 'h' ? curX + rx : rx;
        currentPts.push([curX, curY]);
        prevCmd = cmd;
        break;
      }
      case 'V':
      case 'v': {
        const ry = nextNum();
        curY = cmd === 'v' ? curY + ry : ry;
        currentPts.push([curX, curY]);
        prevCmd = cmd;
        break;
      }
      case 'C':
      case 'c': {
        const x1 = cmd === 'c' ? curX + nextNum() : nextNum();
        const y1 = cmd === 'c' ? curY + nextNum() : nextNum();
        const x2 = cmd === 'c' ? curX + nextNum() : nextNum();
        const y2 = cmd === 'c' ? curY + nextNum() : nextNum();
        const x = cmd === 'c' ? curX + nextNum() : nextNum();
        const y = cmd === 'c' ? curY + nextNum() : nextNum();
        const steps = 10;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const px =
            mt * mt * mt * curX +
            3 * mt * mt * t * x1 +
            3 * mt * t * t * x2 +
            t * t * t * x;
          const py =
            mt * mt * mt * curY +
            3 * mt * mt * t * y1 +
            3 * mt * t * t * y2 +
            t * t * t * y;
          currentPts.push([px, py]);
        }
        curX = x;
        curY = y;
        prevCtrlX = x2;
        prevCtrlY = y2;
        prevCmd = cmd;
        break;
      }
      case 'S':
      case 's': {
        const x1 =
          prevCmd === 'C' || prevCmd === 'c' || prevCmd === 'S' || prevCmd === 's'
            ? 2 * curX - prevCtrlX
            : curX;
        const y1 =
          prevCmd === 'C' || prevCmd === 'c' || prevCmd === 'S' || prevCmd === 's'
            ? 2 * curY - prevCtrlY
            : curY;
        const x2 = cmd === 's' ? curX + nextNum() : nextNum();
        const y2 = cmd === 's' ? curY + nextNum() : nextNum();
        const x = cmd === 's' ? curX + nextNum() : nextNum();
        const y = cmd === 's' ? curY + nextNum() : nextNum();
        const steps = 10;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const px =
            mt * mt * mt * curX +
            3 * mt * mt * t * x1 +
            3 * mt * t * t * x2 +
            t * t * t * x;
          const py =
            mt * mt * mt * curY +
            3 * mt * mt * t * y1 +
            3 * mt * t * t * y2 +
            t * t * t * y;
          currentPts.push([px, py]);
        }
        curX = x;
        curY = y;
        prevCtrlX = x2;
        prevCtrlY = y2;
        prevCmd = cmd;
        break;
      }
      case 'Q':
      case 'q': {
        const x1 = cmd === 'q' ? curX + nextNum() : nextNum();
        const y1 = cmd === 'q' ? curY + nextNum() : nextNum();
        const x = cmd === 'q' ? curX + nextNum() : nextNum();
        const y = cmd === 'q' ? curY + nextNum() : nextNum();
        const steps = 8;
        for (let s = 1; s <= steps; s++) {
          const t = s / steps;
          const mt = 1 - t;
          const px = mt * mt * curX + 2 * mt * t * x1 + t * t * x;
          const py = mt * mt * curY + 2 * mt * t * y1 + t * t * y;
          currentPts.push([px, py]);
        }
        curX = x;
        curY = y;
        prevCtrlX = x1;
        prevCtrlY = y1;
        prevCmd = cmd;
        break;
      }
      case 'A':
      case 'a': {
        const rx = nextNum();
        const ry = nextNum();
        const xAxisRotation = nextNum();
        const largeArcFlag = nextNum();
        const sweepFlag = nextNum();
        const x = cmd === 'a' ? curX + nextNum() : nextNum();
        const y = cmd === 'a' ? curY + nextNum() : nextNum();
        const arcPts = sampleSvgArc(
          curX,
          curY,
          rx,
          ry,
          xAxisRotation,
          largeArcFlag,
          sweepFlag,
          x,
          y,
          16
        );
        for (const pt of arcPts) {
          currentPts.push(pt);
        }
        curX = x;
        curY = y;
        prevCmd = cmd;
        break;
      }
      case 'Z':
      case 'z': {
        curX = startX;
        curY = startY;
        flushSubpath(true);
        prevCmd = cmd;
        cmd = '';
        break;
      }
      default: {
        idx++;
        break;
      }
    }
  }

  flushSubpath(false);
  return subpaths;
}

function blendRgb(fg: RGB, bg: RGB, fgWeight = 0.18): RGB {
  return [
    Math.round(fg[0] * fgWeight + bg[0] * (1 - fgWeight)),
    Math.round(fg[1] * fgWeight + bg[1] * (1 - fgWeight)),
    Math.round(fg[2] * fgWeight + bg[2] * (1 - fgWeight)),
  ];
}

export function drawLucideIcon(
  doc: jsPDF,
  iconName: string,
  centerX: number,
  centerY: number,
  sizeMm: number,
  fgRgb: RGB,
  bgRgb?: RGB,
  style: LucidePdfStyle = bgRgb ? 'duotone-circle' : 'plain'
): void {
  const key = resolveLucideIconKey(iconName);
  const rawElements = LUCIDE_ICON_NODES[key] || LUCIDE_ICON_NODES.Package;
  // Khi vẽ duotone, ưu tiên vẽ rect trước các chấm/đường con bên trong (ví dụ icon Hotel)
  const elements =
    style === 'duotone-circle'
      ? [...rawElements].sort(([a], [b]) => (a === 'rect' ? -1 : b === 'rect' ? 1 : 0))
      : rawElements;

  if (style !== 'plain' && bgRgb) {
    doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
    if (style === 'rounded-badge') {
      const r = sizeMm * 0.24;
      doc.roundedRect(centerX - sizeMm / 2, centerY - sizeMm / 2, sizeMm, sizeMm, r, r, 'F');
    } else {
      doc.circle(centerX, centerY, sizeMm / 2, 'F');
    }
  }

  const innerBox = style === 'plain' ? sizeMm : sizeMm * 0.56;
  const scale = innerBox / 24;
  const originX = centerX - innerBox / 2;
  const originY = centerY - innerBox / 2;
  const tx = (u: number) => originX + u * scale;
  const ty = (v: number) => originY + v * scale;
  const ts = (len: number) => len * scale;

  const strokeWidth = Math.max(0.24, innerBox * 0.092);
  doc.setLineCap('round');
  doc.setLineJoin('round');

  const isDuotone = style === 'duotone-circle' && Boolean(bgRgb);
  const duotoneFill = bgRgb ? blendRgb(fgRgb, bgRgb, 0.22) : fgRgb;

  for (const [tag, attrs] of elements) {
    doc.setDrawColor(fgRgb[0], fgRgb[1], fgRgb[2]);
    doc.setLineWidth(strokeWidth);

    if (tag === 'circle') {
      const { cx, cy, r } = attrs;
      if (key === 'Ellipsis') {
        doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
        doc.circle(tx(cx), ty(cy), ts(Math.max(1.2, r)), 'F');
      } else if (isDuotone && r >= 3) {
        doc.setFillColor(duotoneFill[0], duotoneFill[1], duotoneFill[2]);
        doc.circle(tx(cx), ty(cy), ts(r), 'FD');
      } else {
        doc.circle(tx(cx), ty(cy), ts(r), 'S');
      }
    } else if (tag === 'rect') {
      const { x, y, width, height, rx = 0 } = attrs;
      if (isDuotone) {
        doc.setFillColor(duotoneFill[0], duotoneFill[1], duotoneFill[2]);
        doc.roundedRect(tx(x), ty(y), ts(width), ts(height), ts(rx), ts(rx), 'FD');
      } else {
        doc.roundedRect(tx(x), ty(y), ts(width), ts(height), ts(rx), ts(rx), 'S');
      }
    } else if (tag === 'line') {
      const { x1, y1, x2, y2 } = attrs;
      doc.line(tx(x1), ty(y1), tx(x2), ty(y2));
    } else if (tag === 'polyline') {
      const rawNums = attrs.points
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      const pts: Array<[number, number]> = [];
      for (let i = 0; i + 1 < rawNums.length; i += 2) {
        pts.push([tx(rawNums[i]), ty(rawNums[i + 1])]);
      }
      if (pts.length >= 2) {
        const [x0, y0] = pts[0];
        const deltas: Array<[number, number]> = [];
        for (let i = 1; i < pts.length; i++) {
          deltas.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
        }
        doc.lines(deltas, x0, y0, [1, 1], 'S', false);
      }
    } else if (tag === 'path') {
      const subpaths = parseSvgPathToSubpaths(attrs.d);
      for (const sub of subpaths) {
        if (sub.isDot && sub.points.length > 0) {
          doc.setFillColor(fgRgb[0], fgRgb[1], fgRgb[2]);
          doc.circle(
            tx(sub.points[0][0]),
            ty(sub.points[0][1]),
            Math.max(0.18, strokeWidth * 0.58),
            'F'
          );
          continue;
        }
        if (sub.points.length < 2) continue;
        const [u0, v0] = sub.points[0];
        const deltas: Array<[number, number]> = [];
        for (let i = 1; i < sub.points.length; i++) {
          deltas.push([
            tx(sub.points[i][0]) - tx(sub.points[i - 1][0]),
            ty(sub.points[i][1]) - ty(sub.points[i - 1][1]),
          ]);
        }
        if (isDuotone && sub.closed) {
          doc.setFillColor(duotoneFill[0], duotoneFill[1], duotoneFill[2]);
          doc.lines(deltas, tx(u0), ty(v0), [1, 1], 'FD', true);
        } else {
          doc.lines(deltas, tx(u0), ty(v0), [1, 1], 'S', sub.closed);
        }
      }
    }
  }
}
