import type { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type RowInput } from 'jspdf-autotable';
import { formatVND } from '../../format';
import { drawLucideIcon } from '../../pdfLucideIcons';
import type { ExpenseReportData, ExpenseReportRow } from '../../pdfReportData';
import {
  drawMemberAvatarAndName,
  drawTransferPairWithAvatars,
  fitText,
  measureCol,
} from '../primitives';
import {
  COLOR_AMBER_BG,
  COLOR_AMBER_BORDER,
  COLOR_AMBER_TEXT,
  COLOR_BORDER,
  COLOR_INK,
  COLOR_ROSE_DARK,
  COLOR_SLATE,
  COLOR_TEAL_DARK,
  COLOR_TRANSFER_BG,
  COLOR_TRANSFER_TEXT,
  FONT_LEDGER,
  LEDGER_CELL_PADDING,
  MARGIN_TOP,
  MARGIN_X,
  SAFE_BOTTOM,
  resolveCategoryTheme,
} from '../theme';

type LedgerTableItem =
  | { type: 'group'; label: string; subtotal: number }
  | { type: 'row'; row: ExpenseReportRow };

/**
 * Trang 2 (và 3 nếu cần): Sổ chi tiết giao dịch
 * - Tiêu đề mục 1 dòng có icon: `Sổ chi tiết • {n} khoản` (9,4pt đậm).
 * - Nhóm theo ngày: `Thứ Năm 22/10 · Ngày 1` kèm tổng ngày bên phải. Các ngày trước chuyến gộp nhóm "Trước chuyến".
 * - 5 cột: `Giờ | Nội dung | Người chi | Chia | Số tiền`.
 * - Cỡ chữ 7,6pt, cellPadding tinh gọn để 42 dòng + tiêu đề mục vừa trọn 1 trang.
 * - Dòng `transfer`: nền tím nhạt, nội dung là cặp `[Avatar] A → [Avatar] B`.
 * - Cột `Chia`: hiện pill hổ phách `Chia riêng` khi `isCustomSplit === true`.
 */
export function estimateLedgerHeightMm(report: ExpenseReportData): number {
  const groupCount = report.ledger.length;
  const rowCount = report.ledger.reduce((sum, g) => sum + g.rows.length, 0);
  if (rowCount === 0) return 26;
  // Tiêu đề mục (5.0) + thead (6.5) + group headers (5.2/nhóm) + data rows (5.8/dòng) + tfoot (7.0) + đệm an toàn (4.0)
  return 5.0 + 6.5 + groupCount * 5.2 + rowCount * 5.8 + 7.0 + 4.0;
}

export function renderLedgerSection(
  doc: jsPDF,
  activeFont: string,
  report: ExpenseReportData,
  inlineStartY?: number
): void {
  let cursorY: number;
  if (typeof inlineStartY === 'number') {
    cursorY = inlineStartY;
  } else {
    doc.addPage();
    cursorY = MARGIN_TOP;
  }

  // Tiêu đề mục 1 dòng có icon: "Sổ chi tiết • {n} khoản" (kèm số giao dịch chuyển trả nếu có)
  drawLucideIcon(
    doc,
    'Calculator',
    MARGIN_X + 2.2,
    cursorY + 2.1,
    4.2,
    [37, 99, 235],
    [219, 234, 254],
    'rounded-badge'
  );
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.4);
  doc.setTextColor(...COLOR_INK);
  const ledgerHeading =
    report.overview.transferCount > 0
      ? `Sổ chi tiết • ${report.overview.expenseCount} khoản chi • ${report.overview.transferCount} chuyển trả`
      : `Sổ chi tiết • ${report.overview.expenseCount} khoản`;
  doc.text(ledgerHeading, MARGIN_X + 5.4, cursorY + 3.3);
  cursorY += 5.0;

  // Đo kích thước cột Giờ và Số tiền theo mẫu rộng nhất (không đặt cứng theo mắt)
  const timeColWidth = measureCol(
    doc,
    '00/00 00:00',
    LEDGER_CELL_PADDING + 0.35,
    activeFont,
    'normal',
    FONT_LEDGER
  );
  const amountColWidth = measureCol(
    doc,
    '999.999.999',
    LEDGER_CELL_PADDING + 0.5,
    activeFont,
    'bold',
    FONT_LEDGER
  );
  const payerColWidth = 29.0;
  const splitColWidth = 34.0;

  const flatItems: LedgerTableItem[] = [];
  for (const grp of report.ledger) {
    flatItems.push({
      type: 'group',
      label: grp.label,
      subtotal: grp.subtotal,
    });
    for (const r of grp.rows) {
      flatItems.push({
        type: 'row',
        row: r,
      });
    }
  }

  const bodyRows: RowInput[] =
    flatItems.length > 0
      ? flatItems.map((item): RowInput => {
          if (item.type === 'group') {
            return [
              {
                content: item.label,
                colSpan: 4,
                styles: {
                  fillColor: [241, 245, 249],
                  textColor: COLOR_INK,
                  fontStyle: 'bold',
                  fontSize: FONT_LEDGER,
                  cellPadding: { top: 0.9, bottom: 0.9, left: 2.0, right: 1.5 },
                },
              },
              {
                content: item.subtotal > 0 ? formatVND(item.subtotal, false) : '—',
                styles: {
                  fillColor: [241, 245, 249],
                  textColor: COLOR_TEAL_DARK,
                  fontStyle: 'bold',
                  halign: 'right',
                  fontSize: FONT_LEDGER,
                  cellPadding: { top: 0.9, bottom: 0.9, left: 1.5, right: 1.5 },
                },
              },
            ];
          }

          const r = item.row;
          return [
            r.time,
            '', // Vẽ custom icon + tiêu đề / cặp chuyển khoản trong didDrawCell
            '', // Vẽ custom [Avatar] Tên người chi trong didDrawCell
            '', // Vẽ custom pill Chia riêng hoặc nhãn Chia trong didDrawCell
            r.amountFormatted,
          ];
        })
      : [['—', 'Chưa có giao dịch nào trong chuyến đi', '—', '—', '0']];

  autoTable(doc, {
    startY: cursorY,
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    head: [
      [
        'Giờ',
        'Nội dung',
        'Người chi',
        'Chia',
        { content: 'Số tiền', styles: { halign: 'right' } },
      ],
    ],
    body: bodyRows,
    foot:
      flatItems.length > 0
        ? [
            [
              {
                content:
                  report.overview.transferCount > 0
                    ? `TỔNG CHI TIÊU (${report.overview.expenseCount} khoản chi • Đã chuyển trả: ${formatVND(report.overview.totalTransferAmount, false)})`
                    : `TỔNG CHI TIÊU (${report.overview.expenseCount} khoản chi)`,
                colSpan: 4,
                styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_INK },
              },
              {
                content: formatVND(report.overview.totalExpenseAmount, false),
                styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
              },
            ],
          ]
        : undefined,
    margin: { top: MARGIN_TOP, left: MARGIN_X, right: MARGIN_X, bottom: SAFE_BOTTOM },
    styles: {
      font: activeFont,
      fontSize: FONT_LEDGER,
      cellPadding: 1.02,
      textColor: COLOR_INK,
      lineColor: COLOR_BORDER,
      lineWidth: 0.1,
      valign: 'middle',
      overflow: 'ellipsize',
    },
    headStyles: {
      font: activeFont,
      fontStyle: 'bold',
      fontSize: FONT_LEDGER,
      cellPadding: 1.15,
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      lineColor: [30, 41, 59],
      lineWidth: 0.12,
    },
    footStyles: {
      font: activeFont,
      fontStyle: 'bold',
      fontSize: FONT_LEDGER,
      cellPadding: 1.2,
      fillColor: [240, 253, 250],
      textColor: COLOR_TEAL_DARK,
      lineColor: [153, 246, 228],
      lineWidth: 0.18,
      halign: 'right',
    },
    columnStyles: {
      0: { cellWidth: timeColWidth, textColor: COLOR_SLATE },
      1: { cellWidth: 'auto' },
      2: { cellWidth: payerColWidth },
      3: { cellWidth: splitColWidth },
      4: { cellWidth: amountColWidth, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data: CellHookData) => {
      if (data.section !== 'body' || flatItems.length === 0) return;
      const item = flatItems[data.row.index];
      if (!item || item.type === 'group') return;

      const r = item.row;
      if (r.recordType === 'transfer') {
        data.cell.styles.fillColor = COLOR_TRANSFER_BG;
        if (data.column.index === 4) {
          data.cell.styles.textColor = COLOR_TRANSFER_TEXT;
        }
      } else if (data.row.index % 2 === 1) {
        data.cell.styles.fillColor = [250, 251, 253];
      }
    },
    didDrawCell: (data: CellHookData) => {
      if (data.section !== 'body' || flatItems.length === 0) return;
      const item = flatItems[data.row.index];
      if (!item || item.type === 'group') return;

      const r = item.row;
      const cellX = data.cell.x;
      const cellY = data.cell.y;
      const cellW = data.cell.width;
      const cellH = data.cell.height;
      const padLeft = data.cell.padding('left');
      const padRight = data.cell.padding('right');
      const midY = cellY + cellH / 2;
      const baselineY = midY + 0.9;

      // Cột 1: Nội dung (kèm icon hạng mục hoặc cặp [Avatar] A → [Avatar] B cho transfer)
      if (data.column.index === 1) {
        if (r.recordType === 'transfer') {
          drawLucideIcon(
            doc,
            'ArrowRightLeft',
            cellX + padLeft + 1.9,
            midY,
            3.6,
            COLOR_TRANSFER_TEXT,
            [237, 233, 254],
            'duotone-circle'
          );
          drawTransferPairWithAvatars(
            doc,
            activeFont,
            r.payerName,
            r.payerAvatarColor,
            r.recipientName || '',
            r.recipientAvatarColor || '#0f766e',
            cellX + padLeft + 4.8,
            baselineY,
            {
              radiusMm: 1.55,
              fontSize: FONT_LEDGER,
              fromColor: COLOR_TRANSFER_TEXT,
              arrowColor: COLOR_TRANSFER_TEXT,
              toColor: COLOR_TEAL_DARK,
              maxTotalWidth: cellW - padLeft - padRight - 5.2,
            }
          );
        } else {
          const theme = resolveCategoryTheme(r.categoryIcon);
          const iconSize = 3.6;
          drawLucideIcon(
            doc,
            theme.lucideIcon,
            cellX + padLeft + iconSize / 2,
            midY,
            iconSize,
            theme.stroke,
            theme.bg,
            'duotone-circle'
          );

          const textStartX = cellX + padLeft + iconSize + 1.5;
          const availW = Math.max(10, cellW - padLeft - padRight - iconSize - 1.5);
          doc.setFont(activeFont, 'normal');
          doc.setFontSize(FONT_LEDGER);
          doc.setTextColor(...COLOR_INK);
          doc.text(fitText(doc, r.title, availW), textStartX, baselineY);
        }
      }

      // Cột 2: Người chi ([Avatar] Tên)
      if (data.column.index === 2) {
        drawMemberAvatarAndName(
          doc,
          activeFont,
          r.payerName,
          r.payerAvatarColor,
          cellX + padLeft,
          baselineY,
          {
            radiusMm: 1.55,
            fontSize: FONT_LEDGER,
            fontStyle: 'bold',
            textColor: COLOR_INK,
            maxWidth: cellW - padLeft - padRight,
          }
        );
      }

      // Cột 3: Chia (`Cả nhóm` / `Trừ <tên>` / danh sách tên / `N người` + pill `Chia riêng`)
      if (data.column.index === 3) {
        const availW = cellW - padLeft - padRight;
        if (r.recordType === 'transfer') {
          doc.setFont(activeFont, 'bold');
          doc.setFontSize(7.1);
          doc.setTextColor(...COLOR_TRANSFER_TEXT);
          doc.text('Chuyển trả', cellX + padLeft, baselineY);
        } else if (r.isCustomSplit && r.participants.kind === 'all') {
          const label = 'Chia riêng';
          doc.setFont(activeFont, 'bold');
          doc.setFontSize(6.8);
          const pillW = Math.min(availW, doc.getTextWidth(label) + 3.2);
          const pillH = 3.6;
          const pillX = cellX + padLeft;
          const pillY = midY - pillH / 2;

          doc.setFillColor(...COLOR_AMBER_BG);
          doc.setDrawColor(...COLOR_AMBER_BORDER);
          doc.setLineWidth(0.18);
          doc.roundedRect(pillX, pillY, pillW, pillH, 1.1, 1.1, 'FD');

          doc.setTextColor(...COLOR_AMBER_TEXT);
          doc.text(label, pillX + pillW / 2, midY + 0.8, { align: 'center' });
        } else {
          const isExcept = r.participants.kind === 'except';
          const pillLabel = 'Chia riêng';
          doc.setFont(activeFont, 'bold');
          doc.setFontSize(6.5);
          const pillW = r.isCustomSplit ? doc.getTextWidth(pillLabel) + 3.0 : 0;
          const textAvailW = r.isCustomSplit ? Math.max(10, availW - pillW - 2.2) : availW;

          doc.setFont(activeFont, isExcept ? 'bold' : 'normal');
          doc.setFontSize(7.3);
          doc.setTextColor(...(isExcept ? COLOR_ROSE_DARK : COLOR_SLATE));
          const drawnText = fitText(doc, r.participants.text, textAvailW);
          doc.text(r.isCustomSplit ? `${drawnText} ` : drawnText, cellX + padLeft, baselineY);

          if (r.isCustomSplit && pillW > 0) {
            const textW = doc.getTextWidth(drawnText);
            const pillX = cellX + padLeft + textW + 2.0;
            const pillH = 3.5;
            const pillY = midY - pillH / 2;

            doc.setFillColor(...COLOR_AMBER_BG);
            doc.setDrawColor(...COLOR_AMBER_BORDER);
            doc.setLineWidth(0.16);
            doc.roundedRect(pillX, pillY, pillW, pillH, 1.0, 1.0, 'FD');

            doc.setFont(activeFont, 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(...COLOR_AMBER_TEXT);
            doc.text(pillLabel, pillX + pillW / 2, midY + 0.75, { align: 'center' });
          }
        }
      }
    },
  });
}
