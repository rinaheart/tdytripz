import type { Category, ExpenseRecord, Member, TripConfig } from '../types';
import { formatShortDateVN, formatVND, getNowGMT7 } from './format';
import {
  calculateBalances,
  calculatePairwiseDebts,
  simplifyDebts,
  type DebtTransaction,
  type MemberBalance,
} from './math';

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
  compactTypeLabel: string;
  recordType: 'expense' | 'transfer';
  participantsSummary: string;
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

export interface ReportCategoryBreakdown {
  categoryId: string;
  categoryName: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface ReportDayBreakdown {
  dateKey: string;
  label: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface EnrichedMemberBalance extends MemberBalance {
  memberName: string;
  bankInfo: string;
}

export interface EnrichedDebtTransaction extends DebtTransaction {
  fromMemberName: string;
  toMemberName: string;
  toBankInfo: string;
}

export interface MemberAppendixData {
  memberId: string;
  memberName: string;
  bankInfo: string;
  paidExpense: number;
  owedExpense: number;
  sentTransfer: number;
  receivedTransfer: number;
  netTransfer: number;
  balance: number;
  finalSettlementActions: EnrichedDebtTransaction[];
  byCategory: ReportCategoryBreakdown[];
  paidRows: ExpenseReportRow[];
  participatedRows: ExpenseReportRow[];
}

export interface ExpenseReportOverview {
  totalExpenseAmount: number;
  totalTransferAmount: number;
  expenseCount: number;
  transferCount: number;
  memberCount: number;
  averagePerMember: number;
  byCategory: ReportCategoryBreakdown[];
  byDay: ReportDayBreakdown[];
}

export interface ExpenseReportSettlement {
  balances: EnrichedMemberBalance[];
  simplifiedDebts: EnrichedDebtTransaction[];
  pairwiseDebts: EnrichedDebtTransaction[];
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
  overview: ExpenseReportOverview;
  settlement: ExpenseReportSettlement;
  memberAppendices: MemberAppendixData[];
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

export function shortenCategoryLabelForTable(label: string): string {
  if (!label) return 'Khác';
  // Rút gọn phần giải thích trong ngoặc đơn cho cột bảng hẹp để không bị rớt dòng lẻ
  const withoutParens = label.replace(/\s*\([^)]*\)/g, '').trim();
  return withoutParens || label;
}

function formatMemberBankInfo(member?: Member): string {
  if (!member) return '';
  const parts: string[] = [];
  if (member.bankName) parts.push(member.bankName.trim());
  if (member.accountNo) parts.push(member.accountNo.trim());
  if (member.accountHolder) parts.push(`(${member.accountHolder.trim()})`);
  return parts.join(' • ');
}

function getEffectiveRecordAmount(record: ExpenseRecord): number {
  const splitSum = Object.values(record.splits || {}).reduce(
    (acc, val) => acc + Math.round(val || 0),
    0
  );
  return splitSum > 0 ? splitSum : Math.round(record.amount || 0);
}

function formatParticipantsSummary(
  record: ExpenseRecord,
  memberMap: Map<string, Member>
): string {
  const entries = Object.entries(record.splits || {}).filter(
    ([, val]) => Math.round(val || 0) > 0
  );
  if (entries.length === 0) return '—';

  const names = entries.map(([id]) => memberMap.get(id)?.name || id);
  if (record.type === 'transfer') {
    const payerName = memberMap.get(record.payer)?.name || record.payer;
    return `${payerName} -> ${names.join(', ')}`;
  }

  if (names.length <= 3) {
    return names.join(', ');
  }
  return `${names.length} người (${names.slice(0, 2).join(', ')}…)`;
}

function computeDayLabel(datePart: string, startDate?: string): string {
  if (!datePart || datePart.length < 10) return 'Chưa rõ ngày';
  const shortVN = formatShortDateVN(datePart);
  if (!startDate || startDate.length < 10) {
    return shortVN;
  }
  if (datePart < startDate) {
    return `Trước chuyến • ${shortVN}`;
  }
  const startMs = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  const curMs = Date.parse(`${datePart.slice(0, 10)}T00:00:00Z`);
  if (!Number.isNaN(startMs) && !Number.isNaN(curMs)) {
    const diffDays = Math.floor((curMs - startMs) / 86400000) + 1;
    if (diffDays >= 1 && diffDays <= 60) {
      return `Ngày ${diffDays} (${shortVN})`;
    }
  }
  return shortVN;
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

  const activeMembers = members.filter((m) => !m.deleted);
  const memberMap = new Map<string, Member>();
  for (const m of members) {
    memberMap.set(m.id, m);
  }

  const categoryMap = new Map<string, Category>();
  for (const c of categories) {
    categoryMap.set(c.id, c);
  }

  const allActiveRecords = expenses
    .filter((e) => !e.deleted)
    .sort((a, b) => {
      const cmp = (a.spentAt || '').localeCompare(b.spentAt || '');
      if (cmp !== 0) return cmp;
      return a.id.localeCompare(b.id);
    });

  // 1. Tính toán Overview cho toàn chuyến đi
  let fullExpenseTotal = 0;
  let fullTransferTotal = 0;
  let fullExpenseCount = 0;
  let fullTransferCount = 0;

  const catAgg = new Map<string, { name: string; amount: number; count: number }>();
  const dayAgg = new Map<string, { label: string; amount: number; count: number }>();

  for (const rec of allActiveRecords) {
    const effAmount = getEffectiveRecordAmount(rec);
    if (rec.type === 'transfer') {
      fullTransferTotal += effAmount;
      fullTransferCount += 1;
    } else {
      fullExpenseTotal += effAmount;
      fullExpenseCount += 1;

      const catId = rec.categoryId || 'cat_other';
      const catName = categoryMap.get(catId)?.name || 'Khác';
      const curCat = catAgg.get(catId) || { name: catName, amount: 0, count: 0 };
      curCat.amount += effAmount;
      curCat.count += 1;
      catAgg.set(catId, curCat);

      const dateKey = (rec.spentAt || '').trim().slice(0, 10) || 'unknown';
      const curDay = dayAgg.get(dateKey) || {
        label: computeDayLabel(dateKey, config.startDate),
        amount: 0,
        count: 0,
      };
      curDay.amount += effAmount;
      curDay.count += 1;
      dayAgg.set(dateKey, curDay);
    }
  }

  const byCategory: ReportCategoryBreakdown[] = Array.from(catAgg.entries())
    .map(([categoryId, item]) => ({
      categoryId,
      categoryName: item.name,
      amount: item.amount,
      count: item.count,
      percentage:
        fullExpenseTotal > 0 ? Math.round((item.amount / fullExpenseTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const byDay: ReportDayBreakdown[] = Array.from(dayAgg.entries())
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([dateKey, item]) => ({
      dateKey,
      label: item.label,
      amount: item.amount,
      count: item.count,
      percentage:
        fullExpenseTotal > 0 ? Math.round((item.amount / fullExpenseTotal) * 1000) / 10 : 0,
    }));

  const memberCount = activeMembers.length;
  const averagePerMember = memberCount > 0 ? Math.round(fullExpenseTotal / memberCount) : 0;

  // 2. Tính toán Chia tiền & Quyết toán (Settlement)
  const rawBalances = calculateBalances(activeMembers, allActiveRecords);
  const enrichedBalances: EnrichedMemberBalance[] = rawBalances.map((b) => {
    const m = memberMap.get(b.memberId);
    return {
      ...b,
      memberName: m?.name || b.memberId,
      bankInfo: formatMemberBankInfo(m),
    };
  });

  const enrichDebtList = (list: DebtTransaction[]): EnrichedDebtTransaction[] =>
    list.map((d) => {
      const fromM = memberMap.get(d.fromMemberId);
      const toM = memberMap.get(d.toMemberId);
      return {
        ...d,
        fromMemberName: fromM?.name || d.fromMemberId,
        toMemberName: toM?.name || d.toMemberId,
        toBankInfo: formatMemberBankInfo(toM),
      };
    });

  const simplifiedDebts = enrichDebtList(simplifyDebts(rawBalances));
  const pairwiseDebts = enrichDebtList(calculatePairwiseDebts(activeMembers, allActiveRecords));

  // Helper tạo ExpenseReportRow
  const toReportRow = (
    e: ExpenseRecord,
    targetMemberId: string | null
  ): ExpenseReportRow => {
    const cleanAmount = getEffectiveRecordAmount(e);
    const payerName = memberMap.get(e.payer)?.name || e.payer;
    const typeLabel =
      e.type === 'transfer' ? 'Chuyển trả' : categoryMap.get(e.categoryId)?.name || 'Khác';
    const compactTypeLabel =
      e.type === 'transfer' ? 'Chuyển trả' : shortenCategoryLabelForTable(typeLabel);
    const memberShare =
      targetMemberId === null ? null : Math.round(e.splits?.[targetMemberId] || 0);

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
      compactTypeLabel,
      recordType: e.type,
      participantsSummary: formatParticipantsSummary(e, memberMap),
    };
  };

  // 3. Xây dựng danh sách bản ghi theo bộ lọc chính
  const filteredRecords = allActiveRecords.filter((e) => {
    if (normalizedFilter === 'all') return true;
    const isPayer = e.payer === normalizedFilter;
    const share = Math.round(e.splits?.[normalizedFilter] || 0);
    return isPayer || share > 0;
  });

  let totalExpenseAmount = 0;
  let totalTransferAmount = 0;

  const rows: ExpenseReportRow[] = filteredRecords.map((e) => {
    const cleanAmount = getEffectiveRecordAmount(e);
    if (e.type === 'transfer') {
      totalTransferAmount += cleanAmount;
    } else {
      totalExpenseAmount += cleanAmount;
    }
    return toReportRow(e, normalizedFilter === 'all' ? null : normalizedFilter);
  });

  // 4. Xây dựng Phụ lục chi tiết từng thành viên (Member Appendices)
  const buildAppendixForMember = (m: Member): MemberAppendixData => {
    const bal = enrichedBalances.find((b) => b.memberId === m.id);
    const paidExpense = bal?.paidExpense || 0;
    const owedExpense = bal?.owedExpense || 0;
    const sentTransfer = bal?.sentTransfer || 0;
    const receivedTransfer = bal?.receivedTransfer || 0;
    const netTransfer = bal?.netTransfer || 0;
    const balance = bal?.balance || 0;

    const finalSettlementActions = simplifiedDebts.filter(
      (d) => d.fromMemberId === m.id || d.toMemberId === m.id
    );

    const paidRows = allActiveRecords
      .filter((e) => e.payer === m.id)
      .map((e) => toReportRow(e, m.id));

    const participatedRows = allActiveRecords
      .filter((e) => Math.round(e.splits?.[m.id] || 0) > 0)
      .map((e) => toReportRow(e, m.id));

    const personalCatMap = new Map<string, { name: string; amount: number; count: number }>();
    let personalTotalOwed = 0;

    for (const e of allActiveRecords) {
      if (e.type !== 'expense') continue;
      const myShare = Math.round(e.splits?.[m.id] || 0);
      if (myShare <= 0) continue;
      personalTotalOwed += myShare;
      const catId = e.categoryId || 'cat_other';
      const catName = categoryMap.get(catId)?.name || 'Khác';
      const cur = personalCatMap.get(catId) || { name: catName, amount: 0, count: 0 };
      cur.amount += myShare;
      cur.count += 1;
      personalCatMap.set(catId, cur);
    }

    const personalByCategory: ReportCategoryBreakdown[] = Array.from(personalCatMap.entries())
      .map(([categoryId, item]) => ({
        categoryId,
        categoryName: item.name,
        amount: item.amount,
        count: item.count,
        percentage:
          personalTotalOwed > 0
            ? Math.round((item.amount / personalTotalOwed) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      memberId: m.id,
      memberName: m.name,
      bankInfo: formatMemberBankInfo(m),
      paidExpense,
      owedExpense,
      sentTransfer,
      receivedTransfer,
      netTransfer,
      balance,
      finalSettlementActions,
      byCategory: personalByCategory,
      paidRows,
      participatedRows,
    };
  };

  const targetMembersForAppendix =
    normalizedFilter === 'all'
      ? activeMembers
      : activeMembers.filter((m) => m.id === normalizedFilter);

  const memberAppendices = targetMembersForAppendix.map(buildAppendixForMember);

  let memberSummary: MemberReportSummary | null = null;
  let scopeLabel = 'Toàn bộ chuyến đi';

  if (normalizedFilter !== 'all') {
    const targetMember = memberMap.get(normalizedFilter);
    const memberName = targetMember?.name || normalizedFilter;
    scopeLabel = `Thành viên: ${memberName}`;
    const foundBalance = enrichedBalances.find((b) => b.memberId === normalizedFilter);

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
    overview: {
      totalExpenseAmount: fullExpenseTotal,
      totalTransferAmount: fullTransferTotal,
      expenseCount: fullExpenseCount,
      transferCount: fullTransferCount,
      memberCount,
      averagePerMember,
      byCategory,
      byDay,
    },
    settlement: {
      balances: enrichedBalances,
      simplifiedDebts,
      pairwiseDebts,
    },
    memberAppendices,
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
      existing.addEventListener(
        'error',
        () => reject(new Error(`Không thể tải thư viện: ${src}`)),
        { once: true }
      );
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

// ============================================================================
// HỆ THỐNG MÀU SẮC & LAYOUT SWISS EDITORIAL (TINH GIẢN, SẴN SÀNG IN ẤN)
// ============================================================================

const COLOR_INK: [number, number, number] = [15, 23, 42]; // Slate 900
const COLOR_SLATE: [number, number, number] = [71, 85, 105]; // Slate 600
const COLOR_MUTED: [number, number, number] = [100, 116, 139]; // Slate 500
const COLOR_BORDER: [number, number, number] = [226, 232, 240]; // Slate 200
const COLOR_SURFACE: [number, number, number] = [248, 250, 252]; // Slate 50
const COLOR_TEAL: [number, number, number] = [13, 148, 136]; // Teal 600
const COLOR_TEAL_DARK: [number, number, number] = [15, 118, 110]; // Teal 700
const COLOR_ROSE: [number, number, number] = [190, 18, 60]; // Rose 700

// Bảng màu đơn sắc/hài hòa chuyên nghiệp khi in ấn (tránh cầu vồng lòe loẹt)
const EDITORIAL_BAR_PALETTE: Array<[number, number, number]> = [
  [13, 148, 136], // Teal 600 (Hạng mục lớn nhất)
  [15, 118, 110], // Teal 700
  [30, 64, 175], // Blue 800
  [51, 65, 85], // Slate 700
  [100, 116, 139], // Slate 500
  [148, 163, 184], // Slate 400
];

function ensurePageSpace(doc: any, cursorY: number, neededHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + neededHeight > pageHeight - 15) {
    doc.addPage();
    return 15;
  }
  return cursorY;
}

function drawExecutiveMasthead(
  doc: any,
  activeFont: string,
  report: ExpenseReportData,
  subtitleBadge: string,
  marginX: number,
  startY: number,
  pageWidth: number
): number {
  const fullW = pageWidth - marginX * 2;
  let y = startY;

  // Đường kẻ nhấn thương hiệu trên cùng (2 màu: Slate 900 + Teal 600)
  doc.setFillColor(...COLOR_INK);
  doc.rect(marginX, y, fullW * 0.72, 1.2, 'F');
  doc.setFillColor(...COLOR_TEAL);
  doc.rect(marginX + fullW * 0.72, y, fullW * 0.28, 1.2, 'F');
  y += 5.5;

  // Nhãn phân loại tài liệu
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_TEAL);
  doc.text(`TDYTRIP  •  ${subtitleBadge}`, marginX, y);

  // Thời gian xuất góc phải
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(`Xuất báo cáo: ${report.generatedAt}`, pageWidth - marginX, y, { align: 'right' });

  y += 6;

  // Tên chuyến đi lớn, sắc nét
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...COLOR_INK);
  doc.text(report.tripName.toUpperCase(), marginX, y);

  // Thông tin Địa điểm & Thời gian bên phải cùng hàng hoặc ngay dưới
  const metaRight: string[] = [];
  if (report.location) metaRight.push(report.location);
  if (report.dateRangeLabel) metaRight.push(report.dateRangeLabel);
  if (metaRight.length > 0) {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(metaRight.join('  •  '), pageWidth - marginX, y, { align: 'right' });
  }

  y += 3.5;
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.25);
  doc.line(marginX, y, pageWidth - marginX, y);

  return y + 4.5;
}

function drawSectionHeading(
  doc: any,
  activeFont: string,
  sectionCode: string,
  title: string,
  rightNote: string | null,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const y = ensurePageSpace(doc, cursorY, 12);

  // Pill đánh số thứ tự phần (ví dụ: 01, 02, 03)
  doc.setFillColor(...COLOR_INK);
  doc.roundedRect(marginX, y - 0.5, 7, 5, 1, 1, 'F');
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(sectionCode, marginX + 3.5, y + 3, { align: 'center' });

  // Tiêu đề phần
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...COLOR_INK);
  doc.text(title, marginX + 9.2, y + 3.2);

  // Ghi chú ngắn bên phải
  if (rightNote) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(rightNote, pageWidth - marginX, y + 3.2, { align: 'right' });
  }

  return y + 7.2;
}

function drawFourKpiRow(
  doc: any,
  activeFont: string,
  items: Array<{
    label: string;
    value: string;
    subtext?: string;
    accentColor?: [number, number, number];
    valueColor?: [number, number, number];
  }>,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const boxHeight = 16.5;
  const y = ensurePageSpace(doc, cursorY, boxHeight + 3);
  const gap = 3;
  const totalWidth = pageWidth - marginX * 2;
  const colWidth = (totalWidth - gap * 3) / 4;

  items.slice(0, 4).forEach((item, idx) => {
    const x = marginX + idx * (colWidth + gap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.22);
    doc.roundedRect(x, y, colWidth, boxHeight, 1.5, 1.5, 'FD');

    // Viền nhấn mảnh phía trên mỗi ô KPI
    const accent = item.accentColor || COLOR_INK;
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(x + 0.2, y + 0.2, colWidth - 0.4, 0.9, 'F');

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(item.label.toUpperCase(), x + 2.8, y + 4.8);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(9.8);
    const valColor = item.valueColor || COLOR_INK;
    doc.setTextColor(valColor[0], valColor[1], valColor[2]);
    doc.text(item.value, x + 2.8, y + 10.4);

    if (item.subtext) {
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...COLOR_SLATE);
      const cleanSub =
        item.subtext.length > 28 ? `${item.subtext.slice(0, 27)}…` : item.subtext;
      doc.text(cleanSub, x + 2.8, y + 14.4);
    }
  });

  return y + boxHeight + 4;
}

function drawCompactChartCard(
  doc: any,
  activeFont: string,
  title: string,
  items: Array<{ label: string; amount: number; count: number; percentage: number }>,
  x: number,
  y: number,
  width: number,
  fixedHeight?: number
): number {
  const maxItems = items.slice(0, 6);
  const itemHeight = 7.4;
  const headerH = 7.5;
  const cardH = fixedHeight || Math.max(24, headerH + maxItems.length * itemHeight + 2.5);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.22);
  doc.roundedRect(x, y, width, cardH, 1.5, 1.5, 'FD');

  // Tiêu đề biểu đồ
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...COLOR_INK);
  doc.text(title, x + 3.2, y + 5);

  doc.setDrawColor(241, 245, 249);
  doc.setLineWidth(0.2);
  doc.line(x + 3.2, y + 6.4, x + width - 3.2, y + 6.4);

  let rowY = y + headerH + 1.2;
  const trackW = width - 6.4;

  maxItems.forEach((item, idx) => {
    const color = EDITORIAL_BAR_PALETTE[idx % EDITORIAL_BAR_PALETTE.length];

    // Dòng 1: Nhãn đầy đủ bên trái + Số tiền & tỷ trọng bên phải (không bị cắt cụt ngày)
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...COLOR_SLATE);
    const cleanLabel =
      item.label.length > 32 ? `${item.label.slice(0, 31)}…` : item.label;
    doc.text(`${cleanLabel} (${item.count})`, x + 3.2, rowY + 2.6);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...COLOR_INK);
    doc.text(
      `${formatVND(item.amount, false)} đ (${item.percentage}%)`,
      x + width - 3.2,
      rowY + 2.6,
      { align: 'right' }
    );

    // Dòng 2: Thanh tiến độ mảnh tinh tế
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(x + 3.2, rowY + 3.8, trackW, 1.8, 0.7, 0.7, 'F');

    const ratio = Math.max(0, Math.min(1, item.percentage / 100));
    const fillW = Math.max(ratio > 0 ? 1.5 : 0, trackW * ratio);
    if (fillW > 0) {
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(x + 3.2, rowY + 3.8, fillW, 1.8, 0.7, 0.7, 'F');
    }

    rowY += itemHeight;
  });

  return y + cardH;
}

function drawSideBySideOverviewCharts(
  doc: any,
  activeFont: string,
  byCategory: ReportCategoryBreakdown[],
  byDay: ReportDayBreakdown[],
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const maxRows = Math.max(
    Math.min(6, byCategory.length),
    Math.min(6, byDay.length),
    1
  );
  const sharedHeight = 7.5 + maxRows * 7.4 + 2.5;
  const y = ensurePageSpace(doc, cursorY, sharedHeight + 4);

  const gap = 4;
  const fullW = pageWidth - marginX * 2;
  const colW = (fullW - gap) / 2;

  drawCompactChartCard(
    doc,
    activeFont,
    'Biểu đồ 1. Cơ cấu theo Danh mục',
    byCategory.map((c) => ({
      label: shortenCategoryLabelForTable(c.categoryName),
      amount: c.amount,
      count: c.count,
      percentage: c.percentage,
    })),
    marginX,
    y,
    colW,
    sharedHeight
  );

  drawCompactChartCard(
    doc,
    activeFont,
    'Biểu đồ 2. Tiến độ chi tiêu theo Ngày',
    byDay.map((d) => ({
      label: d.label,
      amount: d.amount,
      count: d.count,
      percentage: d.percentage,
    })),
    marginX + colW + gap,
    y,
    colW,
    sharedHeight
  );

  return y + sharedHeight + 4.5;
}

function drawMemberBalanceComparisonChart(
  doc: any,
  activeFont: string,
  balances: EnrichedMemberBalance[],
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  if (balances.length === 0) return cursorY;

  const rowHeight = 7.8;
  const headerHeight = 8;
  const totalBoxHeight = headerHeight + balances.length * rowHeight + 2.5;

  const y = ensurePageSpace(doc, cursorY, totalBoxHeight + 3);
  const fullWidth = pageWidth - marginX * 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.22);
  doc.roundedRect(marginX, y, fullWidth, totalBoxHeight, 1.5, 1.5, 'FD');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...COLOR_INK);
  doc.text('Tương quan Đã chi trả vs. Phần phải chịu theo Thành viên', marginX + 3.5, y + 5.2);

  // Chú thích (Legend) tinh gọn
  const legendRightX = marginX + fullWidth - 3.5;
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(7.2);

  doc.setFillColor(...COLOR_TEAL);
  doc.rect(legendRightX - 58, y + 2.7, 2.6, 2.6, 'F');
  doc.setTextColor(...COLOR_SLATE);
  doc.text('Đã chi trả', legendRightX - 54, y + 4.9);

  doc.setFillColor(148, 163, 184); // Slate 400 (thân thiện khi in trắng đen lẫn in màu)
  doc.rect(legendRightX - 28, y + 2.7, 2.6, 2.6, 'F');
  doc.text('Phải chịu', legendRightX - 24, y + 4.9);

  doc.setDrawColor(241, 245, 249);
  doc.setLineWidth(0.2);
  doc.line(marginX + 3.5, y + 6.8, marginX + fullWidth - 3.5, y + 6.8);

  const maxVal = Math.max(
    1,
    ...balances.map((b) => Math.max(b.paidExpense, b.owedExpense))
  );

  let rowY = y + headerHeight + 0.8;
  const nameColWidth = 30;
  const statusColWidth = 42;
  const barTrackX = marginX + 3.5 + nameColWidth;
  const barTrackWidth = fullWidth - 7 - nameColWidth - statusColWidth;

  balances.forEach((b) => {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_INK);
    const shortName = b.memberName.length > 16 ? `${b.memberName.slice(0, 15)}…` : b.memberName;
    doc.text(shortName, marginX + 3.5, rowY + 3.8);

    // Thanh 1: Đã chi (Teal 600)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 0.7, barTrackWidth, 2.1, 0.6, 0.6, 'F');
    const paidW = Math.max(
      b.paidExpense > 0 ? 1.2 : 0,
      (b.paidExpense / maxVal) * barTrackWidth
    );
    if (paidW > 0) {
      doc.setFillColor(...COLOR_TEAL);
      doc.roundedRect(barTrackX, rowY + 0.7, paidW, 2.1, 0.6, 0.6, 'F');
    }

    // Thanh 2: Phải chịu (Slate 400)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 3.5, barTrackWidth, 2.1, 0.6, 0.6, 'F');
    const owedW = Math.max(
      b.owedExpense > 0 ? 1.2 : 0,
      (b.owedExpense / maxVal) * barTrackWidth
    );
    if (owedW > 0) {
      doc.setFillColor(148, 163, 184);
      doc.roundedRect(barTrackX, rowY + 3.5, owedW, 2.1, 0.6, 0.6, 'F');
    }

    // Số dư cuối bên phải
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.8);
    let balLabel = '0 đ';
    if (b.balance > 0) {
      doc.setTextColor(...COLOR_TEAL_DARK);
      balLabel = `+${formatVND(b.balance, false)} đ`;
    } else if (b.balance < 0) {
      doc.setTextColor(...COLOR_ROSE);
      balLabel = `${formatVND(b.balance, false)} đ`;
    } else {
      doc.setTextColor(...COLOR_MUTED);
    }
    doc.text(balLabel, marginX + fullWidth - 3.5, rowY + 3.9, { align: 'right' });

    rowY += rowHeight;
  });

  return y + totalBoxHeight + 3.5;
}

function renderMemberAppendixSection(
  doc: any,
  autoTableFn: any,
  activeFont: string,
  report: ExpenseReportData,
  appendix: MemberAppendixData,
  badgeLabel: string,
  marginX: number,
  startCursorY: number,
  pageWidth: number
): number {
  let cursorY = startCursorY;
  const fullWidth = pageWidth - marginX * 2;

  // Masthead gọn cho trang Phụ lục cá nhân
  doc.setFillColor(...COLOR_INK);
  doc.rect(marginX, cursorY, fullWidth * 0.75, 0.9, 'F');
  doc.setFillColor(...COLOR_TEAL);
  doc.rect(marginX + fullWidth * 0.75, cursorY, fullWidth * 0.25, 0.9, 'F');
  cursorY += 4.5;

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_TEAL);
  doc.text(`${badgeLabel}  •  ${report.tripName.toUpperCase()}`, marginX, cursorY);

  if (appendix.bankInfo) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(`TK cá nhân: ${appendix.bankInfo}`, pageWidth - marginX, cursorY, {
      align: 'right',
    });
  }

  cursorY += 5.5;
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(13.5);
  doc.setTextColor(...COLOR_INK);
  doc.text(`THỐNG KÊ & QUYẾT TOÁN: ${appendix.memberName.toUpperCase()}`, marginX, cursorY);

  cursorY += 3;
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.2);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  cursorY += 3.5;

  // 4 ô KPI cá nhân
  const balanceColor: [number, number, number] =
    appendix.balance > 0
      ? COLOR_TEAL_DARK
      : appendix.balance < 0
        ? COLOR_ROSE
        : COLOR_SLATE;
  const balanceStatusText =
    appendix.balance > 0
      ? 'Được nhận lại cuối kỳ'
      : appendix.balance < 0
        ? 'Cần chuyển thanh toán'
        : 'Đã tất toán cân bằng';
  const balPrefix = appendix.balance > 0 ? '+' : '';

  const hasMemberTransfers =
    appendix.sentTransfer > 0 || appendix.receivedTransfer > 0;
  const shareRatioPct =
    report.overview.totalExpenseAmount > 0
      ? Math.round((appendix.paidExpense / report.overview.totalExpenseAmount) * 1000) / 10
      : 0;

  cursorY = drawFourKpiRow(
    doc,
    activeFont,
    [
      {
        label: 'Tổng đã đứng ra chi',
        value: `${formatVND(appendix.paidExpense, false)} đ`,
        subtext: `${appendix.paidRows.filter((r) => r.recordType === 'expense').length} khoản chi (${shareRatioPct}% tổng đoàn)`,
        accentColor: COLOR_TEAL,
        valueColor: COLOR_TEAL_DARK,
      },
      {
        label: 'Tổng phần phải chịu',
        value: `${formatVND(appendix.owedExpense, false)} đ`,
        subtext: `${appendix.participatedRows.filter((r) => r.recordType === 'expense').length} khoản tham gia thụ hưởng`,
        accentColor: COLOR_SLATE,
        valueColor: COLOR_INK,
      },
      hasMemberTransfers
        ? {
            label: 'Chuyển khoản ròng',
            value: `${formatVND(appendix.netTransfer, false)} đ`,
            subtext: `Chuyển ${formatVND(appendix.sentTransfer, false)} / Nhận ${formatVND(appendix.receivedTransfer, false)}`,
            accentColor: COLOR_SLATE,
            valueColor: COLOR_INK,
          }
        : {
            label: 'Số lệnh tất toán cuối',
            value: `${appendix.finalSettlementActions.length} giao dịch`,
            subtext:
              appendix.finalSettlementActions.length > 0
                ? 'Theo phương án tối ưu dòng tiền'
                : 'Không phát sinh giao dịch',
            accentColor: COLOR_SLATE,
            valueColor: COLOR_INK,
          },
      {
        label: 'Số dư quyết toán cuối',
        value: `${balPrefix}${formatVND(appendix.balance, false)} đ`,
        subtext: balanceStatusText,
        accentColor: balanceColor,
        valueColor: balanceColor,
      },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // Bố cục 2 cột song song:
  // - Cột trái: Khung Lệnh Thanh Toán Quyết Toán Cuối Cùng
  // - Cột phải: Biểu đồ cơ cấu chi tiêu thụ hưởng theo Danh mục của cá nhân
  const gap = 4;
  const leftColW = fullWidth * 0.48;
  const rightColW = fullWidth - leftColW - gap;

  const actions = appendix.finalSettlementActions;
  const catCount = Math.min(5, appendix.byCategory.length);
  const rightChartH = catCount > 0 ? 7.5 + catCount * 7.4 + 2.5 : 22;
  const leftMinH = Math.max(22, 10 + Math.max(1, actions.length) * 6);
  const blockH = Math.max(rightChartH, leftMinH);

  cursorY = ensurePageSpace(doc, cursorY, blockH + 4);

  // Vẽ Cột trái: Khung Kết luận Quyết toán của cá nhân
  doc.setFillColor(...COLOR_SURFACE);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.22);
  doc.roundedRect(marginX, cursorY, leftColW, blockH, 1.5, 1.5, 'FD');

  const leftBarColor =
    appendix.balance < 0
      ? COLOR_ROSE
      : appendix.balance > 0
        ? COLOR_TEAL_DARK
        : COLOR_SLATE;
  doc.setFillColor(...leftBarColor);
  doc.roundedRect(marginX, cursorY, 2.2, blockH, 1, 1, 'F');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...COLOR_INK);
  doc.text('LỆNH THANH TOÁN QUYẾT TOÁN CUỐI CÙNG', marginX + 5, cursorY + 5.2);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(marginX + 5, cursorY + 6.6, marginX + leftColW - 3.5, cursorY + 6.6);

  if (actions.length === 0) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(
      `${appendix.memberName} đã cân bằng công nợ, không cần chuyển hoặc nhận thêm.`,
      marginX + 5,
      cursorY + 12.5
    );
  } else {
    let actY = cursorY + 11.2;
    actions.forEach((act) => {
      const isSender = act.fromMemberId === appendix.memberId;
      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8);
      if (isSender) {
        doc.setTextColor(...COLOR_ROSE);
        doc.text(
          `• Chuyển cho ${act.toMemberName}: ${formatVND(act.amount, false)} đ`,
          marginX + 5,
          actY
        );
        if (act.toBankInfo) {
          actY += 3.8;
          doc.setFont(activeFont, 'normal');
          doc.setFontSize(7.2);
          doc.setTextColor(...COLOR_SLATE);
          doc.text(`   TK nhận: ${act.toBankInfo}`, marginX + 5, actY);
        }
      } else {
        doc.setTextColor(...COLOR_TEAL_DARK);
        doc.text(
          `• Nhận từ ${act.fromMemberName}: +${formatVND(act.amount, false)} đ`,
          marginX + 5,
          actY
        );
      }
      actY += 5.2;
    });
  }

  // Vẽ Cột phải: Biểu đồ cơ cấu chi tiêu cá nhân theo Danh mục
  if (appendix.byCategory.length > 0) {
    drawCompactChartCard(
      doc,
      activeFont,
      `Cơ cấu thụ hưởng của ${appendix.memberName} theo Danh mục`,
      appendix.byCategory.slice(0, 5).map((c) => ({
        label: shortenCategoryLabelForTable(c.categoryName),
        amount: c.amount,
        count: c.count,
        percentage: c.percentage,
      })),
      marginX + leftColW + gap,
      cursorY,
      rightColW,
      blockH
    );
  }

  cursorY += blockH + 4.5;

  // Bảng 1: Các khoản cá nhân đã trực tiếp chi trả / chuyển khoản
  cursorY = ensurePageSpace(doc, cursorY, 20);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...COLOR_INK);
  doc.text(
    `1. Các khoản ${appendix.memberName} đã trực tiếp đứng ra chi trả (${appendix.paidRows.length} mục)`,
    marginX,
    cursorY + 3
  );
  cursorY += 4.5;

  if (typeof autoTableFn === 'function') {
    const paidBody = appendix.paidRows.map((r, i) => [
      `${i + 1}`,
      r.date,
      r.title,
      r.participantsSummary,
      r.compactTypeLabel,
      r.amountFormatted,
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: [['#', 'Thời gian', 'Nội dung khoản chi', 'Phạm vi thụ hưởng', 'Hạng mục', 'Số tiền đã chi (đ)']],
      body:
        paidBody.length > 0
          ? paidBody
          : [['—', '—', `${appendix.memberName} không trực tiếp đứng ra trả khoản nào`, '—', '—', '0']],
      foot:
        paidBody.length > 0
          ? [
              [
                '',
                '',
                'Tổng cộng đã trực tiếp chi trả',
                '',
                '',
                formatVND(appendix.paidExpense, false),
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX, bottom: 15 },
      styles: {
        font: activeFont,
        fontSize: 7.8,
        cellPadding: 1.6,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [241, 245, 249],
        textColor: COLOR_INK,
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [248, 250, 252],
        textColor: COLOR_TEAL_DARK,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [252, 253, 254] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 27 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 38, textColor: COLOR_SLATE },
        4: { cellWidth: 25, textColor: COLOR_SLATE },
        5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 10) + 5;
  }

  // Bảng 2: Chi tiết các khoản cá nhân tham gia thụ hưởng
  cursorY = ensurePageSpace(doc, cursorY, 20);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...COLOR_INK);
  doc.text(
    `2. Chi tiết các khoản ${appendix.memberName} tham gia thụ hưởng (${appendix.participatedRows.length} mục)`,
    marginX,
    cursorY + 3
  );
  cursorY += 4.5;

  if (typeof autoTableFn === 'function') {
    const partBody = appendix.participatedRows.map((r, i) => [
      `${i + 1}`,
      r.date,
      r.title,
      r.payerName,
      r.compactTypeLabel,
      r.amountFormatted,
      r.memberShareFormatted || '0',
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: [
        [
          '#',
          'Thời gian',
          'Nội dung khoản chi',
          'Người trả',
          'Hạng mục',
          'Tổng hóa đơn (đ)',
          `Phần của ${appendix.memberName} (đ)`,
        ],
      ],
      body:
        partBody.length > 0
          ? partBody
          : [['—', '—', 'Chưa tham gia khoản chi nào', '—', '—', '0', '0']],
      foot:
        partBody.length > 0
          ? [
              [
                '',
                '',
                `Tổng phần chi phí phải chịu của ${appendix.memberName}`,
                '',
                '',
                '',
                formatVND(appendix.owedExpense, false),
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX, bottom: 15 },
      styles: {
        font: activeFont,
        fontSize: 7.8,
        cellPadding: 1.55,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [241, 245, 249],
        textColor: COLOR_INK,
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [248, 250, 252],
        textColor: COLOR_INK,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [252, 253, 254] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 27 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 21 },
        4: { cellWidth: 24, textColor: COLOR_SLATE },
        5: { cellWidth: 26, halign: 'right', textColor: COLOR_SLATE },
        6: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 10) + 5;
  }

  return cursorY;
}

function stampPageFooters(doc: any, activeFont: string, report: ExpenseReportData): void {
  const totalPages = doc.internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COLOR_BORDER);
    doc.setLineWidth(0.2);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      `TdyTrip  •  ${report.tripName}  •  Báo cáo quyết toán chính thức`,
      marginX,
      pageHeight - 7
    );
    doc.setFont(activeFont, 'bold');
    doc.text(`Trang ${p} / ${totalPages}`, pageWidth - marginX, pageHeight - 7, {
      align: 'right',
    });
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

  const autoTableFn = (doc as any).autoTable || (win as any).jspdf?.autoTable;
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;

  // Trường hợp lọc theo 1 thành viên cụ thể: Xuất báo cáo cá nhân chi tiết
  if (report.filterMemberId !== 'all' && report.memberAppendices.length > 0) {
    renderMemberAppendixSection(
      doc,
      autoTableFn,
      activeFont,
      report,
      report.memberAppendices[0],
      'BÁO CÁO QUYẾT TOÁN CÁ NHÂN',
      marginX,
      12,
      pageWidth
    );
    stampPageFooters(doc, activeFont, report);
    doc.save(report.suggestedFileName);
    return;
  }

  // ==========================================================================
  // TRANG 1: TỔNG QUAN CHUYẾN ĐI & PHƯƠNG ÁN QUYẾT TOÁN CUỐI CÙNG (EXECUTIVE SUMMARY)
  // ==========================================================================
  let cursorY = drawExecutiveMasthead(
    doc,
    activeFont,
    report,
    'BÁO CÁO TỔNG HỢP & QUYẾT TOÁN CHUYẾN ĐI',
    marginX,
    12,
    pageWidth
  );

  // PHẦN 01: TỔNG QUAN CHUYẾN ĐI
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '01',
    'TỔNG QUAN CHI TIÊU CHUYẾN ĐI',
    `${report.overview.memberCount} thành viên  •  ${report.overview.expenseCount} khoản chi tiêu`,
    marginX,
    cursorY,
    pageWidth
  );

  // Tìm hạng mục chi lớn nhất & người chi nhiều nhất để hiển thị thông tin đắt giá thay vì "0 đ"
  const topCat = report.overview.byCategory[0];
  const topPayer = [...report.settlement.balances].sort(
    (a, b) => b.paidExpense - a.paidExpense
  )[0];
  const topPayerPct =
    topPayer && report.overview.totalExpenseAmount > 0
      ? Math.round((topPayer.paidExpense / report.overview.totalExpenseAmount) * 1000) / 10
      : 0;

  cursorY = drawFourKpiRow(
    doc,
    activeFont,
    [
      {
        label: 'Tổng chi tiêu chuyến đi',
        value: `${formatVND(report.overview.totalExpenseAmount, false)} đ`,
        subtext: `${report.overview.expenseCount} khoản chi • ${report.overview.byDay.length} ngày`,
        accentColor: COLOR_TEAL,
        valueColor: COLOR_TEAL_DARK,
      },
      {
        label: 'Bình quân mỗi người',
        value: `${formatVND(report.overview.averagePerMember, false)} đ`,
        subtext: `Chia cho ${report.overview.memberCount} thành viên`,
        accentColor: COLOR_INK,
        valueColor: COLOR_INK,
      },
      {
        label: 'Hạng mục lớn nhất',
        value: topCat ? `${formatVND(topCat.amount, false)} đ` : '0 đ',
        subtext: topCat
          ? `${shortenCategoryLabelForTable(topCat.categoryName)} (${topCat.percentage}%)`
          : 'Chưa phát sinh',
        accentColor: COLOR_SLATE,
        valueColor: COLOR_INK,
      },
      report.overview.totalTransferAmount > 0
        ? {
            label: 'Đã chuyển trả nợ',
            value: `${formatVND(report.overview.totalTransferAmount, false)} đ`,
            subtext: `${report.overview.transferCount} giao dịch đã ghi nhận`,
            accentColor: COLOR_SLATE,
            valueColor: COLOR_INK,
          }
        : {
            label: 'Chi hộ nhiều nhất',
            value: topPayer ? `${formatVND(topPayer.paidExpense, false)} đ` : '0 đ',
            subtext: topPayer
              ? `${topPayer.memberName} (${topPayerPct}% tổng chi)`
              : 'Chưa phát sinh',
            accentColor: COLOR_SLATE,
            valueColor: COLOR_INK,
          },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // 2 Biểu đồ đặt song song 2 cột (Cơ cấu Danh mục & Tiến độ theo Ngày)
  cursorY = drawSideBySideOverviewCharts(
    doc,
    activeFont,
    report.overview.byCategory,
    report.overview.byDay,
    marginX,
    cursorY,
    pageWidth
  );

  // PHẦN 02: CHIA TIỀN & QUYẾT TOÁN CUỐI CÙNG
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '02',
    'CÂN ĐỐI THU CHI & LỆNH CHUYỂN KHOẢN QUYẾT TOÁN',
    `${report.settlement.simplifiedDebts.length} lệnh chuyển tối ưu dòng tiền`,
    marginX,
    cursorY,
    pageWidth
  );

  // Biểu đồ tương quan Đã chi vs. Phải chịu
  cursorY = drawMemberBalanceComparisonChart(
    doc,
    activeFont,
    report.settlement.balances,
    marginX,
    cursorY,
    pageWidth
  );

  const hasAnyTransfers = report.overview.totalTransferAmount > 0;

  // Bảng 2.1: Bảng cân đối tổng hợp từng thành viên (Ẩn cột Chuyển trả ròng nếu cả chuyến = 0 để bảng thoáng & tinh gọn)
  if (typeof autoTableFn === 'function') {
    const balanceHead = hasAnyTransfers
      ? [['Thành viên', 'Đã đứng ra chi (đ)', 'Phần phải chịu (đ)', 'Chuyển trả ròng (đ)', 'Số dư cuối (đ)', 'Trạng thái']]
      : [['Thành viên', 'Đã đứng ra chi (đ)', 'Phần phải chịu (đ)', 'Số dư quyết toán cuối (đ)', 'Trạng thái quyết toán']];

    const balanceRows = report.settlement.balances.map((b) => {
      const prefix = b.balance > 0 ? '+' : '';
      const status =
        b.balance > 0 ? 'Nhận về' : b.balance < 0 ? 'Cần chuyển' : 'Đã cân bằng';
      if (hasAnyTransfers) {
        return [
          b.memberName,
          formatVND(b.paidExpense, false),
          formatVND(b.owedExpense, false),
          formatVND(b.netTransfer, false),
          `${prefix}${formatVND(b.balance, false)}`,
          status,
        ];
      }
      return [
        b.memberName,
        formatVND(b.paidExpense, false),
        formatVND(b.owedExpense, false),
        `${prefix}${formatVND(b.balance, false)}`,
        status,
      ];
    });

    autoTableFn.call(doc, {
      startY: cursorY,
      rowPageBreak: 'avoid',
      head: balanceHead,
      body: balanceRows,
      margin: { left: marginX, right: marginX, bottom: 15 },
      styles: {
        font: activeFont,
        fontSize: 8.2,
        cellPadding: 1.9,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [241, 245, 249],
        textColor: COLOR_INK,
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: [252, 253, 254] },
      columnStyles: hasAnyTransfers
        ? {
            0: { cellWidth: 34, fontStyle: 'bold' },
            1: { cellWidth: 30, halign: 'right' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
            5: { cellWidth: 'auto', halign: 'center' },
          }
        : {
            0: { cellWidth: 42, fontStyle: 'bold' },
            1: { cellWidth: 36, halign: 'right' },
            2: { cellWidth: 36, halign: 'right' },
            3: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
            4: { cellWidth: 'auto', halign: 'center' },
          },
      didParseCell: (data: any) => {
        const balColIdx = hasAnyTransfers ? 4 : 3;
        const statusColIdx = hasAnyTransfers ? 5 : 4;
        if (data.section === 'body' && (data.column.index === balColIdx || data.column.index === statusColIdx)) {
          const rawText = String(data.cell.raw || '');
          if (rawText.startsWith('+') || rawText === 'Nhận về') {
            data.cell.styles.textColor = COLOR_TEAL_DARK;
            data.cell.styles.fontStyle = 'bold';
          } else if (rawText.startsWith('-') || rawText === 'Cần chuyển') {
            data.cell.styles.textColor = COLOR_ROSE;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 4.5;
  }

  // Bảng 2.2: Lệnh chuyển khoản tất toán cuối cùng (Bảng quan trọng nhất được nhấn nổi bật)
  cursorY = ensurePageSpace(doc, cursorY, 22);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...COLOR_INK);
  doc.text(
    'LỆNH CHUYỂN KHOẢN TẤT TOÁN CUỐI CÙNG (PHƯƠNG ÁN TỐI ƯU DÒNG TIỀN)',
    marginX,
    cursorY + 3
  );
  cursorY += 4.5;

  if (typeof autoTableFn === 'function') {
    const simplifiedBody = report.settlement.simplifiedDebts.map((d, idx) => [
      `${idx + 1}`,
      `${d.fromMemberName}  ->  ${d.toMemberName}`,
      `${formatVND(d.amount, false)} đ`,
      d.toBankInfo || 'Chưa cập nhật STK nhận',
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      rowPageBreak: 'avoid',
      head: [['#', 'Người chuyển  ->  Người nhận', 'Số tiền cần chuyển', 'Thông tin tài khoản ngân hàng nhận']],
      body:
        simplifiedBody.length > 0
          ? simplifiedBody
          : [['—', 'Tất cả thành viên đã tất toán cân bằng (không còn công nợ)', '0 đ', '—']],
      margin: { left: marginX, right: marginX, bottom: 15 },
      styles: {
        font: activeFont,
        fontSize: 8.4,
        cellPadding: 2.1,
        textColor: COLOR_INK,
        lineColor: [203, 213, 225],
        lineWidth: 0.12,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: COLOR_INK,
        textColor: [255, 255, 255],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 58, fontStyle: 'bold' },
        2: { cellWidth: 38, halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
        3: { cellWidth: 'auto' },
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 6;
  }

  // ==========================================================================
  // PHẦN 03: SỔ CHI TIẾT CHI TIÊU TOÀN CHUYẾN ĐI (Sang trang mới nếu phần còn lại của Trang 1 hẹp)
  // ==========================================================================
  if (cursorY > 195) {
    doc.addPage();
    cursorY = 14;
  }

  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '03',
    'SỔ CHI TIẾT CHI TIÊU & CHUYỂN KHOẢN TOÀN CHUYẾN ĐI',
    `Liệt kê đầy đủ ${report.rows.length} bản ghi theo trình tự thời gian`,
    marginX,
    cursorY,
    pageWidth
  );

  if (typeof autoTableFn === 'function') {
    const tableHead = [['#', 'Thời gian', 'Nội dung khoản chi / chuyển', 'Người chi', 'Phạm vi tham gia', 'Hạng mục', 'Số tiền (đ)']];
    const tableBody = report.rows.map((r, idx) => [
      `${idx + 1}`,
      r.date,
      r.title,
      r.payerName,
      r.participantsSummary,
      r.compactTypeLabel,
      r.amountFormatted,
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      showFoot: 'lastPage',
      rowPageBreak: 'avoid',
      head: tableHead,
      body:
        tableBody.length > 0
          ? tableBody
          : [['—', '—', 'Chưa có khoản chi nào trong chuyến đi', '—', '—', '—', '0']],
      foot:
        tableBody.length > 0
          ? [
              [
                '',
                '',
                'Tổng chi tiêu toàn chuyến đi (không tính chuyển khoản trả nợ)',
                '',
                '',
                '',
                formatVND(report.overview.totalExpenseAmount, false),
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX, bottom: 15 },
      styles: {
        font: activeFont,
        fontSize: 7.9,
        cellPadding: 1.65,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [241, 245, 249],
        textColor: COLOR_INK,
        lineColor: [203, 213, 225],
        lineWidth: 0.15,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [248, 250, 252],
        textColor: COLOR_TEAL_DARK,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [252, 253, 254] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 27 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 20 },
        4: { cellWidth: 36, textColor: COLOR_SLATE },
        5: { cellWidth: 24, textColor: COLOR_SLATE },
        6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      },
    });
  }

  // ==========================================================================
  // PHẦN 04: PHỤ LỤC THỐNG KÊ THEO TỪNG CÁ NHÂN (MỖI THÀNH VIÊN BẮT ĐẦU TRÊN 1 TRANG MỚI)
  // ==========================================================================
  report.memberAppendices.forEach((appendix, idx) => {
    doc.addPage();
    renderMemberAppendixSection(
      doc,
      autoTableFn,
      activeFont,
      report,
      appendix,
      `PHỤ LỤC CÁ NHÂN (${idx + 1}/${report.memberAppendices.length})`,
      marginX,
      12,
      pageWidth
    );
  });

  stampPageFooters(doc, activeFont, report);
  doc.save(report.suggestedFileName);
}
