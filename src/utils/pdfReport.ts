import type { Category, ExpenseRecord, Member, TripConfig } from '../types';
import { formatShortDateVN, formatVND, getNowGMT7 } from './format';
import { calculateBalances } from './math';

export interface ExpenseReportRow {
  id: string;
  date: string;
  title: string;
  payerId: string;
  payerName: string;
  amount: number;
  amountFormatted: string;
  memberShare: number | null;
  memberShareFormatted: string | null;
  typeLabel: string;
  recordType: 'expense' | 'transfer';
}

export interface MemberReportSummary {
  memberId: string;
  memberName: string;
  paidExpense: number;
  owedExpense: number;
  sentTransfer: number;
  receivedTransfer: number;
  balance: number;
}

export interface ExpenseReportData {
  tripId: string;
  tripName: string;
  location: string;
  dateRangeLabel: string;
  generatedAt: string;
  filterMemberId: string;
  scopeLabel: string;
  rows: ExpenseReportRow[];
  totalExpenseAmount: number;
  totalTransferAmount: number;
  memberSummary: MemberReportSummary | null;
  suggestedFileName: string;
}

export function formatSpentAtReportVN(spentAt: string): string {
  if (!spentAt) return '';
  const clean = spentAt.trim();
  const datePart = clean.slice(0, 10);
  const timePart = clean.length >= 16 ? clean.slice(11, 16) : '';
  const shortDate = formatShortDateVN(datePart);
  return timePart ? `${shortDate} ${timePart}` : shortDate;
}

export function sanitizeFileNameSegment(input: string): string {
  return (input || 'report')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function buildExpenseReportData(params: {
  config: TripConfig;
  members: Member[];
  categories: Category[];
  expenses: ExpenseRecord[];
  filterMemberId: string; // 'all' hoặc member.id
}): ExpenseReportData {
  const { config, members, categories, expenses, filterMemberId } = params;
  const normalizedFilter = filterMemberId && filterMemberId !== 'all' ? filterMemberId : 'all';

  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  const categoryMap = new Map<string, Category>();
  for (const c of categories) {
    categoryMap.set(c.id, c);
  }

  const activeExpenses = expenses
    .filter((e) => !e.deleted)
    .filter((e) => {
      if (normalizedFilter === 'all') return true;
      const isPayer = e.payer === normalizedFilter;
      const share = Math.round(e.splits?.[normalizedFilter] || 0);
      return isPayer || share > 0;
    })
    .sort((a, b) => {
      const cmp = (a.spentAt || '').localeCompare(b.spentAt || '');
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });

  let totalExpenseAmount = 0;
  let totalTransferAmount = 0;

  const rows: ExpenseReportRow[] = activeExpenses.map((e) => {
    const cleanAmount = Math.round(e.amount || 0);
    if (e.type === 'transfer') {
      totalTransferAmount += cleanAmount;
    } else {
      totalExpenseAmount += cleanAmount;
    }

    const payerName = memberMap.get(e.payer)?.name || e.payer;
    const typeLabel =
      e.type === 'transfer'
        ? 'Chuyển trả'
        : categoryMap.get(e.categoryId)?.name || 'Khác';

    const memberShare =
      normalizedFilter === 'all'
        ? null
        : Math.round(e.splits?.[normalizedFilter] || 0);

    return {
      id: e.id,
      date: formatSpentAtReportVN(e.spentAt),
      title: e.title || (e.type === 'transfer' ? 'Chuyển khoản quyết toán' : 'Khoản chi'),
      payerId: e.payer,
      payerName,
      amount: cleanAmount,
      amountFormatted: formatVND(cleanAmount, false),
      memberShare,
      memberShareFormatted: memberShare !== null ? formatVND(memberShare, false) : null,
      typeLabel,
      recordType: e.type,
    };
  });

  let memberSummary: MemberReportSummary | null = null;
  let scopeLabel = 'Toàn bộ chuyến đi';

  if (normalizedFilter !== 'all') {
    const targetMember = memberMap.get(normalizedFilter);
    const memberName = targetMember?.name || normalizedFilter;
    scopeLabel = `Thành viên: ${memberName}`;

    const balances = calculateBalances(members, expenses);
    const foundBalance = balances.find((b) => b.memberId === normalizedFilter);

    memberSummary = {
      memberId: normalizedFilter,
      memberName,
      paidExpense: foundBalance?.paidExpense || 0,
      owedExpense: foundBalance?.owedExpense || 0,
      sentTransfer: foundBalance?.sentTransfer || 0,
      receivedTransfer: foundBalance?.receivedTransfer || 0,
      balance: foundBalance?.balance || 0,
    };
  }

  const tripSlug = sanitizeFileNameSegment(config.tripName || config.tripId || 'chuyen-di');
  const scopeSlug =
    normalizedFilter === 'all'
      ? 'all'
      : sanitizeFileNameSegment(memberSummary?.memberName || normalizedFilter);

  const dateRangeLabel =
    config.startDate && config.endDate
      ? `${formatShortDateVN(config.startDate)} - ${formatShortDateVN(config.endDate)}`
      : config.startDate
        ? formatShortDateVN(config.startDate)
        : '';

  return {
    tripId: config.tripId,
    tripName: config.tripName || 'Chuyến đi',
    location: config.location || '',
    dateRangeLabel,
    generatedAt: formatSpentAtReportVN(getNowGMT7(false)),
    filterMemberId: normalizedFilter,
    scopeLabel,
    rows,
    totalExpenseAmount,
    totalTransferAmount,
    memberSummary,
    suggestedFileName: `bao-cao-${tripSlug}-${scopeSlug}.pdf`,
  };
}

// ============================================================================
// CDN LOADER CHO JSPDF & JSPDF-AUTOTABLE + FONT ROBOTO UNICODE TIẾNG VIỆT
// ============================================================================

const JSPDF_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const AUTOTABLE_CDN_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
const ROBOTO_REGULAR_TTF_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf';
const ROBOTO_MEDIUM_TTF_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Medium.ttf';

let cachedRobotoRegularBase64: string | null = null;
let cachedRobotoMediumBase64: string | null = null;

function loadExternalScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Không thể tải thư viện: ${src}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => {
      reject(new Error(`Không thể tải thư viện từ CDN: ${src}`));
    };
    document.head.appendChild(script);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return window.btoa(binary);
}

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) {
    throw new Error(`Không thể tải font Unicode từ CDN (${res.status})`);
  }
  const buf = await res.arrayBuffer();
  return arrayBufferToBase64(buf);
}

async function ensureRobotoFontsLoaded(): Promise<{ regular: string; medium: string } | null> {
  try {
    if (!cachedRobotoRegularBase64 || !cachedRobotoMediumBase64) {
      const [reg, med] = await Promise.all([
        fetchFontBase64(ROBOTO_REGULAR_TTF_URL),
        fetchFontBase64(ROBOTO_MEDIUM_TTF_URL),
      ]);
      cachedRobotoRegularBase64 = reg;
      cachedRobotoMediumBase64 = med;
    }
    return {
      regular: cachedRobotoRegularBase64,
      medium: cachedRobotoMediumBase64,
    };
  } catch {
    return null;
  }
}

export async function exportExpenseReportPdf(report: ExpenseReportData): Promise<void> {
  await loadExternalScript(JSPDF_CDN_URL);
  await loadExternalScript(AUTOTABLE_CDN_URL);

  const win = window as unknown as {
    jspdf?: { jsPDF: new (options?: Record<string, unknown>) => any };
    jsPDF?: new (options?: Record<string, unknown>) => any;
  };

  const JsPDFConstructor = win.jspdf?.jsPDF || win.jsPDF;
  if (!JsPDFConstructor) {
    throw new Error('Không khởi tạo được thư viện jsPDF từ CDN.');
  }

  const doc = new JsPDFConstructor({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const fonts = await ensureRobotoFontsLoaded();
  let activeFont = 'helvetica';

  if (fonts) {
    doc.addFileToVFS('Roboto-Regular.ttf', fonts.regular);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Medium.ttf', fonts.medium);
    doc.addFont('Roboto-Medium.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto', 'normal');
    activeFont = 'Roboto';
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  let cursorY = 16;

  // Tiêu đề báo cáo
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text('BÁO CÁO CHI TIÊU CHUYẾN ĐI', marginX, cursorY);

  cursorY += 7;
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(13, 148, 136); // teal-600
  doc.text(report.tripName, marginX, cursorY);

  cursorY += 5.5;
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105); // slate-600

  const metaParts: string[] = [];
  if (report.location) metaParts.push(`Địa điểm: ${report.location}`);
  if (report.dateRangeLabel) metaParts.push(`Thời gian: ${report.dateRangeLabel}`);
  metaParts.push(`Xuất lúc: ${report.generatedAt}`);
  doc.text(metaParts.join('  •  '), marginX, cursorY);

  cursorY += 6;

  // Khung tóm tắt
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  const summaryBoxHeight = report.memberSummary ? 22 : 16;
  doc.roundedRect(marginX, cursorY, pageWidth - marginX * 2, summaryBoxHeight, 2, 2, 'FD');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Phạm vi: ${report.scopeLabel}`, marginX + 4, cursorY + 6);

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);

  if (report.memberSummary) {
    const ms = report.memberSummary;
    const balPrefix = ms.balance > 0 ? '+' : '';
    const line1 = `Số giao dịch liên quan: ${report.rows.length}   |   Đã chi: ${formatVND(ms.paidExpense, false)} đ   |   Phải chịu: ${formatVND(ms.owedExpense, false)} đ`;
    const line2 = `Chuyển trả ròng: ${formatVND(ms.sentTransfer - ms.receivedTransfer, false)} đ   |   Số dư cuối: ${balPrefix}${formatVND(ms.balance, false)} đ`;
    doc.text(line1, marginX + 4, cursorY + 12);
    doc.setFont(activeFont, 'bold');
    doc.text(line2, marginX + 4, cursorY + 17.5);
  } else {
    const summaryText = `Tổng số bản ghi: ${report.rows.length}   |   Tổng chi tiêu: ${formatVND(report.totalExpenseAmount, false)} đ   |   Tổng chuyển trả: ${formatVND(report.totalTransferAmount, false)} đ`;
    doc.text(summaryText, marginX + 4, cursorY + 12);
  }

  cursorY += summaryBoxHeight + 6;

  // Bảng chi tiết các khoản chi: Ngày, Tên, Người chi, Số tiền, Loại
  const tableHead = [['Ngày', 'Tên', 'Người chi', 'Số tiền (đ)', 'Loại']];
  const tableBody = report.rows.map((r) => [
    r.date,
    r.title,
    r.payerName,
    r.amountFormatted,
    r.typeLabel,
  ]);

  const autoTableFn = (doc as any).autoTable || (win as any).jspdf?.autoTable;
  if (typeof autoTableFn === 'function') {
    autoTableFn.call(doc, {
      startY: cursorY,
      head: tableHead,
      body:
        tableBody.length > 0
          ? tableBody
          : [['—', 'Chưa có khoản chi nào phù hợp bộ lọc', '—', '0', '—']],
      margin: { left: marginX, right: marginX },
      styles: {
        font: activeFont,
        fontSize: 9,
        cellPadding: 2.5,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [13, 148, 136], // brand teal
        textColor: [255, 255, 255],
        halign: 'left',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 32 }, // Ngày
        1: { cellWidth: 'auto' }, // Tên
        2: { cellWidth: 30 }, // Người chi
        3: { cellWidth: 30, halign: 'right' }, // Số tiền
        4: { cellWidth: 28 }, // Loại
      },
    });
  }

  doc.save(report.suggestedFileName);
}
