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
    return `Trước chuyến (${shortVN})`;
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

    // Cơ cấu chi tiêu cá nhân theo danh mục (chỉ tính trên phần thụ hưởng của các khoản chi tiêu)
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
// CÁC HÀM VẼ BIỂU ĐỒ VECTOR & GIAO DIỆN BÁO CÁO TRÊN JSPDF
// ============================================================================

const CHART_PALETTE: Array<[number, number, number]> = [
  [13, 148, 136], // teal-600
  [2, 132, 199], // sky-600
  [217, 119, 6], // amber-600
  [124, 58, 237], // violet-600
  [225, 29, 72], // rose-600
  [22, 163, 74], // green-600
  [71, 85, 105], // slate-600
];

function ensurePageSpace(doc: any, cursorY: number, neededHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + neededHeight > pageHeight - 16) {
    doc.addPage();
    return 16;
  }
  return cursorY;
}

function drawSectionHeading(
  doc: any,
  activeFont: string,
  title: string,
  subtitle: string | null,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  let y = ensurePageSpace(doc, cursorY, 16);
  doc.setFillColor(13, 148, 136);
  doc.roundedRect(marginX, y, 3, subtitle ? 9.5 : 6, 1, 1, 'F');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text(title, marginX + 5.5, y + 4.5);

  if (subtitle) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, marginX + 5.5, y + 9);
    y += 12;
  } else {
    y += 8.5;
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(marginX, y - 1.5, pageWidth - marginX, y - 1.5);
  return y + 1.5;
}

function drawFourKpiRow(
  doc: any,
  activeFont: string,
  items: Array<{
    label: string;
    value: string;
    subtext?: string;
    color?: [number, number, number];
  }>,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const boxHeight = 18;
  const y = ensurePageSpace(doc, cursorY, boxHeight + 4);
  const gap = 3;
  const totalWidth = pageWidth - marginX * 2;
  const colWidth = (totalWidth - gap * 3) / 4;

  items.slice(0, 4).forEach((item, idx) => {
    const x = marginX + idx * (colWidth + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, colWidth, boxHeight, 2, 2, 'FD');

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, x + 3, y + 5);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(10);
    const [r, g, b] = item.color || [15, 23, 42];
    doc.setTextColor(r, g, b);
    doc.text(item.value, x + 3, y + 11.2);

    if (item.subtext) {
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(item.subtext, x + 3, y + 15.5);
    }
  });

  return y + boxHeight + 5;
}

function drawHorizontalDistributionChart(
  doc: any,
  activeFont: string,
  chartTitle: string,
  items: Array<{ label: string; amount: number; count: number; percentage: number }>,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  if (items.length === 0) return cursorY;

  const rowHeight = 7;
  const headerHeight = 8;
  const paddingBottom = 3;
  const totalBoxHeight = headerHeight + items.length * rowHeight + paddingBottom;

  let y = ensurePageSpace(doc, cursorY, totalBoxHeight + 4);
  const fullWidth = pageWidth - marginX * 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(marginX, y, fullWidth, totalBoxHeight, 2, 2, 'FD');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(chartTitle, marginX + 4, y + 5.5);

  let rowY = y + headerHeight + 1;
  const labelColWidth = 46;
  const valueColWidth = 44;
  const barTrackX = marginX + 4 + labelColWidth;
  const barTrackWidth = fullWidth - 8 - labelColWidth - valueColWidth;

  items.forEach((item, idx) => {
    const color = CHART_PALETTE[idx % CHART_PALETTE.length];

    // Nhãn bên trái
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const shortLabel =
      item.label.length > 24 ? `${item.label.slice(0, 23)}…` : item.label;
    doc.text(`${shortLabel} (${item.count})`, marginX + 4, rowY + 3.5);

    // Thanh nền xám nhạt
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 0.8, barTrackWidth, 3.6, 1, 1, 'F');

    // Thanh giá trị màu
    const pctRatio = Math.max(0, Math.min(1, item.percentage / 100));
    const fillW = Math.max(pctRatio > 0 ? 1.8 : 0, barTrackWidth * pctRatio);
    if (fillW > 0) {
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(barTrackX, rowY + 0.8, fillW, 3.6, 1, 1, 'F');
    }

    // Số tiền + % bên phải
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    const rightText = `${formatVND(item.amount, false)} đ (${item.percentage}%)`;
    doc.text(rightText, marginX + fullWidth - 4, rowY + 3.5, { align: 'right' });

    rowY += rowHeight;
  });

  return y + totalBoxHeight + 4;
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

  const rowHeight = 10.5;
  const headerHeight = 9.5;
  const totalBoxHeight = headerHeight + balances.length * rowHeight + 3;

  let y = ensurePageSpace(doc, cursorY, totalBoxHeight + 4);
  const fullWidth = pageWidth - marginX * 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.roundedRect(marginX, y, fullWidth, totalBoxHeight, 2, 2, 'FD');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text('Biểu đồ tương quan: Đã chi trả vs. Phần phải chịu', marginX + 4, y + 6);

  // Chú thích màu (Legend)
  const legendRightX = marginX + fullWidth - 4;
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(7.5);
  doc.setFillColor(13, 148, 136);
  doc.rect(legendRightX - 58, y + 3.3, 3, 3, 'F');
  doc.setTextColor(51, 65, 85);
  doc.text('Đã chi', legendRightX - 53.5, y + 5.8);

  doc.setFillColor(217, 119, 6);
  doc.rect(legendRightX - 30, y + 3.3, 3, 3, 'F');
  doc.text('Phải chịu', legendRightX - 25.5, y + 5.8);

  const maxVal = Math.max(
    1,
    ...balances.map((b) => Math.max(b.paidExpense, b.owedExpense))
  );

  let rowY = y + headerHeight + 1;
  const nameColWidth = 36;
  const statusColWidth = 44;
  const barTrackX = marginX + 4 + nameColWidth;
  const barTrackWidth = fullWidth - 8 - nameColWidth - statusColWidth;

  balances.forEach((b) => {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    const shortName = b.memberName.length > 18 ? `${b.memberName.slice(0, 17)}…` : b.memberName;
    doc.text(shortName, marginX + 4, rowY + 4.5);

    // Thanh 1: Đã chi (Teal)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 0.8, barTrackWidth, 2.8, 0.8, 0.8, 'F');
    const paidW = Math.max(
      b.paidExpense > 0 ? 1.5 : 0,
      (b.paidExpense / maxVal) * barTrackWidth
    );
    if (paidW > 0) {
      doc.setFillColor(13, 148, 136);
      doc.roundedRect(barTrackX, rowY + 0.8, paidW, 2.8, 0.8, 0.8, 'F');
    }

    // Thanh 2: Phải chịu (Amber)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 4.4, barTrackWidth, 2.8, 0.8, 0.8, 'F');
    const owedW = Math.max(
      b.owedExpense > 0 ? 1.5 : 0,
      (b.owedExpense / maxVal) * barTrackWidth
    );
    if (owedW > 0) {
      doc.setFillColor(217, 119, 6);
      doc.roundedRect(barTrackX, rowY + 4.4, owedW, 2.8, 0.8, 0.8, 'F');
    }

    // Số dư cuối bên phải
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(8);
    let balLabel = '0 đ (Cân bằng)';
    if (b.balance > 0) {
      doc.setTextColor(13, 148, 136); // teal
      balLabel = `+${formatVND(b.balance, false)} đ`;
    } else if (b.balance < 0) {
      doc.setTextColor(225, 29, 72); // rose
      balLabel = `${formatVND(b.balance, false)} đ`;
    } else {
      doc.setTextColor(100, 116, 139);
    }
    doc.text(balLabel, marginX + fullWidth - 4, rowY + 4.8, { align: 'right' });

    rowY += rowHeight;
  });

  return y + totalBoxHeight + 4;
}

function renderMemberAppendixSection(
  doc: any,
  autoTableFn: any,
  activeFont: string,
  report: ExpenseReportData,
  appendix: MemberAppendixData,
  indexLabel: string,
  marginX: number,
  startCursorY: number,
  pageWidth: number
): number {
  let cursorY = startCursorY;

  // Tiêu đề phụ lục cá nhân
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    `${indexLabel}: ${appendix.memberName.toUpperCase()}`,
    appendix.bankInfo
      ? `Tài khoản nhận: ${appendix.bankInfo}  •  Chuyến đi: ${report.tripName}`
      : `Báo cáo thống kê thu chi & quyết toán cá nhân  •  Chuyến đi: ${report.tripName}`,
    marginX,
    cursorY,
    pageWidth
  );

  // 4 ô chỉ số KPI của cá nhân
  const balanceColor: [number, number, number] =
    appendix.balance > 0
      ? [13, 148, 136]
      : appendix.balance < 0
        ? [225, 29, 72]
        : [71, 85, 105];
  const balanceStatusText =
    appendix.balance > 0
      ? 'Được nhận lại'
      : appendix.balance < 0
        ? 'Cần chuyển thêm'
        : 'Đã tất toán xong';
  const balPrefix = appendix.balance > 0 ? '+' : '';

  cursorY = drawFourKpiRow(
    doc,
    activeFont,
    [
      {
        label: 'Tổng đã đứng ra chi',
        value: `${formatVND(appendix.paidExpense, false)} đ`,
        subtext: `${appendix.paidRows.filter((r) => r.recordType === 'expense').length} khoản chi trả`,
        color: [13, 148, 136],
      },
      {
        label: 'Tổng phần phải chịu',
        value: `${formatVND(appendix.owedExpense, false)} đ`,
        subtext: `${appendix.participatedRows.filter((r) => r.recordType === 'expense').length} khoản thụ hưởng`,
        color: [217, 119, 6],
      },
      {
        label: 'Chuyển trả ròng',
        value: `${formatVND(appendix.netTransfer, false)} đ`,
        subtext: `Đã chuyển ${formatVND(appendix.sentTransfer, false)} / Nhận ${formatVND(appendix.receivedTransfer, false)}`,
        color: [51, 65, 85],
      },
      {
        label: 'Số dư cuối cùng',
        value: `${balPrefix}${formatVND(appendix.balance, false)} đ`,
        subtext: balanceStatusText,
        color: balanceColor,
      },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // Khung kết luận chuyển khoản cuối cùng của cá nhân
  const actions = appendix.finalSettlementActions;
  const actionBoxHeight = actions.length === 0 ? 11 : 8 + actions.length * 5.2;
  cursorY = ensurePageSpace(doc, cursorY, actionBoxHeight + 4);

  if (appendix.balance < 0) {
    doc.setFillColor(255, 241, 242); // rose-50
    doc.setDrawColor(254, 205, 211); // rose-200
  } else if (appendix.balance > 0) {
    doc.setFillColor(240, 253, 250); // teal-50
    doc.setDrawColor(153, 246, 228); // teal-200
  } else {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
  }
  doc.roundedRect(marginX, cursorY, pageWidth - marginX * 2, actionBoxHeight, 2, 2, 'FD');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);

  if (actions.length === 0) {
    doc.text(
      `Kết luận quyết toán: ${appendix.memberName} đã cân bằng công nợ (không cần chuyển hoặc nhận thêm).`,
      marginX + 4,
      cursorY + 6.8
    );
  } else {
    doc.text('Chi tiết thanh toán quyết toán cuối cùng:', marginX + 4, cursorY + 5.5);
    let actY = cursorY + 10.5;
    actions.forEach((act) => {
      const isSender = act.fromMemberId === appendix.memberId;
      doc.setFont(activeFont, 'bold');
      doc.setFontSize(8.2);
      if (isSender) {
        doc.setTextColor(190, 18, 60); // rose-700
        const bankSuffix = act.toBankInfo ? `  [TK nhận: ${act.toBankInfo}]` : '';
        doc.text(
          `• Cần chuyển: ${ act.fromMemberName } -> ${ act.toMemberName }: ${formatVND(act.amount, false)} đ${bankSuffix}`,
          marginX + 5,
          actY
        );
      } else {
        doc.setTextColor(15, 118, 110); // teal-700
        doc.text(
          `• Được nhận về: ${ act.fromMemberName } -> ${ act.toMemberName }: +${formatVND(act.amount, false)} đ`,
          marginX + 5,
          actY
        );
      }
      actY += 5.2;
    });
  }

  cursorY += actionBoxHeight + 4;

  // Biểu đồ cơ cấu chi tiêu cá nhân theo danh mục
  if (appendix.byCategory.length > 0) {
    cursorY = drawHorizontalDistributionChart(
      doc,
      activeFont,
      `Cơ cấu chi tiêu thụ hưởng theo Danh mục của ${appendix.memberName}`,
      appendix.byCategory.map((c) => ({
        label: c.categoryName,
        amount: c.amount,
        count: c.count,
        percentage: c.percentage,
      })),
      marginX,
      cursorY,
      pageWidth
    );
  }

  // Bảng A: Các khoản cá nhân này đã đứng ra trả tiền / chuyển trả
  cursorY = ensurePageSpace(doc, cursorY, 22);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `1. Các khoản ${appendix.memberName} đã trực tiếp chi trả / chuyển khoản (${appendix.paidRows.length} mục)`,
    marginX,
    cursorY + 3.5
  );
  cursorY += 5.5;

  if (typeof autoTableFn === 'function') {
    const paidBody = appendix.paidRows.map((r) => [
      r.date,
      r.title,
      r.participantsSummary,
      r.typeLabel,
      r.amountFormatted,
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      head: [['Ngày', 'Nội dung chi / chuyển', 'Phạm vi / Người nhận', 'Loại', 'Số tiền đã chi (đ)']],
      body:
        paidBody.length > 0
          ? paidBody
          : [['—', `${appendix.memberName} chưa trực tiếp đứng ra trả khoản nào`, '—', '—', '0']],
      foot:
        paidBody.length > 0
          ? [
              [
                '',
                'Tổng cộng đã chi trả (không tính chuyển khoản)',
                '',
                '',
                formatVND(appendix.paidExpense, false),
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX },
      styles: {
        font: activeFont,
        fontSize: 8.2,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [13, 148, 136],
        textColor: [255, 255, 255],
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 42 },
        3: { cellWidth: 24 },
        4: { cellWidth: 30, halign: 'right' },
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 12) + 6;
  }

  // Bảng B: Các khoản chi tiêu có tham gia thụ hưởng & phần tiền của cá nhân
  cursorY = ensurePageSpace(doc, cursorY, 22);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `2. Chi tiết các khoản ${appendix.memberName} tham gia thụ hưởng (${appendix.participatedRows.length} mục)`,
    marginX,
    cursorY + 3.5
  );
  cursorY += 5.5;

  if (typeof autoTableFn === 'function') {
    const partBody = appendix.participatedRows.map((r) => [
      r.date,
      r.title,
      r.payerName,
      r.typeLabel,
      r.amountFormatted,
      r.memberShareFormatted || '0',
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      head: [
        [
          'Ngày',
          'Nội dung khoản chi',
          'Người trả bill',
          'Loại',
          'Tổng hóa đơn (đ)',
          `Phần của ${appendix.memberName} (đ)`,
        ],
      ],
      body:
        partBody.length > 0
          ? partBody
          : [['—', 'Chưa tham gia khoản chi nào', '—', '—', '0', '0']],
      foot:
        partBody.length > 0
          ? [
              [
                '',
                'Tổng phần chi phí phải chịu (không tính nhận chuyển khoản)',
                '',
                '',
                '',
                formatVND(appendix.owedExpense, false),
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX },
      styles: {
        font: activeFont,
        fontSize: 8.2,
        cellPadding: 2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [51, 65, 85], // slate-700
        textColor: [255, 255, 255],
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 27 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 26 },
        3: { cellWidth: 22 },
        4: { cellWidth: 27, halign: 'right' },
        5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 12) + 6;
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
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.15);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `TdyTrip  •  ${report.tripName}  •  Xuất lúc: ${report.generatedAt}`,
      marginX,
      pageHeight - 7
    );
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
  let cursorY = 15;

  // Header chính của Báo cáo
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    report.filterMemberId === 'all'
      ? 'BÁO CÁO TỔNG HỢP & QUYẾT TOÁN CHUYẾN ĐI'
      : 'BÁO CÁO CHI TIÊU & QUYẾT TOÁN CÁ NHÂN',
    marginX,
    cursorY
  );

  cursorY += 6.5;
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(13, 148, 136);
  doc.text(report.tripName, marginX, cursorY);

  cursorY += 5;
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const metaParts: string[] = [];
  if (report.location) metaParts.push(`Địa điểm: ${report.location}`);
  if (report.dateRangeLabel) metaParts.push(`Thời gian: ${report.dateRangeLabel}`);
  metaParts.push(`Phạm vi: ${report.scopeLabel}`);
  metaParts.push(`Xuất lúc: ${report.generatedAt}`);
  doc.text(metaParts.join('  •  '), marginX, cursorY);

  cursorY += 5.5;

  // Trường hợp lọc theo 1 thành viên cụ thể: Xuất báo cáo cá nhân chi tiết của thành viên đó
  if (report.filterMemberId !== 'all' && report.memberAppendices.length > 0) {
    renderMemberAppendixSection(
      doc,
      autoTableFn,
      activeFont,
      report,
      report.memberAppendices[0],
      'THỐNG KÊ CÁ NHÂN',
      marginX,
      cursorY,
      pageWidth
    );
    stampPageFooters(doc, activeFont, report);
    doc.save(report.suggestedFileName);
    return;
  }

  // ==========================================================================
  // TRƯỜNG HỢP TOÀN BỘ CHUYẾN ĐI (ALL):
  // PHẦN I: TỔNG QUAN  |  PHẦN II: CHIA TIỀN  |  PHẦN III: CHI TIẾT CHI TIÊU  |  PHẦN IV: PHỤ LỤC CÁ NHÂN
  // ==========================================================================

  // PHẦN I: TỔNG QUAN CHUYẾN ĐI
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    'PHẦN I. TỔNG QUAN CHUYẾN ĐI',
    'Thống kê tổng chi tiêu, bình quân đầu người, biểu đồ cơ cấu danh mục và tiến độ theo ngày',
    marginX,
    cursorY,
    pageWidth
  );

  cursorY = drawFourKpiRow(
    doc,
    activeFont,
    [
      {
        label: 'Tổng chi tiêu chuyến đi',
        value: `${formatVND(report.overview.totalExpenseAmount, false)} đ`,
        subtext: `${report.overview.expenseCount} khoản chi tiêu`,
        color: [13, 148, 136],
      },
      {
        label: 'Bình quân mỗi người',
        value: `${formatVND(report.overview.averagePerMember, false)} đ`,
        subtext: `${report.overview.memberCount} thành viên tham gia`,
        color: [15, 23, 42],
      },
      {
        label: 'Đã chuyển khoản trả nợ',
        value: `${formatVND(report.overview.totalTransferAmount, false)} đ`,
        subtext: `${report.overview.transferCount} giao dịch chuyển trả`,
        color: [2, 132, 199],
      },
      {
        label: 'Tổng số bản ghi sổ',
        value: `${report.rows.length} mục`,
        subtext: `${report.overview.byCategory.length} danh mục • ${report.overview.byDay.length} ngày`,
        color: [51, 65, 85],
      },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // Biểu đồ 1: Cơ cấu chi tiêu theo Danh mục
  cursorY = drawHorizontalDistributionChart(
    doc,
    activeFont,
    'Biểu đồ 1. Cơ cấu chi tiêu theo Danh mục',
    report.overview.byCategory.map((c) => ({
      label: c.categoryName,
      amount: c.amount,
      count: c.count,
      percentage: c.percentage,
    })),
    marginX,
    cursorY,
    pageWidth
  );

  // Biểu đồ 2: Chi tiêu theo Ngày
  cursorY = drawHorizontalDistributionChart(
    doc,
    activeFont,
    'Biểu đồ 2. Tiến độ chi tiêu theo Ngày',
    report.overview.byDay.map((d) => ({
      label: d.label,
      amount: d.amount,
      count: d.count,
      percentage: d.percentage,
    })),
    marginX,
    cursorY,
    pageWidth
  );

  // PHẦN II: CHIA TIỀN & QUYẾT TOÁN CUỐI CÙNG
  cursorY += 2;
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    'PHẦN II. CHIA TIỀN & QUYẾT TOÁN CUỐI CÙNG',
    'Bảng cân đối thu chi từng thành viên và số tiền cụ thể cần chuyển khoản để tất toán chuyến đi',
    marginX,
    cursorY,
    pageWidth
  );

  // Biểu đồ 3: Tương quan Đã chi vs. Phải chịu của từng thành viên
  cursorY = drawMemberBalanceComparisonChart(
    doc,
    activeFont,
    report.settlement.balances,
    marginX,
    cursorY,
    pageWidth
  );

  // Bảng 2.1: Bảng cân đối tổng hợp từng thành viên
  if (typeof autoTableFn === 'function') {
    const balanceRows = report.settlement.balances.map((b) => {
      const prefix = b.balance > 0 ? '+' : '';
      const status =
        b.balance > 0 ? 'Nhận về' : b.balance < 0 ? 'Cần trả' : 'Đã cân bằng';
      return [
        b.memberName,
        formatVND(b.paidExpense, false),
        formatVND(b.owedExpense, false),
        formatVND(b.netTransfer, false),
        `${prefix}${formatVND(b.balance, false)}`,
        status,
      ];
    });

    autoTableFn.call(doc, {
      startY: cursorY,
      head: [
        [
          'Thành viên',
          'Đã chi (đ)',
          'Phải chịu (đ)',
          'Chuyển trả ròng (đ)',
          'Số dư cuối (đ)',
          'Trạng thái',
        ],
      ],
      body: balanceRows,
      margin: { left: marginX, right: marginX },
      styles: {
        font: activeFont,
        fontSize: 8.5,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [13, 148, 136],
        textColor: [255, 255, 255],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 34, fontStyle: 'bold' },
        1: { cellWidth: 28, halign: 'right' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 'auto', halign: 'center' },
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 15) + 5;
  }

  // Bảng 2.2: Gợi ý chuyển khoản tối ưu (Số tiền cụ thể cần chuyển cuối cùng)
  cursorY = ensurePageSpace(doc, cursorY, 24);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    'Bảng 2.2. Cụ thể số tiền cần chuyển cuối cùng (Gợi ý tối ưu dòng tiền)',
    marginX,
    cursorY + 3.5
  );
  cursorY += 5.5;

  if (typeof autoTableFn === 'function') {
    const simplifiedBody = report.settlement.simplifiedDebts.map((d, idx) => [
      `${idx + 1}`,
      `${d.fromMemberName} -> ${d.toMemberName}`,
      formatVND(d.amount, false),
      d.toBankInfo || 'Chưa cập nhật STK nhận',
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      head: [['#', 'Lệnh chuyển (Người chuyển -> Người nhận)', 'Số tiền cần chuyển (đ)', 'Tài khoản ngân hàng người nhận']],
      body:
        simplifiedBody.length > 0
          ? simplifiedBody
          : [['—', 'Tất cả thành viên đã tất toán cân bằng (không còn công nợ)', '0', '—']],
      margin: { left: marginX, right: marginX },
      styles: {
        font: activeFont,
        fontSize: 8.5,
        cellPadding: 2.2,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [15, 118, 110], // teal-700
        textColor: [255, 255, 255],
      },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 64, fontStyle: 'bold' },
        2: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
        3: { cellWidth: 'auto' },
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 5;
  }

  // Bảng 2.3: Đối chiếu công nợ trực tiếp đôi một (Pairwise)
  if (report.settlement.pairwiseDebts.length > 0 && typeof autoTableFn === 'function') {
    cursorY = ensurePageSpace(doc, cursorY, 22);
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      'Bảng 2.3. Đối chiếu công nợ trực tiếp đôi một (Khi không gộp nợ bắc cầu)',
      marginX,
      cursorY + 3.5
    );
    cursorY += 5.5;

    const pairwiseBody = report.settlement.pairwiseDebts.map((d, idx) => [
      `${idx + 1}`,
      `${d.fromMemberName} -> ${d.toMemberName}`,
      formatVND(d.amount, false),
      d.toBankInfo || '—',
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      head: [['#', 'Cặp đối chiếu (Người nợ -> Người đã chi hộ)', 'Số tiền nợ ròng (đ)', 'Tài khoản nhận']],
      body: pairwiseBody,
      margin: { left: marginX, right: marginX },
      styles: {
        font: activeFont,
        fontSize: 8.2,
        cellPadding: 2,
        textColor: [51, 65, 85],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [71, 85, 105], // slate-600
        textColor: [255, 255, 255],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 64 },
        2: { cellWidth: 36, halign: 'right', fontStyle: 'bold' },
        3: { cellWidth: 'auto' },
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 6;
  }

  // PHẦN III: CHI TIẾT CHI TIÊU TOÀN CHUYẾN ĐI
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    'PHẦN III. SỔ CHI TIẾT CHI TIÊU & CHUYỂN KHOẢN TOÀN CHUYẾN ĐI',
    `Liệt kê đầy đủ ${report.rows.length} bản ghi theo thứ tự thời gian (bao gồm khoản chi và chuyển trả)`,
    marginX,
    cursorY,
    pageWidth
  );

  if (typeof autoTableFn === 'function') {
    const tableHead = [['Ngày', 'Tên khoản chi / chuyển', 'Người chi', 'Người tham gia', 'Số tiền (đ)', 'Loại']];
    const tableBody = report.rows.map((r) => [
      r.date,
      r.title,
      r.payerName,
      r.participantsSummary,
      r.amountFormatted,
      r.typeLabel,
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      head: tableHead,
      body:
        tableBody.length > 0
          ? tableBody
          : [['—', 'Chưa có khoản chi nào trong chuyến đi', '—', '—', '0', '—']],
      foot:
        tableBody.length > 0
          ? [
              [
                '',
                'Tổng chi tiêu (không tính chuyển khoản trả nợ)',
                '',
                '',
                formatVND(report.overview.totalExpenseAmount, false),
                '',
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX },
      styles: {
        font: activeFont,
        fontSize: 8.2,
        cellPadding: 2.1,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.1,
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [13, 148, 136],
        textColor: [255, 255, 255],
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 27 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 25 },
        3: { cellWidth: 38 },
        4: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 23 },
      },
    });
  }

  // PHẦN IV: PHỤ LỤC THỐNG KÊ THEO TỪNG CÁ NHÂN (MỖI THÀNH VIÊN 1 TRANG RIÊNG)
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
      15,
      pageWidth
    );
  });

  // Đánh số trang toàn bộ file PDF
  stampPageFooters(doc, activeFont, report);

  doc.save(report.suggestedFileName);
}
