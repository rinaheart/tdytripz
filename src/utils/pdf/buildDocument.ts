import { jsPDF } from 'jspdf';
import type { ExpenseReportData } from '../pdfReportData';
import { type PdfFontData, registerPlusJakartaFonts } from './fonts';
import { renderOverviewCharts } from './sections/charts';
import { stampPageFooters } from './sections/footer';
import { renderKpiRow } from './sections/kpi';
import { estimateLedgerHeightMm, renderLedgerSection } from './sections/ledger';
import { renderMasthead } from './sections/masthead';
import { renderMemberCardsSection } from './sections/memberCards';
import { renderSettlementHero } from './sections/settlement';
import { MARGIN_TOP, PAGE_HEIGHT, SAFE_BOTTOM } from './theme';

export interface BuildPdfOptions {
  includeLedger?: boolean;
  includeMemberCards?: boolean;
}

/**
 * Xây dựng tài liệu jsPDF hoàn chỉnh (Hàm thuần túy, không thực hiện I/O mạng hay ổ đĩa).
 * Có thể gọi trực tiếp trong unit test để kiểm tra số trang và bố cục.
 */
export function buildPdfDocument(
  report: ExpenseReportData,
  fonts: PdfFontData,
  options?: BuildPdfOptions
): jsPDF {
  const includeLedger = options?.includeLedger ?? true;
  const includeMemberCards = options?.includeMemberCards ?? true;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const activeFont = registerPlusJakartaFonts(doc, fonts);

  doc.setProperties({
    title: `${report.tripName} - Báo cáo chi tiêu & quyết toán`,
    subject: `Báo cáo chuyến đi ${report.tripName} (${report.dateRangeLabel})`,
    author: 'TdyTripZ',
    creator: 'TdyTripZ',
  });

  // ==========================================================================
  // TRANG 1: TỔNG QUAN & QUYẾT TOÁN TRỌNG TÂM ("AI CHUYỂN CHO AI" TRONG 5 GIÂY)
  // ==========================================================================
  let cursorY = renderMasthead(doc, activeFont, report, MARGIN_TOP);
  cursorY = renderKpiRow(doc, activeFont, report, cursorY);
  cursorY = renderSettlementHero(doc, activeFont, report, cursorY);
  cursorY = renderOverviewCharts(doc, activeFont, report, cursorY);

  // ==========================================================================
  // SỔ CHI TIẾT GIAO DỊCH THEO NGÀY:
  // Nếu sổ chi tiết ngắn gọn và vừa trọn phần trống còn lại của Trang 1 thì ghép liền ngay dưới biểu đồ
  // để tránh trang 2 bị trống 80%; nếu dài hơn thì sang Trang 2 riêng biệt.
  // ==========================================================================
  if (includeLedger) {
    const remainingPage1Height = PAGE_HEIGHT - SAFE_BOTTOM - (cursorY + 1.5);
    const estLedgerHeight = estimateLedgerHeightMm(report);
    const fitsOnPage1 = doc.getNumberOfPages() === 1 && estLedgerHeight <= remainingPage1Height;
    renderLedgerSection(doc, activeFont, report, fitsOnPage1 ? cursorY + 1.5 : undefined);
  }

  // ==========================================================================
  // TRANG CUỐI: PHỤ LỤC THẺ CÁ NHÂN (LƯỚI 2 CỘT)
  // ==========================================================================
  if (includeMemberCards && report.memberCards.length > 0) {
    renderMemberCardsSection(doc, activeFont, report);
  }

  stampPageFooters(doc, activeFont, report);
  return doc;
}
