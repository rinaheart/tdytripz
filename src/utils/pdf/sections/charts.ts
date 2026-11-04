import type { jsPDF } from 'jspdf';
import { formatVND } from '../../format';
import { drawLucideIcon } from '../../pdfLucideIcons';
import type { ExpenseReportData } from '../../pdfReportData';
import { ensurePageSpace, fitText } from '../primitives';
import {
  CARD_RADIUS,
  COLOR_BORDER,
  COLOR_INK,
  COLOR_MUTED,
  COLOR_SURFACE_MUTED,
  COLOR_TRACK,
  CONTENT_WIDTH,
  DAY_BAR_PALETTE,
  FONT_CAPTION,
  FONT_SECTION_TITLE,
  GRID_GAP,
  MARGIN_X,
  type RGB,
  resolveCategoryTheme,
} from '../theme';

interface StatRowItem {
  label: string;
  count: number;
  amount: number;
  percentage: number;
  barColor: RGB;
  iconName?: string;
  iconStroke?: RGB;
  iconBg?: RGB;
}

function drawStatRow(
  doc: jsPDF,
  activeFont: string,
  rowX: number,
  rowY: number,
  rowWidth: number,
  item: StatRowItem
): void {
  const hasIcon = Boolean(item.iconName && item.iconStroke && item.iconBg);
  const badgeDiameter = 4.5;

  if (hasIcon && item.iconName && item.iconStroke && item.iconBg) {
    drawLucideIcon(
      doc,
      item.iconName,
      rowX + badgeDiameter / 2,
      rowY + 2.85,
      badgeDiameter,
      item.iconStroke,
      item.iconBg,
      'duotone-circle'
    );
  }

  const textStartX = hasIcon ? rowX + badgeDiameter + 1.8 : rowX;
  const rightEdgeX = rowX + rowWidth;
  const trackW = rowWidth - (textStartX - rowX);

  // 1. Số tiền in đậm sát lề phải (không lặp ₫)
  const amountStr = formatVND(item.amount, false);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(...COLOR_INK);
  doc.text(amountStr, rightEdgeX, rowY + 2.55, { align: 'right' });
  const amountW = doc.getTextWidth(amountStr);

  // 2. Phần trăm nguyên đứng trước số tiền (`49%  11.021.005`)
  const pctStr = `${item.percentage}%`;
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(FONT_CAPTION);
  doc.setTextColor(...COLOR_MUTED);
  const pctRightX = rightEdgeX - amountW - 2.0;
  doc.text(pctStr, pctRightX, rowY + 2.55, { align: 'right' });
  const pctW = doc.getTextWidth(pctStr);

  // 3. Nhãn bên trái (cắt bằng fitText)
  const maxLabelW = Math.max(16, pctRightX - pctW - textStartX - 2.2);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_INK);
  const labelWithCount = `${item.label} • ${item.count} khoản`;
  doc.text(fitText(doc, labelWithCount, maxLabelW), textStartX, rowY + 2.55);

  // 4. Thanh ngang tỉ lệ phía dưới
  const barY = rowY + 3.8;
  const barH = 1.9;
  doc.setFillColor(...COLOR_TRACK);
  doc.roundedRect(textStartX, barY, trackW, barH, 0.9, 0.9, 'F');

  const ratio = Math.max(0, Math.min(1, item.percentage / 100));
  const fillW = Math.max(item.amount > 0 ? 2.4 : 0, trackW * ratio);
  if (fillW > 0) {
    doc.setFillColor(item.barColor[0], item.barColor[1], item.barColor[2]);
    doc.roundedRect(textStartX, barY, fillW, barH, 0.9, 0.9, 'F');
  }
}

function drawChartCard(
  doc: jsPDF,
  activeFont: string,
  title: string,
  headerIcon: string,
  headerIconColor: RGB,
  headerIconBg: RGB,
  items: StatRowItem[],
  x: number,
  y: number,
  width: number,
  cardHeight: number
): void {
  const headerH = 8.2;
  const itemHeight = 7.4;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, cardHeight, CARD_RADIUS, CARD_RADIUS, 'FD');

  doc.setFillColor(...COLOR_SURFACE_MUTED);
  doc.roundedRect(
    x + 0.2,
    y + 0.2,
    width - 0.4,
    headerH - 0.2,
    CARD_RADIUS,
    CARD_RADIUS,
    'F'
  );
  doc.rect(x + 0.2, y + headerH - CARD_RADIUS, width - 0.4, CARD_RADIUS, 'F');

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
  doc.setFontSize(FONT_SECTION_TITLE);
  doc.setTextColor(...COLOR_INK);
  doc.text(title, x + 8.8, y + 5.3);

  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.2);
  doc.line(x + 2.5, y + headerH, x + width - 2.5, y + headerH);

  const visibleItems = items.slice(0, 6);
  if (visibleItems.length === 0) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('Chưa có dữ liệu', x + width / 2, y + headerH + (cardHeight - headerH) / 2, {
      align: 'center',
    });
    return;
  }

  let rowY = y + headerH + 1.2;
  for (const item of visibleItems) {
    drawStatRow(doc, activeFont, x + 3.2, rowY, width - 6.4, item);
    rowY += itemHeight;
  }
}

/**
 * Trang 1 - Mục 4: Hai biểu đồ cạnh nhau (`Theo danh mục` & `Theo ngày`).
 * - `Theo danh mục`: dùng tên rút gọn (`categoryName`) + icon hạng mục.
 * - `Theo ngày`: KHÔNG lặp lại icon lịch ở từng dòng.
 */
export function renderOverviewCharts(
  doc: jsPDF,
  activeFont: string,
  report: ExpenseReportData,
  cursorY: number
): number {
  const byCategory = report.overview.byCategory;
  const byDay = report.overview.byDay;

  const maxRows = Math.max(Math.min(6, byCategory.length), Math.min(6, byDay.length), 1);
  const sharedHeight = 8.2 + maxRows * 7.4 + 2.2;
  const y = ensurePageSpace(doc, cursorY, sharedHeight + GRID_GAP);
  const colW = (CONTENT_WIDTH - GRID_GAP) / 2;

  const categoryItems: StatRowItem[] = byCategory.map((c) => {
    const theme = resolveCategoryTheme(c.categoryIcon);
    return {
      label: c.categoryName,
      count: c.count,
      amount: c.amount,
      percentage: c.percentage,
      barColor: theme.bar,
      iconName: theme.lucideIcon,
      iconStroke: theme.stroke,
      iconBg: theme.bg,
    };
  });

  // "Theo ngày": không lặp icon lịch ở từng dòng
  const dayItems: StatRowItem[] = byDay.map((d, idx) => {
    const barColor = DAY_BAR_PALETTE[idx % DAY_BAR_PALETTE.length];
    return {
      label: d.label,
      count: d.count,
      amount: d.amount,
      percentage: d.percentage,
      barColor,
    };
  });

  drawChartCard(
    doc,
    activeFont,
    'Theo danh mục',
    'PieChart',
    [13, 148, 136],
    [204, 251, 241],
    categoryItems,
    MARGIN_X,
    y,
    colW,
    sharedHeight
  );

  drawChartCard(
    doc,
    activeFont,
    'Theo ngày',
    'Calendar',
    [37, 99, 235],
    [219, 234, 254],
    dayItems,
    MARGIN_X + colW + GRID_GAP,
    y,
    colW,
    sharedHeight
  );

  return y + sharedHeight + GRID_GAP;
}
