import { jsPDF } from 'jspdf';
import type { ExpenseReportData } from '../pdfReportData';
import { type PdfFontData, registerPlusJakartaFonts } from './fonts';
import { renderOverviewCharts } from './sections/charts';
import { stampPageFooters } from './sections/footer';
import { renderKpiRow } from './sections/kpi';
import { renderLedgerSection } from './sections/ledger';
import { renderMasthead } from './sections/masthead';
import { renderMemberCardsSection } from './sections/memberCards';
import { renderSettlementHero } from './sections/settlement';
import { MARGIN_TOP } from './theme';

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
    author: 'TdyTrip',
    creator: 'TdyTrip',
  });

  // ==========================================================================
  // TRANG 1: TỔNG QUAN & QUYẾT TOÁN TRỌNG TÂM ("AI CHUYỂN CHO AI" TRONG 5 GIÂY)
  // ==========================================================================
  let cursorY = renderMasthead(doc, activeFont, report, MARGIN_TOP);
  cursorY = renderKpiRow(doc, activeFont, report, cursorY);
  cursorY = renderSettlementHero(doc, activeFont, report, cursorY);
  renderOverviewCharts(doc, activeFont, report, cursorY);

  // ==========================================================================
  // TRANG 2+: SỔ CHI TIẾT GIAO DỊCH THEO NGÀY
  // ==========================================================================
  if (includeLedger) {
    renderLedgerSection(doc, activeFont, report);
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
