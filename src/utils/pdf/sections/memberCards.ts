import type { jsPDF } from 'jspdf';
import { formatVND } from '../../format';
import { drawLucideIcon } from '../../pdfLucideIcons';
import type { ExpenseReportData, MemberCardData } from '../../pdfReportData';
import {
  computeMemberCardGrid,
  drawMemberAvatarAndName,
  fitText,
} from '../primitives';
import {
  CARD_RADIUS,
  COLOR_BORDER,
  COLOR_INK,
  COLOR_MUTED,
  COLOR_ROSE_BORDER,
  COLOR_ROSE_DARK,
  COLOR_ROSE_SOFT,
  COLOR_SLATE,
  COLOR_SURFACE_MUTED,
  COLOR_TEAL_BORDER,
  COLOR_TEAL_DARK,
  COLOR_TEAL_SOFT,
  COLOR_TRACK,
  CONTENT_WIDTH,
  FONT_BODY,
  FONT_CAPTION,
  FONT_CARD_BALANCE,
  FONT_SECTION_TITLE,
  MARGIN_TOP,
  MARGIN_X,
  type RGB,
  SAFE_BOTTOM,
  resolveCategoryTheme,
} from '../theme';

function drawSingleMemberCard(
  doc: jsPDF,
  activeFont: string,
  card: MemberCardData,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const isPay = card.direction === 'pay';
  const isReceive = card.direction === 'receive';

  const borderColor: RGB = isPay
    ? COLOR_ROSE_BORDER
    : isReceive
      ? COLOR_TEAL_BORDER
      : COLOR_BORDER;
  const headerTint: RGB = isPay
    ? COLOR_ROSE_SOFT
    : isReceive
      ? COLOR_TEAL_SOFT
      : COLOR_SURFACE_MUTED;
  const primaryColor: RGB = isPay
    ? COLOR_ROSE_DARK
    : isReceive
      ? COLOR_TEAL_DARK
      : COLOR_SLATE;

  // Khung thẻ
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
  doc.setLineWidth(0.28);
  doc.roundedRect(x, y, width, height, CARD_RADIUS, CARD_RADIUS, 'FD');

  // Dải nền nhẹ ở phần đầu thẻ (cao 8.5mm)
  const topBandH = 8.5;
  doc.setFillColor(headerTint[0], headerTint[1], headerTint[2]);
  doc.roundedRect(
    x + 0.2,
    y + 0.2,
    width - 0.4,
    topBandH,
    CARD_RADIUS,
    CARD_RADIUS,
    'F'
  );
  doc.rect(x + 0.2, y + topBandH - CARD_RADIUS, width - 0.4, CARD_RADIUS, 'F');

  // 1. Hàng đầu: [Avatar] Tên thành viên (Trái) | Icon hướng (Phải)
  drawMemberAvatarAndName(
    doc,
    activeFont,
    card.memberName,
    card.avatarColor,
    x + 3.4,
    y + 5.6,
    {
      radiusMm: 2.15,
      fontSize: 8.6,
      fontStyle: 'bold',
      textColor: COLOR_INK,
      maxWidth: width - 16,
    }
  );

  const dirIconName = isPay
    ? 'ArrowUpRight'
    : isReceive
      ? 'ArrowDownLeft'
      : 'CheckCircle2';
  const dirIconBg: RGB = isPay
    ? [254, 205, 211]
    : isReceive
      ? [153, 246, 228]
      : [226, 232, 240];

  drawLucideIcon(
    doc,
    dirIconName,
    x + width - 5.6,
    y + 4.4,
    5.0,
    primaryColor,
    dirIconBg,
    'duotone-circle'
  );

  // 2. Số dư có dấu cỡ lớn (13,5pt đậm, giữ ₫)
  const sign = card.balance > 0 ? '+' : '';
  const balanceStr = `${sign}${formatVND(card.balance, false)} ₫`;
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(FONT_CARD_BALANCE);
  doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.text(balanceStr, x + 3.4, y + 15.0);

  // 3. Dòng hành động:
  // - Người cần chuyển: `→ [Avatar] Nhi` (nếu nhiều người nhận thì liệt kê)
  // - Người cần nhận: `Nhận từ N người`
  // - Đã cân bằng: `Đã cân bằng thu chi`
  const actionY = y + 21.0;
  if (isPay && card.payTo.length > 0) {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(FONT_BODY);
    doc.setTextColor(...COLOR_ROSE_DARK);
    doc.text('→', x + 3.4, actionY);
    const arrowW = doc.getTextWidth('→  ');
    let curX = x + 3.4 + arrowW;

    card.payTo.slice(0, 2).forEach((target, idx) => {
      if (idx > 0) {
        doc.setFont(activeFont, 'normal');
        doc.setFontSize(FONT_CAPTION);
        doc.setTextColor(...COLOR_MUTED);
        doc.text(', ', curX, actionY);
        curX += doc.getTextWidth(', ');
      }
      const nextX = drawMemberAvatarAndName(
        doc,
        activeFont,
        target.toName,
        target.toAvatarColor,
        curX,
        actionY,
        {
          radiusMm: 1.65,
          fontSize: FONT_BODY,
          fontStyle: 'bold',
          textColor: COLOR_INK,
          maxWidth: card.payTo.length === 1 ? width - 16 : 26,
        }
      );
      curX = nextX;
      if (card.payTo.length > 1) {
        const amtPart = ` (${formatVND(target.amount, false)})`;
        doc.setFont(activeFont, 'normal');
        doc.setFontSize(FONT_CAPTION);
        doc.setTextColor(...COLOR_SLATE);
        doc.text(amtPart, curX, actionY);
        curX += doc.getTextWidth(amtPart);
      }
    });
  } else if (isReceive) {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(FONT_BODY);
    doc.setTextColor(...COLOR_TEAL_DARK);
    doc.text(`Nhận từ ${card.receiveFromCount} người`, x + 3.4, actionY);
  } else {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(FONT_BODY);
    doc.setTextColor(...COLOR_MUTED);
    doc.text('Đã cân bằng thu chi', x + 3.4, actionY);
  }

  // Đường kẻ phân tách mỏng
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.18);
  doc.line(x + 3.4, y + 23.8, x + width - 3.4, y + 23.8);

  // 4. Ba chỉ số nhỏ: `Đã chi`, `Phải chịu`, và `Đã chuyển` chỉ khi `netTransfer !== 0`
  const hasNetTransfer = card.netTransfer !== 0;
  const metricCols = hasNetTransfer
    ? [
        { label: 'Đã chi', value: formatVND(card.paidExpense, false) },
        { label: 'Phải chịu', value: formatVND(card.owedExpense, false) },
        {
          label: card.netTransfer > 0 ? 'Đã chuyển' : 'Đã nhận trước',
          value: `${card.netTransfer > 0 ? '+' : ''}${formatVND(card.netTransfer, false)}`,
        },
      ]
    : [
        { label: 'Đã chi', value: formatVND(card.paidExpense, false) },
        { label: 'Phải chịu', value: formatVND(card.owedExpense, false) },
      ];

  const innerW = width - 6.8;
  const metricColW = innerW / metricCols.length;
  metricCols.forEach((m, idx) => {
    const mx = x + 3.4 + idx * metricColW;
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(FONT_CAPTION);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(m.label, mx, y + 27.6);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_INK);
    doc.text(fitText(doc, m.value, metricColW - 1.5), mx, y + 31.6);
  });

  // 5. Thanh stacked mỏng 100% thể hiện "Phải chịu theo hạng mục"
  const barLabelY = y + 36.8;
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(FONT_CAPTION);
  doc.setTextColor(...COLOR_MUTED);
  doc.text('Phải chịu theo hạng mục', x + 3.4, barLabelY);

  if (card.byCategory.length > 0) {
    const topCatsSummary = card.byCategory
      .slice(0, 2)
      .map((c) => `${c.categoryName} ${c.percentage}%`)
      .join(' • ');
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(FONT_CAPTION);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(
      fitText(doc, topCatsSummary, innerW - 36),
      x + width - 3.4,
      barLabelY,
      { align: 'right' }
    );
  }

  const barX = x + 3.4;
  const barY = y + 38.6;
  const barH = 2.6;
  doc.setFillColor(...COLOR_TRACK);
  doc.roundedRect(barX, barY, innerW, barH, 1.1, 1.1, 'F');

  if (card.byCategory.length > 0) {
    let segX = barX;
    card.byCategory.forEach((cat, idx) => {
      if (cat.percentage <= 0) return;
      const isLast = idx === card.byCategory.length - 1;
      const segW = isLast
        ? Math.max(0, barX + innerW - segX)
        : (innerW * cat.percentage) / 100;
      if (segW <= 0) return;

      const theme = resolveCategoryTheme(cat.categoryIcon);
      doc.setFillColor(theme.bar[0], theme.bar[1], theme.bar[2]);
      if (card.byCategory.length === 1) {
        doc.roundedRect(segX, barY, segW, barH, 1.1, 1.1, 'F');
      } else if (idx === 0) {
        doc.roundedRect(segX, barY, Math.min(innerW, segW + 1.0), barH, 1.1, 1.1, 'F');
      } else if (isLast) {
        doc.roundedRect(Math.max(barX, segX - 0.8), barY, segW + 0.8, barH, 1.1, 1.1, 'F');
      } else {
        doc.rect(segX, barY, segW, barH, 'F');
      }
      segX += segW;
    });
  }
}

function drawCategoryLegendBar(
  doc: jsPDF,
  activeFont: string,
  report: ExpenseReportData,
  y: number
): void {
  const legendCats =
    report.overview.byCategory.length > 0
      ? report.overview.byCategory.map((c) => ({
          name: c.categoryName,
          icon: c.categoryIcon,
        }))
      : [
          { name: 'Vé đi/về', icon: 'Plane' },
          { name: 'Ăn uống', icon: 'Utensils' },
          { name: 'Lưu trú', icon: 'Hotel' },
          { name: 'Di chuyển', icon: 'Car' },
          { name: 'Vé tham quan', icon: 'Ticket' },
          { name: 'Khác', icon: 'Package' },
        ];

  const boxH = 8.4;
  doc.setFillColor(...COLOR_SURFACE_MUTED);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN_X, y, CONTENT_WIDTH, boxH, 1.8, 1.8, 'FD');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(FONT_CAPTION);
  doc.setTextColor(...COLOR_SLATE);
  const prefixLabel = 'Chú giải hạng mục:';
  doc.text(prefixLabel, MARGIN_X + 3.2, y + 5.2);

  let curX = MARGIN_X + 3.2 + doc.getTextWidth(prefixLabel) + 3.6;
  const centerY = y + boxH / 2;

  for (const cat of legendCats) {
    const theme = resolveCategoryTheme(cat.icon);
    drawLucideIcon(
      doc,
      theme.lucideIcon,
      curX + 2.0,
      centerY,
      3.8,
      theme.stroke,
      theme.bg,
      'duotone-circle'
    );

    doc.setFillColor(theme.bar[0], theme.bar[1], theme.bar[2]);
    doc.roundedRect(curX + 4.5, centerY - 1.1, 2.2, 2.2, 0.5, 0.5, 'F');

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(FONT_CAPTION);
    doc.setTextColor(...COLOR_INK);
    doc.text(cat.name, curX + 7.4, y + 5.2);

    curX += 7.4 + doc.getTextWidth(cat.name) + 5.0;
  }
}

/**
 * Trang cuối: Phụ lục thẻ cá nhân (lưới 2 cột, ~89×46mm mỗi thẻ, <= 10 người vừa 1 trang).
 * Chú giải màu và icon hạng mục ghi 1 lần ở cuối trang.
 */
export function renderMemberCardsSection(
  doc: jsPDF,
  activeFont: string,
  report: ExpenseReportData
): void {
  if (report.memberCards.length === 0) return;

  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const grid = computeMemberCardGrid(pageWidth, MARGIN_X);

  let cursorY = MARGIN_TOP;

  // Tiêu đề trang phụ lục thẻ cá nhân
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(FONT_SECTION_TITLE + 0.6);
  doc.setTextColor(...COLOR_INK);
  doc.text('PHỤ LỤC QUYẾT TOÁN CÁ NHÂN', MARGIN_X, cursorY + 3.2);

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(FONT_CAPTION);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(
    `${report.memberCards.length} thành viên • Đối soát trực tiếp với khối quyết toán`,
    MARGIN_X + CONTENT_WIDTH,
    cursorY + 3.2,
    { align: 'right' }
  );

  cursorY += 6.2;

  const cards = report.memberCards;
  const totalRows = Math.ceil(cards.length / 2);

  for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
    if (cursorY + grid.cardHeight > pageHeight - SAFE_BOTTOM - 10) {
      drawCategoryLegendBar(doc, activeFont, report, cursorY + 0.5);
      doc.addPage();
      cursorY = MARGIN_TOP;
    }

    const leftCard = cards[rowIdx * 2];
    const rightCard = cards[rowIdx * 2 + 1];

    if (leftCard) {
      drawSingleMemberCard(
        doc,
        activeFont,
        leftCard,
        grid.leftColX,
        cursorY,
        grid.colWidth,
        grid.cardHeight
      );
    }

    if (rightCard) {
      drawSingleMemberCard(
        doc,
        activeFont,
        rightCard,
        grid.rightColX,
        cursorY,
        grid.colWidth,
        grid.cardHeight
      );
    }

    cursorY += grid.cardHeight + grid.gap;
  }

  // Vẽ thanh chú giải màu và icon hạng mục đúng 1 lần ở cuối trang
  const legendY = Math.min(cursorY + 0.6, pageHeight - SAFE_BOTTOM - 8.8);
  drawCategoryLegendBar(doc, activeFont, report, legendY);
}
