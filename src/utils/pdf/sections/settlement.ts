import type { jsPDF } from 'jspdf';
import { formatVND } from '../../format';
import { drawLucideIcon } from '../../pdfLucideIcons';
import type { ExpenseReportData } from '../../pdfReportData';
import { drawMemberAvatarAndName, ensurePageSpace, fitText } from '../primitives';
import {
  CARD_RADIUS,
  COLOR_INK,
  COLOR_MUTED,
  COLOR_ROSE,
  COLOR_ROSE_DARK,
  COLOR_SLATE,
  COLOR_TEAL_BORDER,
  COLOR_TEAL_DARK,
  COLOR_TEAL_SOFT,
  COLOR_TRACK,
  CONTENT_WIDTH,
  FONT_BODY,
  FONT_CAPTION,
  GRID_GAP,
  MARGIN_X,
} from '../theme';

/**
 * Trang 1 - Mục 3: Khối quyết toán (Hero), nhóm theo người nhận:
 * - Mỗi thẻ: `[Avatar] Nhi` + `Nhận 14.076.877 ₫` + STK in một lần (`VTB • 0375090782`).
 * - Dưới đó, mỗi người chuyển một dòng: `[Avatar] Tên ───── số tiền`, thanh ngang tỉ lệ theo số tiền.
 * - Nếu có chuyển trả đã ghi nhận: ghi chú nhỏ ở tiêu đề thẻ `đã trừ X đã chuyển`.
 * - Nếu không có công nợ: một pill `✓ Tất cả đã cân bằng`.
 */
export function renderSettlementHero(
  doc: jsPDF,
  activeFont: string,
  report: ExpenseReportData,
  cursorY: number
): number {
  let y = cursorY;
  const groups = report.settlementGroups;

  if (groups.length === 0) {
    const emptyH = 14.0;
    y = ensurePageSpace(doc, y, emptyH + GRID_GAP);

    doc.setFillColor(...COLOR_TEAL_SOFT);
    doc.setDrawColor(...COLOR_TEAL_BORDER);
    doc.setLineWidth(0.28);
    doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, emptyH, CARD_RADIUS, CARD_RADIUS, 'FD');

    const pillW = 64;
    const pillH = 7.6;
    const pillX = MARGIN_X + (CONTENT_WIDTH - pillW) / 2;
    const pillY = y + (emptyH - pillH) / 2;

    doc.setFillColor(209, 250, 229);
    doc.roundedRect(pillX, pillY, pillW, pillH, 3.8, 3.8, 'F');

    drawLucideIcon(
      doc,
      'CheckCircle2',
      pillX + 6.5,
      pillY + pillH / 2,
      4.4,
      COLOR_TEAL_DARK,
      undefined,
      'plain'
    );

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(...COLOR_TEAL_DARK);
    doc.text('✓ Tất cả đã cân bằng', pillX + 10.5, pillY + 5.1);

    return y + emptyH + GRID_GAP;
  }

  for (const grp of groups) {
    const headerH = 10.2;
    const rowH = 7.0;
    const bodyPadBottom = 2.0;
    const cardH = headerH + grp.senders.length * rowH + bodyPadBottom;

    y = ensurePageSpace(doc, y, cardH + GRID_GAP);

    // Khung thẻ người nhận
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COLOR_TEAL_BORDER);
    doc.setLineWidth(0.32);
    doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, cardH, CARD_RADIUS, CARD_RADIUS, 'FD');

    // Nền Header thẻ người nhận
    doc.setFillColor(...COLOR_TEAL_SOFT);
    doc.roundedRect(
      MARGIN_X + 0.2,
      y + 0.2,
      CONTENT_WIDTH - 0.4,
      headerH - 0.2,
      CARD_RADIUS,
      CARD_RADIUS,
      'F'
    );
    doc.rect(
      MARGIN_X + 0.2,
      y + headerH - CARD_RADIUS,
      CONTENT_WIDTH - 0.4,
      CARD_RADIUS,
      'F'
    );

    doc.setDrawColor(...COLOR_TEAL_BORDER);
    doc.setLineWidth(0.22);
    doc.line(MARGIN_X + 0.2, y + headerH, MARGIN_X + CONTENT_WIDTH - 0.2, y + headerH);

    // Bên trái Header: [Avatar] Tên người nhận + Nhận X ₫ (+ ghi chú đã trừ chuyển trả nếu có)
    const headerBaselineY = y + 6.5;
    const afterRecipientX = drawMemberAvatarAndName(
      doc,
      activeFont,
      grp.toName,
      grp.toAvatarColor,
      MARGIN_X + 3.8,
      headerBaselineY,
      {
        radiusMm: 2.35,
        fontSize: 9.2,
        fontStyle: 'bold',
        textColor: COLOR_INK,
        maxWidth: 42,
      }
    );

    const receiveBadgeX = afterRecipientX + 3.0;
    const receiveAmountStr = `Nhận ${formatVND(grp.total, false)} ₫`;
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(10.8);
    doc.setTextColor(...COLOR_TEAL_DARK);
    doc.text(receiveAmountStr, receiveBadgeX, headerBaselineY + 0.2);

    const afterReceiveBadgeX = receiveBadgeX + doc.getTextWidth(receiveAmountStr);

    const transferDeduction =
      grp.receivedTransferAmount > 0
        ? grp.receivedTransferAmount
        : report.overview.totalTransferAmount;

    if (transferDeduction > 0) {
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(FONT_CAPTION);
      doc.setTextColor(...COLOR_SLATE);
      const noteStr = `(đã trừ ${formatVND(transferDeduction, false)} đã chuyển)`;
      doc.text(noteStr, afterReceiveBadgeX + 2.4, headerBaselineY);
    }

    // Bên phải Header: STK in đúng 1 lần
    if (grp.bankInfo) {
      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(...COLOR_INK);
      const bankStr = fitText(doc, grp.bankInfo, 66);
      doc.text(bankStr, MARGIN_X + CONTENT_WIDTH - 4.0, headerBaselineY, {
        align: 'right',
      });
    }

    // Danh sách người chuyển bên dưới kèm thanh ngang tỉ lệ
    const maxSenderAmount = Math.max(1, ...grp.senders.map((s) => s.amount));
    const nameColW = 36;
    const amountColW = 28;
    const barStartX = MARGIN_X + 4.0 + nameColW;
    const barEndX = MARGIN_X + CONTENT_WIDTH - 4.0 - amountColW;
    const barTrackW = Math.max(20, barEndX - barStartX);

    grp.senders.forEach((sender, idx) => {
      const rowTopY = y + headerH + idx * rowH;
      const rowMidY = rowTopY + rowH / 2;
      const textBaselineY = rowMidY + 1.1;

      if (idx > 0) {
        doc.setDrawColor(241, 245, 249);
        doc.setLineWidth(0.16);
        doc.line(MARGIN_X + 3.8, rowTopY, MARGIN_X + CONTENT_WIDTH - 3.8, rowTopY);
      }

      // [Avatar] Tên người chuyển →
      const afterSenderX = drawMemberAvatarAndName(
        doc,
        activeFont,
        sender.fromName,
        sender.fromAvatarColor,
        MARGIN_X + 3.8,
        textBaselineY,
        {
          radiusMm: 1.9,
          fontSize: FONT_BODY,
          fontStyle: 'bold',
          textColor: COLOR_INK,
          maxWidth: nameColW - 6,
        }
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(FONT_BODY);
      doc.setTextColor(...COLOR_MUTED);
      doc.text('→', afterSenderX + 1.4, textBaselineY);

      // Thanh ngang tỉ lệ theo số tiền chuyển
      const barH = 2.1;
      const barY = rowMidY - barH / 2 + 0.15;
      doc.setFillColor(...COLOR_TRACK);
      doc.roundedRect(barStartX, barY, barTrackW, barH, 1.0, 1.0, 'F');

      const ratio = Math.max(0, Math.min(1, sender.amount / maxSenderAmount));
      const fillW = Math.max(sender.amount > 0 ? 3.0 : 0, barTrackW * ratio);
      if (fillW > 0) {
        doc.setFillColor(...COLOR_ROSE);
        doc.roundedRect(barStartX, barY, fillW, barH, 1.0, 1.0, 'F');
      }

      // Số tiền cần chuyển (căn phải, không lặp ₫)
      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8.2);
      doc.setTextColor(...COLOR_ROSE_DARK);
      doc.text(
        formatVND(sender.amount, false),
        MARGIN_X + CONTENT_WIDTH - 4.0,
        textBaselineY,
        { align: 'right' }
      );
    });

    y += cardH + GRID_GAP;
  }

  return y;
}
