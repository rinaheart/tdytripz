import type { jsPDF } from 'jspdf';
import { drawLucideIcon } from '../../pdfLucideIcons';
import type { ExpenseReportData } from '../../pdfReportData';
import { drawBannerBackground, fitText } from '../primitives';
import {
  CONTENT_WIDTH,
  FONT_BANNER_TITLE,
  FONT_CAPTION,
  GRID_GAP,
  MARGIN_TOP,
  MARGIN_X,
  deriveBannerPalette,
} from '../theme';

/**
 * Trang 1 - Mục 1: Banner (~19,5mm)
 * Hiển thị: `Địa điểm • Khoảng ngày • N người`, tên chuyến đi in hoa, giờ xuất.
 * Bỏ cụm "Báo cáo chi tiêu & quyết toán" (đã có ở footer).
 */
export function renderMasthead(
  doc: jsPDF,
  activeFont: string,
  report: ExpenseReportData,
  startY = MARGIN_TOP
): number {
  const x = MARGIN_X;
  const y = startY;
  const width = CONTENT_WIDTH;
  const bannerH = 19.5;

  const palette = deriveBannerPalette(report.accentColor);
  drawBannerBackground(doc, x, y, width, bannerH, palette);

  drawLucideIcon(
    doc,
    'Wallet',
    x + 9.4,
    y + bannerH / 2,
    10.2,
    [255, 255, 255],
    palette.badgeBg,
    'solid-badge'
  );

  const metaParts = [
    report.location,
    report.dateRangeLabel,
    `${report.overview.memberCount} người`,
  ].filter(Boolean);

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(8.0);
  doc.setTextColor(palette.subtitleText[0], palette.subtitleText[1], palette.subtitleText[2]);
  const exportedText = `Xuất: ${report.generatedAt}`;
  doc.setFontSize(FONT_CAPTION);
  const exportedW = doc.getTextWidth(exportedText);

  doc.setFontSize(8.0);
  const metaText = fitText(doc, metaParts.join(' • '), width - 24 - exportedW);
  doc.text(metaText, x + 18.0, y + 7.1);

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(FONT_CAPTION);
  doc.setTextColor(palette.subtitleText[0], palette.subtitleText[1], palette.subtitleText[2]);
  doc.text(exportedText, x + width - 4.2, y + 7.1, { align: 'right' });

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(FONT_BANNER_TITLE);
  doc.setTextColor(255, 255, 255);
  const titleText = fitText(doc, report.tripName.toUpperCase(), width - 22.5);
  doc.text(titleText, x + 18.0, y + 14.5);

  return y + bannerH + GRID_GAP;
}
