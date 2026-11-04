import type { jsPDF } from 'jspdf';
import {
  type BannerPalette,
  CARD_RADIUS,
  COLOR_INK,
  COLOR_MUTED,
  COLOR_ROSE_DARK,
  COLOR_TEAL_DARK,
  CONTENT_WIDTH,
  GRID_GAP,
  MARGIN_TOP,
  MARGIN_X,
  type RGB,
  SAFE_BOTTOM,
  hexToRgb,
} from './theme';

/**
 * Đo và cắt chuỗi văn bản theo chiều rộng thực tế (`doc.getTextWidth`) và thêm `…`.
 * Tuyệt đối không cắt theo số ký tự cứng (`slice`, `maxChars`).
 */
export function fitText(doc: jsPDF, text: string, maxWidth: number): string {
  const clean = (text || '').trim();
  if (!clean || maxWidth <= 0) return '';
  if (doc.getTextWidth(clean) <= maxWidth) return clean;

  const ellipsis = '…';
  const ellipsisW = doc.getTextWidth(ellipsis);
  if (ellipsisW >= maxWidth) return ellipsis;

  let low = 0;
  let high = clean.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = clean.slice(0, mid).trimEnd();
    if (doc.getTextWidth(candidate) + ellipsisW <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low > 0 ? `${clean.slice(0, low).trimEnd()}${ellipsis}` : ellipsis;
}

/**
 * Đo chiều rộng cột bảng dựa trên mẫu chuỗi rộng nhất (ví dụ `'00/00 00:00'`) cộng padding hai bên.
 */
export function measureCol(
  doc: jsPDF,
  sample: string,
  paddingMm: number,
  fontName = 'PlusJakartaSans',
  fontStyle: 'normal' | 'bold' = 'normal',
  fontSize = 7.6
): number {
  const prevFontSize = doc.getFontSize();
  doc.setFont(fontName, fontStyle);
  doc.setFontSize(fontSize);
  const textW = doc.getTextWidth(sample);
  doc.setFontSize(prevFontSize);
  return Math.ceil((textW + paddingMm * 2 + 0.8) * 10) / 10;
}

export function ensurePageSpace(
  doc: jsPDF,
  cursorY: number,
  neededHeight: number,
  topMargin = MARGIN_TOP,
  safeBottom = SAFE_BOTTOM
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + neededHeight > pageHeight - safeBottom) {
    doc.addPage();
    return topMargin;
  }
  return cursorY;
}

/**
 * Vẽ nền Banner 3 lớp sóng đồ họa phẳng dẫn xuất từ `accentColor`
 */
export function drawBannerBackground(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  palette: BannerPalette
): void {
  const r = CARD_RADIUS;
  doc.setFillColor(palette.base[0], palette.base[1], palette.base[2]);
  doc.roundedRect(x, y, width, height, r, r, 'F');

  doc.setFillColor(palette.wave1[0], palette.wave1[1], palette.wave1[2]);
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

  doc.setFillColor(palette.wave2[0], palette.wave2[1], palette.wave2[2]);
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

/**
 * Vẽ Avatar tròn chứa chữ cái đầu của tên thành viên
 */
export function drawMemberAvatarCircle(
  doc: jsPDF,
  activeFont: string,
  memberName: string,
  avatarColorHex: string,
  centerX: number,
  centerY: number,
  radiusMm = 2.0
): void {
  const rgb = hexToRgb(avatarColorHex, [13, 148, 136]);
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.circle(centerX, centerY, radiusMm, 'F');

  const initial = (memberName || '?').trim().charAt(0).toUpperCase();
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(Math.max(5.2, radiusMm * 2.95));
  doc.setTextColor(255, 255, 255);
  doc.text(initial, centerX, centerY + radiusMm * 0.36, { align: 'center' });
}

/**
 * Vẽ `[Avatar] Tên thành viên` (tên luôn đứng cạnh avatar để phân biệt các tên cùng chữ cái đầu như Loan / Lưu).
 * Sử dụng `fitText` theo `maxWidth` thay vì đếm ký tự cứng.
 */
export function drawMemberAvatarAndName(
  doc: jsPDF,
  activeFont: string,
  memberName: string,
  avatarColorHex: string,
  startX: number,
  baselineY: number,
  options?: {
    radiusMm?: number;
    fontSize?: number;
    fontStyle?: 'normal' | 'bold';
    textColor?: RGB;
    maxWidth?: number;
  }
): number {
  const radius = options?.radiusMm ?? 1.9;
  const fontSize = options?.fontSize ?? 7.8;
  const fontStyle = options?.fontStyle ?? 'bold';
  const textColor = options?.textColor ?? COLOR_INK;

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

  const textX = startX + radius * 2 + 1.3;
  doc.setFont(activeFont, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(textColor[0], textColor[1], textColor[2]);

  const availTextW =
    typeof options?.maxWidth === 'number'
      ? Math.max(6, options.maxWidth - (radius * 2 + 1.3))
      : 100;
  const displayName = fitText(doc, memberName, availTextW);
  doc.text(displayName, textX, baselineY);

  return textX + doc.getTextWidth(displayName);
}

/**
 * Vẽ cặp `[Avatar] Người chuyển → [Avatar] Người nhận` sử dụng ký tự Unicode `→`
 */
export function drawTransferPairWithAvatars(
  doc: jsPDF,
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
    fromColor?: RGB;
    arrowColor?: RGB;
    toColor?: RGB;
    maxTotalWidth?: number;
  }
): number {
  const radius = options?.radiusMm ?? 1.8;
  const fontSize = options?.fontSize ?? 7.8;
  const fromColor = options?.fromColor ?? COLOR_ROSE_DARK;
  const arrowColor = options?.arrowColor ?? COLOR_MUTED;
  const toColor = options?.toColor ?? COLOR_TEAL_DARK;

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(fontSize);
  const arrowStr = '  →  ';
  const arrowW = doc.getTextWidth(arrowStr);
  const eachMaxW =
    typeof options?.maxTotalWidth === 'number'
      ? Math.max(14, (options.maxTotalWidth - arrowW) / 2)
      : undefined;

  const afterFromX = drawMemberAvatarAndName(
    doc,
    activeFont,
    fromName,
    fromAvatarHex,
    startX,
    baselineY,
    {
      radiusMm: radius,
      fontSize,
      fontStyle: 'bold',
      textColor: fromColor,
      maxWidth: eachMaxW,
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
    maxWidth: eachMaxW,
  });
}

export interface MemberCardGridMetrics {
  marginX: number;
  fullWidth: number;
  gap: number;
  colWidth: number;
  cardHeight: number;
  leftColX: number;
  rightColX: number;
  radius: number;
}

/**
 * Tính toán lưới 2 cột cho Phụ lục thẻ cá nhân (~89.4 x 45.5mm mỗi thẻ, 5 hàng = 10 người vừa 1 trang)
 */
export function computeMemberCardGrid(
  pageWidth = 210,
  marginX = MARGIN_X,
  gap = GRID_GAP
): MemberCardGridMetrics {
  const fullWidth = pageWidth - marginX * 2 || CONTENT_WIDTH;
  const colWidth = (fullWidth - gap) / 2;
  return {
    marginX,
    fullWidth,
    gap,
    colWidth,
    cardHeight: 45.5,
    leftColX: marginX,
    rightColX: marginX + colWidth + gap,
    radius: CARD_RADIUS,
  };
}
