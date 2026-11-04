import type { jsPDF } from 'jspdf';
import { formatVND } from '../../format';
import { drawLucideIcon } from '../../pdfLucideIcons';
import type { ExpenseReportData } from '../../pdfReportData';
import { drawMemberAvatarAndName, ensurePageSpace, fitText } from '../primitives';
import {
  CARD_RADIUS,
  COLOR_INK,
  COLOR_SLATE,
  CONTENT_WIDTH,
  FONT_CAPTION,
  FONT_KPI_VALUE,
  GRID_GAP,
  MARGIN_X,
  type RGB,
} from '../theme';

/**
 * Trang 1 - Mục 2: Hàng 3 thẻ KPI:
 * 1. Tổng chi (`42 khoản • 3 ngày`)
 * 2. Bình quân/người (`N thành viên`)
 * 3. Ứng trước nhiều nhất (`[Avatar] Tên • 83%`)
 */
export function renderKpiRow(
  doc: jsPDF,
  activeFont: string,
  report: ExpenseReportData,
  cursorY: number
): number {
  const boxHeight = 19.2;
  const y = ensurePageSpace(doc, cursorY, boxHeight + GRID_GAP);
  const colWidth = (CONTENT_WIDTH - GRID_GAP * 2) / 3;
  const topPayer = report.overview.topPayer;

  const cards: Array<{
    label: string;
    value: string;
    subtext: string;
    iconName: string;
    accentColor: RGB;
    surfaceColor: RGB;
    borderColor: RGB;
    iconBgColor: RGB;
    valueColor: RGB;
    renderCustomSubtext?: (textLeftX: number, subBaselineY: number, availW: number) => void;
  }> = [
    {
      label: 'Tổng chi',
      value: `${formatVND(report.overview.totalExpenseAmount, false)} ₫`,
      subtext: `${report.overview.expenseCount} khoản • ${report.overview.tripDays} ngày`,
      iconName: 'Wallet',
      accentColor: [13, 128, 86],
      surfaceColor: [234, 249, 242],
      borderColor: [196, 236, 218],
      iconBgColor: [202, 240, 224],
      valueColor: [13, 124, 82],
    },
    {
      label: 'Bình quân/người',
      value: `${formatVND(report.overview.averagePerMember, false)} ₫`,
      subtext: `Chia đều ${report.overview.memberCount} người`,
      iconName: 'Users',
      accentColor: [26, 98, 232],
      surfaceColor: [235, 243, 254],
      borderColor: [198, 220, 250],
      iconBgColor: [204, 226, 255],
      valueColor: [15, 38, 84],
    },
    {
      label: 'Ứng trước nhiều nhất',
      value: topPayer ? `${formatVND(topPayer.paidExpense, false)} ₫` : '0 ₫',
      subtext: topPayer ? `${topPayer.memberName} • ${topPayer.percentage}%` : 'Chưa phát sinh',
      iconName: 'Award',
      accentColor: [118, 56, 218],
      surfaceColor: [244, 238, 255],
      borderColor: [221, 206, 252],
      iconBgColor: [233, 218, 255],
      valueColor: [109, 40, 217],
      renderCustomSubtext: topPayer
        ? (textLeftX, subBaselineY, availW) => {
            const pctSuffix = ` • ${topPayer.percentage}%`;
            doc.setFont(activeFont, 'bold');
            doc.setFontSize(FONT_CAPTION);
            const suffixW = doc.getTextWidth(pctSuffix);
            const afterNameX = drawMemberAvatarAndName(
              doc,
              activeFont,
              topPayer.memberName,
              topPayer.avatarColor,
              textLeftX,
              subBaselineY,
              {
                radiusMm: 1.65,
                fontSize: FONT_CAPTION,
                fontStyle: 'bold',
                textColor: COLOR_INK,
                maxWidth: Math.max(12, availW - suffixW),
              }
            );
            doc.setFont(activeFont, 'normal');
            doc.setFontSize(FONT_CAPTION);
            doc.setTextColor(...COLOR_SLATE);
            doc.text(pctSuffix, afterNameX, subBaselineY);
          }
        : undefined,
    },
  ];

  cards.forEach((card, idx) => {
    const x = MARGIN_X + idx * (colWidth + GRID_GAP);

    doc.setFillColor(card.surfaceColor[0], card.surfaceColor[1], card.surfaceColor[2]);
    doc.setDrawColor(card.borderColor[0], card.borderColor[1], card.borderColor[2]);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, y, colWidth, boxHeight, CARD_RADIUS, CARD_RADIUS, 'FD');

    drawLucideIcon(
      doc,
      card.iconName,
      x + 6.4,
      y + boxHeight / 2,
      8.4,
      card.accentColor,
      card.iconBgColor,
      'duotone-circle'
    );

    const textLeftX = x + 12.2;
    const availW = colWidth - 13.8;

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(40, 54, 76);
    doc.text(fitText(doc, card.label, availW), textLeftX, y + 5.2);

    doc.setFont(activeFont, 'bold');
    let valFontSize = FONT_KPI_VALUE;
    doc.setFontSize(valFontSize);
    while (doc.getTextWidth(card.value) > availW && valFontSize > 9.0) {
      valFontSize -= 0.35;
      doc.setFontSize(valFontSize);
    }
    doc.setTextColor(card.valueColor[0], card.valueColor[1], card.valueColor[2]);
    doc.text(card.value, textLeftX, y + 11.4);

    if (card.renderCustomSubtext) {
      card.renderCustomSubtext(textLeftX, y + 16.2, availW);
    } else {
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(FONT_CAPTION);
      doc.setTextColor(...COLOR_SLATE);
      doc.text(fitText(doc, card.subtext, availW), textLeftX, y + 16.2);
    }
  });

  return y + boxHeight + GRID_GAP;
}
