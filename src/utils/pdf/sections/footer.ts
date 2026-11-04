import type { jsPDF } from 'jspdf';
import type { ExpenseReportData } from '../../pdfReportData';
import { COLOR_BORDER, COLOR_MUTED, MARGIN_X } from '../theme';

/**
 * Đóng dấu Footer đồng nhất cho mọi trang:
 * Trái: `TdyTrip • {tripName} • Đơn vị: ₫`
 * Phải: `Trang {p} / {totalPages}`
 */
export function stampPageFooters(
  doc: jsPDF,
  activeFont: string,
  report: ExpenseReportData
): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.2);
    doc.line(MARGIN_X, pageHeight - 10.5, pageWidth - MARGIN_X, pageHeight - 10.5);

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(`TdyTrip • ${report.tripName} • Đơn vị: ₫`, MARGIN_X, pageHeight - 6.8);

    doc.setFont(activeFont, 'bold');
    doc.text(`Trang ${p} / ${totalPages}`, pageWidth - MARGIN_X, pageHeight - 6.8, {
      align: 'right',
    });
  }
}
