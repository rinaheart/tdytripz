import type {
  Category,
  DebtTransaction,
  ExpenseRecord,
  Member,
  MemberBalance,
  TripConfig,
} from '../types';
import { formatShortDateVN, formatVND, getNowGMT7 } from './format';
import {
  calculateBalances,
  calculatePairwiseDebts,
  simplifyDebts,
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
  categoryIcon: string;
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
  categoryIcon: string;
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
  avatarColor: string;
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
  avatarColor: string;
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
  const withoutParens = label.replace(/\s*\([^)]*\)/g, '').trim();
  const normalized = withoutParens
    .replace(/^Di chuyển tại chỗ$/i, 'Di chuyển')
    .replace(/^Khách sạn\s*\/\s*Lưu trú$/i, 'Lưu trú')
    .replace(/^Vé máy bay\s*\/\s*Tàu xe$/i, 'Vé đi/về')
    .trim();
  return normalized || label;
}

function resolveCategoryIconName(cat?: Category, rawName?: string): string {
  const icon = (cat?.icon || '').trim();
  if (
    icon === 'Plane' ||
    icon === 'Car' ||
    icon === 'Utensils' ||
    icon === 'Hotel' ||
    icon === 'Ticket' ||
    icon === 'Package'
  ) {
    return icon;
  }
  const n = (rawName || cat?.name || '').toLowerCase();
  const id = (cat?.id || '').toLowerCase();
  if (id.includes('flight') || n.includes('vé đi') || n.includes('máy bay') || n.includes('tàu')) {
    return 'Plane';
  }
  if (id.includes('transport') || id.includes('move') || n.includes('di chuyển') || n.includes('taxi') || n.includes('xe')) {
    return 'Car';
  }
  if (id.includes('food') || n.includes('ăn') || n.includes('uống') || n.includes('cafe')) {
    return 'Utensils';
  }
  if (id.includes('hotel') || n.includes('lưu trú') || n.includes('khách sạn') || n.includes('homestay')) {
    return 'Hotel';
  }
  if (id.includes('ticket') || n.includes('tham quan') || n.includes('vé chơi')) {
    return 'Ticket';
  }
  return 'Package';
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
  memberMap: Map<string, Member>,
  totalActiveMembersCount: number
): string {
  const entries = Object.entries(record.splits || {}).filter(
    ([, val]) => Math.round(val || 0) > 0
  );
  if (entries.length === 0) return '—';

  const names = entries.map(([id]) => memberMap.get(id)?.name || id);
  if (record.type === 'transfer') {
    const payerName = memberMap.get(record.payer)?.name || record.payer;
    return `${payerName} → ${names.join(', ')}`;
  }

  // Nếu khoản chi chia hết cho tất cả thành viên trong đoàn thì chỉ ghi "xx người"
  if (totalActiveMembersCount > 0 && entries.length >= totalActiveMembersCount) {
    return `${entries.length} người`;
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
    return `Trước chuyến (${shortVN.slice(0, 5)})`;
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

  const activeMembers = members.filter((m) => m.active !== false);
  const memberCount = activeMembers.length;
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

  const catAgg = new Map<string, { name: string; icon: string; amount: number; count: number }>();
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
      const catObj = categoryMap.get(catId);
      const catName = shortenCategoryLabelForTable(catObj?.name || 'Khác');
      const catIcon = resolveCategoryIconName(catObj, catName);
      const curCat = catAgg.get(catId) || { name: catName, icon: catIcon, amount: 0, count: 0 };
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
      categoryIcon: item.icon,
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

  const averagePerMember = memberCount > 0 ? Math.round(fullExpenseTotal / memberCount) : 0;

  // 2. Tính toán Chia tiền & Quyết toán (Settlement)
  const rawBalances = calculateBalances(activeMembers, allActiveRecords);
  const enrichedBalances: EnrichedMemberBalance[] = rawBalances.map((b) => {
    const m = memberMap.get(b.memberId);
    return {
      ...b,
      memberName: m?.name || b.memberId,
      avatarColor: m?.avatarColor || '#0f766e',
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
    const catObj = categoryMap.get(e.categoryId);
    const rawCatName = catObj?.name || 'Khác';
    const typeLabel = e.type === 'transfer' ? 'Chuyển trả' : shortenCategoryLabelForTable(rawCatName);
    const compactTypeLabel = typeLabel;
    const categoryIcon =
      e.type === 'transfer' ? 'ArrowRightLeft' : resolveCategoryIconName(catObj, typeLabel);
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
      categoryIcon,
      recordType: e.type,
      participantsSummary: formatParticipantsSummary(e, memberMap, memberCount),
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

    const personalCatMap = new Map<string, { name: string; icon: string; amount: number; count: number }>();
    let personalTotalOwed = 0;

    for (const e of allActiveRecords) {
      if (e.type !== 'expense') continue;
      const myShare = Math.round(e.splits?.[m.id] || 0);
      if (myShare <= 0) continue;
      personalTotalOwed += myShare;
      const catId = e.categoryId || 'cat_other';
      const catObj = categoryMap.get(catId);
      const catName = shortenCategoryLabelForTable(catObj?.name || 'Khác');
      const catIcon = resolveCategoryIconName(catObj, catName);
      const cur = personalCatMap.get(catId) || { name: catName, icon: catIcon, amount: 0, count: 0 };
      cur.amount += myShare;
      cur.count += 1;
      personalCatMap.set(catId, cur);
    }

    const personalByCategory: ReportCategoryBreakdown[] = Array.from(personalCatMap.entries())
      .map(([categoryId, item]) => ({
        categoryId,
        categoryName: item.name,
        categoryIcon: item.icon,
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
      avatarColor: m.avatarColor || '#0f766e',
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

const JSPDF_CDN_URL = 'https://cdn.jsdelivr.net/npm/jspdf@4.2.1/dist/jspdf.umd.min.js';
const AUTOTABLE_CDN_URL =
  'https://cdn.jsdelivr.net/npm/jspdf-autotable@5.0.9/dist/jspdf.plugin.autotable.min.js';
const ROBOTO_REGULAR_TTF_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/fonts/Roboto/Roboto-Regular.ttf';
const ROBOTO_MEDIUM_TTF_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/fonts/Roboto/Roboto-Medium.ttf';

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
// HỆ THỐNG RENDER ICON LUCIDE (TƯƠNG ĐỒNG 100% VỚI WEB APP) + VECTOR ARROW SYMBOL
// ============================================================================

const LUCIDE_ICON_PATHS: Record<string, string[]> = {
  Plane: [
    'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z',
  ],
  Car: [
    'M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2',
    'M7 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    'M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
    'M9 17h6',
  ],
  Utensils: [
    'M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2',
    'M7 2v20',
    'M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7',
  ],
  Hotel: [
    'M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z',
    'M9 22v-4h6v4',
    'M8 6h.01',
    'M16 6h.01',
    'M12 6h.01',
    'M12 10h.01',
    'M12 14h.01',
    'M16 10h.01',
    'M16 14h.01',
    'M8 10h.01',
    'M8 14h.01',
  ],
  Ticket: [
    'M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z',
    'M13 5v2',
    'M13 17v2',
    'M13 11v2',
  ],
  Package: [
    'm7.5 4.27 9 5.15',
    'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
    'm3.3 7 8.7 5 8.7-5',
    'M12 22V12',
  ],
  Wallet: [
    'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
    'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4',
  ],
  Users: [
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
    'M5 7a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
    'M22 21v-2a4 4 0 0 0-3-3.87',
    'M16 3.13a4 4 0 0 1 0 7.75',
  ],
  PieChart: [
    'M21.21 15.89A10 10 0 1 1 8 2.83',
    'M22 12A10 10 0 0 0 12 2v10z',
  ],
  Award: [
    'M6 9a6 6 0 1 0 12 0A6 6 0 1 0 6 9',
    'M15.477 12.89 17 22l-5-3-5 3 1.523-9.11',
  ],
  Calendar: [
    'M8 2v4',
    'M16 2v4',
    'M3 10h18',
    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  ],
  ArrowRightLeft: [
    'm16 3 4 4-4 4',
    'M20 7H4',
    'm8 21-4-4 4-4',
    'M4 17h16',
  ],
  Send: [
    'm22 2-7 20-4-9-9-4Z',
    'M22 2 11 13',
  ],
  CheckCircle: [
    'M22 11.08V12a10 10 0 1 1-5.93-9.14',
    'm9 11 3 3L22 4',
  ],
  MapPin: [
    'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z',
    'M9 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  ],
};

const iconDataUrlCache = new Map<string, string>();

function renderLucideIconDataUrl(
  iconName: string,
  strokeRgb: [number, number, number],
  bgRgb?: [number, number, number]
): string | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;

  const cacheKey = `${iconName}_${strokeRgb.join(',')}_${bgRgb ? bgRgb.join(',') : 'none'}`;
  const cached = iconDataUrlCache.get(cacheKey);
  if (cached) return cached;

  try {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (bgRgb) {
      ctx.fillStyle = `rgb(${bgRgb[0]}, ${bgRgb[1]}, ${bgRgb[2]})`;
      const r = 22;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fill();
    }

    const pad = bgRgb ? 20 : 6;
    const scale = (size - pad * 2) / 24;
    ctx.save();
    ctx.translate(pad, pad);
    ctx.scale(scale, scale);
    ctx.strokeStyle = `rgb(${strokeRgb[0]}, ${strokeRgb[1]}, ${strokeRgb[2]})`;
    ctx.lineWidth = 2.25;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const paths = LUCIDE_ICON_PATHS[iconName] || LUCIDE_ICON_PATHS.Package;
    for (const d of paths) {
      const p = new Path2D(d);
      ctx.stroke(p);
    }
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    iconDataUrlCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

function drawIconBadge(
  doc: any,
  iconName: string,
  x: number,
  y: number,
  sizeMm: number,
  strokeRgb: [number, number, number],
  bgRgb?: [number, number, number]
): void {
  const dataUrl = renderLucideIconDataUrl(iconName, strokeRgb, bgRgb);
  if (dataUrl) {
    doc.addImage(dataUrl, 'PNG', x, y, sizeMm, sizeMm);
    return;
  }
  if (bgRgb) {
    doc.setFillColor(bgRgb[0], bgRgb[1], bgRgb[2]);
    doc.roundedRect(x, y, sizeMm, sizeMm, sizeMm * 0.22, sizeMm * 0.22, 'F');
  }
}

/**
 * Vẽ ký hiệu mũi tên vector (→) sắc nét tuyệt đối không phụ thuộc vào glyph của font
 */
function drawVectorArrowSymbol(
  doc: any,
  startX: number,
  centerY: number,
  lengthMm: number,
  rgb: [number, number, number]
): void {
  const headLen = 1.25;
  const headHalfH = 0.78;
  const endX = startX + lengthMm;
  const shaftEndX = endX - headLen * 0.65;

  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.4);
  doc.line(startX, centerY, shaftEndX, centerY);
  doc.triangle(
    endX,
    centerY,
    endX - headLen,
    centerY - headHalfH,
    endX - headLen,
    centerY + headHalfH,
    'F'
  );
}

/**
 * Vẽ cặp "Người chuyển → Người nhận" với mũi tên vector chính xác ở giữa
 */
function drawTransferPairWithArrow(
  doc: any,
  activeFont: string,
  fontStyle: 'normal' | 'bold',
  fontSize: number,
  leftText: string,
  rightText: string,
  startX: number,
  baselineY: number,
  leftRgb: [number, number, number],
  arrowRgb: [number, number, number],
  rightRgb: [number, number, number]
): number {
  doc.setFont(activeFont, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(leftRgb[0], leftRgb[1], leftRgb[2]);
  doc.text(leftText, startX, baselineY);

  const leftW = doc.getTextWidth(leftText);
  const gap = 2.1;
  const arrowLen = 3.8;
  const arrowStartX = startX + leftW + gap;
  const arrowCenterY = baselineY - fontSize * 0.115;

  drawVectorArrowSymbol(doc, arrowStartX, arrowCenterY, arrowLen, arrowRgb);

  const rightX = arrowStartX + arrowLen + gap;
  doc.setFont(activeFont, fontStyle);
  doc.setFontSize(fontSize);
  doc.setTextColor(rightRgb[0], rightRgb[1], rightRgb[2]);
  doc.text(rightText, rightX, baselineY);

  return rightX + doc.getTextWidth(rightText);
}

function hexToRgb(hex: string, fallback: [number, number, number] = [13, 148, 136]): [number, number, number] {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  return fallback;
}

// ============================================================================
// HỆ MÀU DIGITAL DASHBOARD NỔI BẬT, ẤN TƯỢNG TRÊN MÀN HÌNH PDF
// ============================================================================

const COLOR_HERO_DARK: [number, number, number] = [15, 23, 42]; // Slate 900
const COLOR_HERO_CARD: [number, number, number] = [30, 41, 59]; // Slate 800
const COLOR_INK: [number, number, number] = [15, 23, 42]; // Slate 900
const COLOR_SLATE: [number, number, number] = [71, 85, 105]; // Slate 600
const COLOR_MUTED: [number, number, number] = [100, 116, 139]; // Slate 500
const COLOR_BORDER: [number, number, number] = [226, 232, 240]; // Slate 200
const COLOR_TEAL: [number, number, number] = [13, 148, 136]; // Teal 600
const COLOR_TEAL_DARK: [number, number, number] = [15, 118, 110]; // Teal 700
const COLOR_EMERALD_BRIGHT: [number, number, number] = [52, 211, 153]; // Emerald 400
const COLOR_ROSE: [number, number, number] = [225, 29, 72]; // Rose 600
const COLOR_ROSE_DARK: [number, number, number] = [190, 18, 60]; // Rose 700

const CATEGORY_THEME_MAP: Record<
  string,
  { stroke: [number, number, number]; bg: [number, number, number]; bar: [number, number, number] }
> = {
  Plane: {
    stroke: [37, 99, 235],
    bg: [219, 234, 254],
    bar: [37, 99, 235], // Blue 600
  },
  Utensils: {
    stroke: [217, 119, 6],
    bg: [254, 243, 199],
    bar: [245, 158, 11], // Amber 500
  },
  Hotel: {
    stroke: [124, 58, 237],
    bg: [237, 233, 254],
    bar: [124, 58, 237], // Violet 600
  },
  Car: {
    stroke: [13, 148, 136],
    bg: [204, 251, 241],
    bar: [13, 148, 136], // Teal 600
  },
  Ticket: {
    stroke: [219, 39, 119],
    bg: [252, 231, 243],
    bar: [219, 39, 119], // Pink 600
  },
  Package: {
    stroke: [71, 85, 105],
    bg: [226, 232, 240],
    bar: [100, 116, 139], // Slate 500
  },
};

const DAY_BAR_PALETTE: Array<[number, number, number]> = [
  [13, 148, 136], // Teal 600
  [14, 116, 144], // Cyan 700
  [2, 132, 199], // Sky 600
  [37, 99, 235], // Blue 600
  [79, 70, 229], // Indigo 600
  [124, 58, 237], // Violet 600
];

function ensurePageSpace(doc: any, cursorY: number, neededHeight: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (cursorY + neededHeight > pageHeight - 14) {
    doc.addPage();
    return 13;
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
  const bannerH = 22;
  const y = startY;

  doc.setFillColor(...COLOR_HERO_DARK);
  doc.roundedRect(marginX, y, fullW, bannerH, 2.5, 2.5, 'F');

  doc.setFillColor(20, 184, 166);
  doc.roundedRect(marginX, y, fullW, 1.5, 1, 1, 'F');

  drawIconBadge(doc, 'Wallet', marginX + 4, y + 3.2, 4.4, [20, 184, 166], [30, 41, 59]);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...COLOR_EMERALD_BRIGHT);
  doc.text(`TDYTRIP  •  ${subtitleBadge}`, marginX + 9.8, y + 6.3);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  const maxTitleLen = report.tripName.length > 36 ? `${report.tripName.slice(0, 35)}…` : report.tripName;
  doc.text(maxTitleLen.toUpperCase(), marginX + 4, y + 13.4);

  let metaX = marginX + 4;
  const metaY = y + 18.8;
  if (report.location) {
    drawIconBadge(doc, 'MapPin', metaX, metaY - 3, 3.5, [56, 189, 248]);
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(203, 213, 225);
    doc.text(report.location, metaX + 4.3, metaY);
    metaX += doc.getTextWidth(report.location) + 8.5;
  }

  if (report.dateRangeLabel) {
    drawIconBadge(doc, 'Calendar', metaX, metaY - 3, 3.5, [52, 211, 153]);
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(203, 213, 225);
    doc.text(report.dateRangeLabel, metaX + 4.3, metaY);
  }

  // Hộp Highlight bên phải Hero Banner
  const rightBoxW = 56;
  const rightBoxX = pageWidth - marginX - rightBoxW - 3;
  const rightBoxY = y + 2.8;
  const rightBoxH = bannerH - 5.6;

  doc.setFillColor(...COLOR_HERO_CARD);
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.25);
  doc.roundedRect(rightBoxX, rightBoxY, rightBoxW, rightBoxH, 1.8, 1.8, 'FD');

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text('TỔNG CHI CHUYẾN ĐI', rightBoxX + rightBoxW - 3, rightBoxY + 4.2, {
    align: 'right',
  });

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(11.8);
  doc.setTextColor(...COLOR_EMERALD_BRIGHT);
  doc.text(
    `${formatVND(report.overview.totalExpenseAmount, false)} đ`,
    rightBoxX + rightBoxW - 3,
    rightBoxY + 10.4,
    { align: 'right' }
  );

  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Xuất: ${report.generatedAt}`, rightBoxX + rightBoxW - 3, rightBoxY + 14.3, {
    align: 'right',
  });

  return y + bannerH + 3.5;
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
  const y = ensurePageSpace(doc, cursorY, 11);

  doc.setFillColor(...COLOR_TEAL_DARK);
  doc.roundedRect(marginX, y - 0.5, 7.2, 5, 1.2, 1.2, 'F');
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(sectionCode, marginX + 3.6, y + 3, { align: 'center' });

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(10.2);
  doc.setTextColor(...COLOR_INK);
  doc.text(title, marginX + 9.4, y + 3.1);

  if (rightNote) {
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(...COLOR_TEAL_DARK);
    doc.text(rightNote, pageWidth - marginX, y + 3.1, { align: 'right' });
  }

  return y + 6.4;
}

function drawFourKpiRow(
  doc: any,
  activeFont: string,
  items: Array<{
    label: string;
    value: string;
    subtext?: string;
    iconName: string;
    accentColor: [number, number, number];
    surfaceColor: [number, number, number];
    borderColor: [number, number, number];
    iconBgColor: [number, number, number];
    valueColor?: [number, number, number];
  }>,
  marginX: number,
  cursorY: number,
  pageWidth: number
): number {
  const boxHeight = 17.2;
  const y = ensurePageSpace(doc, cursorY, boxHeight + 3);
  const gap = 3;
  const totalWidth = pageWidth - marginX * 2;
  const colWidth = (totalWidth - gap * 3) / 4;

  items.slice(0, 4).forEach((item, idx) => {
    const x = marginX + idx * (colWidth + gap);

    doc.setFillColor(item.surfaceColor[0], item.surfaceColor[1], item.surfaceColor[2]);
    doc.setDrawColor(item.borderColor[0], item.borderColor[1], item.borderColor[2]);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, y, colWidth, boxHeight, 1.8, 1.8, 'FD');

    doc.setFillColor(item.accentColor[0], item.accentColor[1], item.accentColor[2]);
    doc.roundedRect(x + 0.2, y + 0.2, colWidth - 0.4, 1.2, 0.8, 0.8, 'F');

    drawIconBadge(
      doc,
      item.iconName,
      x + colWidth - 7.6,
      y + 2.4,
      5.2,
      item.accentColor,
      item.iconBgColor
    );

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(item.label.toUpperCase(), x + 2.8, y + 5.1);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(9.8);
    const valColor = item.valueColor || COLOR_INK;
    doc.setTextColor(valColor[0], valColor[1], valColor[2]);
    doc.text(item.value, x + 2.8, y + 10.9);

    if (item.subtext) {
      doc.setFont(activeFont, 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...COLOR_SLATE);
      const cleanSub =
        item.subtext.length > 29 ? `${item.subtext.slice(0, 28)}…` : item.subtext;
      doc.text(cleanSub, x + 2.8, y + 14.9);
    }
  });

  return y + boxHeight + 3.4;
}

function drawCompactChartCard(
  doc: any,
  activeFont: string,
  title: string,
  headerIcon: string,
  headerIconColor: [number, number, number],
  headerIconBg: [number, number, number],
  items: Array<{
    label: string;
    iconName: string;
    iconStroke: [number, number, number];
    iconBg: [number, number, number];
    barColor: [number, number, number];
    amount: number;
    count: number;
    percentage: number;
  }>,
  x: number,
  y: number,
  width: number,
  fixedHeight?: number
): number {
  const maxItems = items.slice(0, 6);
  const itemHeight = 7.5;
  const headerH = 8;
  const cardH = fixedHeight || Math.max(24, headerH + maxItems.length * itemHeight + 2.2);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, width, cardH, 1.8, 1.8, 'FD');

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(x + 0.2, y + 0.2, width - 0.4, headerH - 0.4, 1.6, 1.6, 'F');

  drawIconBadge(doc, headerIcon, x + 3, y + 1.7, 4.5, headerIconColor, headerIconBg);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.1);
  doc.setTextColor(...COLOR_INK);
  doc.text(title, x + 8.6, y + 5.1);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(x + 2.5, y + headerH, x + width - 2.5, y + headerH);

  let rowY = y + headerH + 1.1;
  const iconSize = 4.2;
  const textStartX = x + 3 + iconSize + 1.6;
  const trackW = width - (iconSize + 1.6) - 6;

  maxItems.forEach((item) => {
    drawIconBadge(doc, item.iconName, x + 3, rowY + 0.5, iconSize, item.iconStroke, item.iconBg);

    // Dòng 1: Tên hạng mục / ngày + số khoản chi
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(...COLOR_INK);
    const cleanLabel =
      item.label.length > 28 ? `${item.label.slice(0, 27)}…` : item.label;
    doc.text(`${cleanLabel} • ${item.count} khoản`, textStartX, rowY + 2.6);

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(item.iconStroke[0], item.iconStroke[1], item.iconStroke[2]);
    doc.text(
      `${formatVND(item.amount, false)} đ (${item.percentage}%)`,
      x + width - 3,
      rowY + 2.6,
      { align: 'right' }
    );

    // Dòng 2: Thanh progress bar bo tròn sống động
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(textStartX, rowY + 3.8, trackW, 2, 0.8, 0.8, 'F');

    const ratio = Math.max(0, Math.min(1, item.percentage / 100));
    const fillW = Math.max(ratio > 0 ? 1.8 : 0, trackW * ratio);
    if (fillW > 0) {
      doc.setFillColor(item.barColor[0], item.barColor[1], item.barColor[2]);
      doc.roundedRect(textStartX, rowY + 3.8, fillW, 2, 0.8, 0.8, 'F');
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
  const sharedHeight = 8 + maxRows * 7.5 + 2.2;
  const y = ensurePageSpace(doc, cursorY, sharedHeight + 4);

  const gap = 4;
  const fullW = pageWidth - marginX * 2;
  const colW = (fullW - gap) / 2;

  drawCompactChartCard(
    doc,
    activeFont,
    'Chi tiêu theo Hạng mục',
    'PieChart',
    [13, 148, 136],
    [204, 251, 241],
    byCategory.map((c) => {
      const theme = CATEGORY_THEME_MAP[c.categoryIcon] || CATEGORY_THEME_MAP.Package;
      return {
        label: shortenCategoryLabelForTable(c.categoryName),
        iconName: c.categoryIcon || 'Package',
        iconStroke: theme.stroke,
        iconBg: theme.bg,
        barColor: theme.bar,
        amount: c.amount,
        count: c.count,
        percentage: c.percentage,
      };
    }),
    marginX,
    y,
    colW,
    sharedHeight
  );

  drawCompactChartCard(
    doc,
    activeFont,
    'Chi tiêu theo Ngày',
    'Calendar',
    [37, 99, 235],
    [219, 234, 254],
    byDay.map((d, idx) => {
      const barCol = DAY_BAR_PALETTE[idx % DAY_BAR_PALETTE.length];
      return {
        label: d.label.replace(/\s*\((\d{2}\/\d{2})\/\d{4}\)/, ' ($1)'),
        iconName: 'Calendar',
        iconStroke: barCol,
        iconBg: [241, 245, 249],
        barColor: barCol,
        amount: d.amount,
        count: d.count,
        percentage: d.percentage,
      };
    }),
    marginX + colW + gap,
    y,
    colW,
    sharedHeight
  );

  return y + sharedHeight + 3.8;
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

  const rowHeight = 7.4;
  const headerHeight = 8;
  const totalBoxHeight = headerHeight + balances.length * rowHeight + 2.2;

  const y = ensurePageSpace(doc, cursorY, totalBoxHeight + 3);
  const fullWidth = pageWidth - marginX * 2;

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(marginX, y, fullWidth, totalBoxHeight, 1.8, 1.8, 'FD');

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX + 0.2, y + 0.2, fullWidth - 0.4, headerHeight - 0.4, 1.6, 1.6, 'F');
  drawIconBadge(doc, 'ArrowRightLeft', marginX + 3, y + 1.7, 4.5, [13, 148, 136], [204, 251, 241]);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.1);
  doc.setTextColor(...COLOR_INK);
  doc.text('So sánh Đã chi & Phải chịu theo Thành viên', marginX + 8.6, y + 5.1);

  const legendRightX = marginX + fullWidth - 3.5;
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.1);

  doc.setFillColor(...COLOR_TEAL);
  doc.roundedRect(legendRightX - 54, y + 2.7, 2.8, 2.8, 0.5, 0.5, 'F');
  doc.setTextColor(...COLOR_SLATE);
  doc.text('Đã chi', legendRightX - 50, y + 4.9);

  doc.setFillColor(148, 163, 184);
  doc.roundedRect(legendRightX - 28, y + 2.7, 2.8, 2.8, 0.5, 0.5, 'F');
  doc.text('Phải chịu', legendRightX - 24, y + 4.9);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(marginX + 2.5, y + headerHeight, marginX + fullWidth - 2.5, y + headerHSpacer(headerHeight));

  const maxVal = Math.max(
    1,
    ...balances.map((b) => Math.max(b.paidExpense, b.owedExpense))
  );

  let rowY = y + headerHeight + 0.9;
  const nameColWidth = 34;
  const statusColWidth = 42;
  const barTrackX = marginX + 3.5 + nameColWidth;
  const barTrackWidth = fullWidth - 7 - nameColWidth - statusColWidth;

  balances.forEach((b) => {
    const avatarRgb = hexToRgb(b.avatarColor, [13, 148, 136]);
    doc.setFillColor(avatarRgb[0], avatarRgb[1], avatarRgb[2]);
    doc.circle(marginX + 5.6, rowY + 3.1, 2.2, 'F');
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(6.3);
    doc.setTextColor(255, 255, 255);
    const initial = (b.memberName || '?').trim().charAt(0).toUpperCase();
    doc.text(initial, marginX + 5.6, rowY + 3.85, { align: 'center' });

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_INK);
    const shortName = b.memberName.length > 15 ? `${b.memberName.slice(0, 14)}…` : b.memberName;
    doc.text(shortName, marginX + 9.2, rowY + 3.9);

    // Thanh 1: Đã chi (Teal 600)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 0.8, barTrackWidth, 2, 0.7, 0.7, 'F');
    const paidW = Math.max(
      b.paidExpense > 0 ? 1.5 : 0,
      (b.paidExpense / maxVal) * barTrackWidth
    );
    if (paidW > 0) {
      doc.setFillColor(...COLOR_TEAL);
      doc.roundedRect(barTrackX, rowY + 0.8, paidW, 2, 0.7, 0.7, 'F');
    }

    // Thanh 2: Phải chịu (Slate 400)
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(barTrackX, rowY + 3.4, barTrackWidth, 2, 0.7, 0.7, 'F');
    const owedW = Math.max(
      b.owedExpense > 0 ? 1.5 : 0,
      (b.owedExpense / maxVal) * barTrackWidth
    );
    if (owedW > 0) {
      doc.setFillColor(148, 163, 184);
      doc.roundedRect(barTrackX, rowY + 3.4, owedW, 2, 0.7, 0.7, 'F');
    }

    // Pill Số dư cuối bên phải
    let balLabel = '0 đ';
    let pillBg: [number, number, number] = [241, 245, 249];
    let pillText: [number, number, number] = COLOR_MUTED;
    if (b.balance > 0) {
      pillBg = [209, 250, 229];
      pillText = COLOR_TEAL_DARK;
      balLabel = `+${formatVND(b.balance, false)} đ`;
    } else if (b.balance < 0) {
      pillBg = [255, 228, 230];
      pillText = COLOR_ROSE_DARK;
      balLabel = `${formatVND(b.balance, false)} đ`;
    }

    const pillW = 31;
    const pillX = marginX + fullWidth - 3.2 - pillW;
    doc.setFillColor(pillBg[0], pillBg[1], pillBg[2]);
    doc.roundedRect(pillX, rowY + 0.6, pillW, 4.9, 1.2, 1.2, 'F');

    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(pillText[0], pillText[1], pillText[2]);
    doc.text(balLabel, marginX + fullWidth - 4.8, rowY + 3.95, { align: 'right' });

    rowY += rowHeight;
  });

  return y + totalBoxHeight + 3.2;
}

function headerHSpacer(h: number): number {
  return h;
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

  // Hero Header cho trang Phụ lục cá nhân
  const bannerH = 18.5;
  doc.setFillColor(...COLOR_HERO_DARK);
  doc.roundedRect(marginX, cursorY, fullWidth, bannerH, 2.2, 2.2, 'F');

  const avatarRgb = hexToRgb(appendix.avatarColor, [13, 148, 136]);
  doc.setFillColor(avatarRgb[0], avatarRgb[1], avatarRgb[2]);
  doc.roundedRect(marginX, cursorY, fullWidth, 1.4, 0.8, 0.8, 'F');

  doc.setFillColor(avatarRgb[0], avatarRgb[1], avatarRgb[2]);
  doc.circle(marginX + 8.5, cursorY + 10, 4.6, 'F');
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(10.8);
  doc.setTextColor(255, 255, 255);
  doc.text(
    (appendix.memberName || '?').trim().charAt(0).toUpperCase(),
    marginX + 8.5,
    cursorY + 11.3,
    { align: 'center' }
  );

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(7.1);
  doc.setTextColor(...COLOR_EMERALD_BRIGHT);
  doc.text(`${badgeLabel}  •  ${report.tripName.toUpperCase()}`, marginX + 16, cursorY + 6.3);

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(13.2);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `QUYẾT TOÁN CÁ NHÂN: ${appendix.memberName.toUpperCase()}`,
    marginX + 16,
    cursorY + 13.5
  );

  if (appendix.bankInfo) {
    doc.setFillColor(...COLOR_HERO_CARD);
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.2);
    const bankText = `TK nhận: ${appendix.bankInfo}`;
    doc.setFont(activeFont, 'bold');
    doc.setFontSize(7.4);
    const bw = Math.min(78, doc.getTextWidth(bankText) + 6);
    doc.roundedRect(pageWidth - marginX - bw - 3, cursorY + 5.2, bw, 8, 1.5, 1.5, 'FD');
    doc.setTextColor(226, 232, 240);
    doc.text(bankText, pageWidth - marginX - 6, cursorY + 10.2, { align: 'right' });
  }

  cursorY += bannerH + 3.5;

  // 4 ô KPI cá nhân
  const isPositive = appendix.balance > 0;
  const isNegative = appendix.balance < 0;
  const balanceAccent: [number, number, number] = isPositive
    ? COLOR_TEAL_DARK
    : isNegative
      ? COLOR_ROSE_DARK
      : COLOR_SLATE;
  const balanceSurface: [number, number, number] = isPositive
    ? [240, 253, 250]
    : isNegative
      ? [255, 241, 242]
      : [248, 250, 252];
  const balanceBorder: [number, number, number] = isPositive
    ? [153, 246, 228]
    : isNegative
      ? [254, 205, 211]
      : [226, 232, 240];
  const balanceIconBg: [number, number, number] = isPositive
    ? [204, 251, 241]
    : isNegative
      ? [255, 228, 230]
      : [226, 232, 240];

  const balanceStatusText = isPositive
    ? 'Số tiền được nhận về'
    : isNegative
      ? 'Số tiền cần chuyển trả'
      : 'Đã cân bằng thu chi';
  const balPrefix = isPositive ? '+' : '';

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
        label: 'Đã chi',
        value: `${formatVND(appendix.paidExpense, false)} đ`,
        subtext: `${appendix.paidRows.filter((r) => r.recordType === 'expense').length} khoản (${shareRatioPct}% tổng chi)`,
        iconName: 'Wallet',
        accentColor: COLOR_TEAL,
        surfaceColor: [240, 253, 250],
        borderColor: [153, 246, 228],
        iconBgColor: [204, 251, 241],
        valueColor: COLOR_TEAL_DARK,
      },
      {
        label: 'Phải chịu',
        value: `${formatVND(appendix.owedExpense, false)} đ`,
        subtext: `Tham gia ${appendix.participatedRows.filter((r) => r.recordType === 'expense').length} khoản chi`,
        iconName: 'Users',
        accentColor: [37, 99, 235],
        surfaceColor: [239, 246, 255],
        borderColor: [191, 219, 254],
        iconBgColor: [219, 234, 254],
        valueColor: COLOR_INK,
      },
      hasMemberTransfers
        ? {
            label: 'Đã chuyển / nhận',
            value: `${formatVND(appendix.netTransfer, false)} đ`,
            subtext: `Chuyển ${formatVND(appendix.sentTransfer, false)} / Nhận ${formatVND(appendix.receivedTransfer, false)}`,
            iconName: 'ArrowRightLeft',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: COLOR_INK,
          }
        : {
            label: 'Giao dịch tất toán',
            value:
              appendix.finalSettlementActions.length > 0
                ? `${appendix.finalSettlementActions.length} giao dịch`
                : 'Không cần chuyển',
            subtext:
              appendix.finalSettlementActions.length > 0
                ? isNegative
                  ? 'Chuyển khoản tất toán'
                  : 'Nhận tiền tất toán'
                : 'Đã cân bằng',
            iconName: 'Send',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: COLOR_INK,
          },
      {
        label: 'Số dư cuối',
        value: `${balPrefix}${formatVND(appendix.balance, false)} đ`,
        subtext: balanceStatusText,
        iconName: 'CheckCircle',
        accentColor: balanceAccent,
        surfaceColor: balanceSurface,
        borderColor: balanceBorder,
        iconBgColor: balanceIconBg,
        valueColor: balanceAccent,
      },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // Bố cục 2 cột song song:
  // - Cột trái: Khung KẾT QUẢ QUYẾT TOÁN CÁ NHÂN
  // - Cột phải: Biểu đồ Chi phí theo Hạng mục
  const gap = 4;
  const leftColW = fullWidth * 0.48;
  const rightColW = fullWidth - leftColW - gap;

  const actions = appendix.finalSettlementActions;
  const catCount = Math.min(6, appendix.byCategory.length);
  const rightChartH = catCount > 0 ? 8 + catCount * 7.5 + 2.2 : 24;
  const leftMinH = Math.max(26, 12 + Math.max(1, actions.length) * 8 + 8);
  const blockH = Math.max(rightChartH, leftMinH);

  cursorY = ensurePageSpace(doc, cursorY, blockH + 4);

  // Vẽ Cột trái: Khung Kết quả Quyết toán cá nhân nổi bật
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(isNegative ? 254 : 153, isNegative ? 205 : 246, isNegative ? 211 : 228);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, cursorY, leftColW, blockH, 1.8, 1.8, 'FD');

  doc.setFillColor(isNegative ? 255 : 240, isNegative ? 241 : 253, isNegative ? 242 : 250);
  doc.roundedRect(marginX + 0.2, cursorY + 0.2, leftColW - 0.4, 7.8, 1.6, 1.6, 'F');

  const leftBarColor = isNegative ? COLOR_ROSE : isPositive ? COLOR_TEAL_DARK : COLOR_SLATE;
  doc.setFillColor(...leftBarColor);
  doc.roundedRect(marginX, cursorY, 2.2, blockH, 1, 1, 'F');

  drawIconBadge(
    doc,
    'Send',
    marginX + 4.2,
    cursorY + 1.7,
    4.5,
    leftBarColor,
    isNegative ? [255, 228, 230] : [204, 251, 241]
  );

  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.1);
  doc.setTextColor(...COLOR_INK);
  doc.text('KẾT QUẢ QUYẾT TOÁN CÁ NHÂN', marginX + 9.8, cursorY + 5.1);

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(marginX + 4, cursorY + 8, marginX + leftColW - 3.5, cursorY + 8);

  if (actions.length === 0) {
    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(...COLOR_SLATE);
    doc.text(
      `${appendix.memberName} đã cân bằng thu chi, không cần chuyển khoản.`,
      marginX + 5,
      cursorY + 14.5
    );
  } else if (actions.length === 1) {
    // Khi chỉ có 1 giao dịch quyết toán: Vẽ thẻ Callout nổi bật để làm tâm điểm trực quan
    const act = actions[0];
    const isSender = act.fromMemberId === appendix.memberId;
    const subCardX = marginX + 4.5;
    const subCardY = cursorY + 10.5;
    const subCardW = leftColW - 8;
    const subCardH = act.toBankInfo && isSender ? 18.5 : 13.5;

    doc.setFillColor(isSender ? 255 : 240, isSender ? 241 : 253, isSender ? 242 : 250);
    doc.setDrawColor(isSender ? 254 : 153, isSender ? 205 : 246, isSender ? 211 : 228);
    doc.setLineWidth(0.25);
    doc.roundedRect(subCardX, subCardY, subCardW, subCardH, 1.5, 1.5, 'FD');

    if (isSender) {
      drawTransferPairWithArrow(
        doc,
        activeFont,
        'bold',
        9.2,
        appendix.memberName,
        act.toMemberName,
        subCardX + 3.2,
        subCardY + 6.2,
        COLOR_ROSE_DARK,
        COLOR_ROSE,
        COLOR_INK
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(...COLOR_ROSE_DARK);
      doc.text(
        `${formatVND(act.amount, false)} đ`,
        subCardX + subCardW - 3.2,
        subCardY + 6.2,
        { align: 'right' }
      );

      if (act.toBankInfo) {
        doc.setFont(activeFont, 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(...COLOR_SLATE);
        doc.text(`TK nhận: ${act.toBankInfo}`, subCardX + 3.2, subCardY + 13.2);
      }
    } else {
      drawTransferPairWithArrow(
        doc,
        activeFont,
        'bold',
        9.2,
        act.fromMemberName,
        appendix.memberName,
        subCardX + 3.2,
        subCardY + 7.5,
        COLOR_INK,
        COLOR_TEAL,
        COLOR_TEAL_DARK
      );

      doc.setFont(activeFont, 'bold');
      doc.setFontSize(9.8);
      doc.setTextColor(...COLOR_TEAL_DARK);
      doc.text(
        `+${formatVND(act.amount, false)} đ`,
        subCardX + subCardW - 3.2,
        subCardY + 7.5,
        { align: 'right' }
      );
    }
  } else {
    let actY = cursorY + 12.8;
    actions.forEach((act) => {
      const isSender = act.fromMemberId === appendix.memberId;

      if (isSender) {
        drawTransferPairWithArrow(
          doc,
          activeFont,
          'bold',
          8.4,
          appendix.memberName,
          act.toMemberName,
          marginX + 5,
          actY,
          COLOR_ROSE_DARK,
          COLOR_ROSE,
          COLOR_INK
        );

        doc.setFont(activeFont, 'bold');
        doc.setFontSize(8.6);
        doc.setTextColor(...COLOR_ROSE_DARK);
        doc.text(
          `${formatVND(act.amount, false)} đ`,
          marginX + leftColW - 4,
          actY,
          { align: 'right' }
        );

        if (act.toBankInfo) {
          actY += 4.2;
          doc.setFont(activeFont, 'normal');
          doc.setFontSize(7.2);
          doc.setTextColor(...COLOR_SLATE);
          doc.text(`TK nhận: ${act.toBankInfo}`, marginX + 5, actY);
        }
      } else {
        drawTransferPairWithArrow(
          doc,
          activeFont,
          'bold',
          8.2,
          act.fromMemberName,
          appendix.memberName,
          marginX + 5,
          actY,
          COLOR_INK,
          COLOR_TEAL,
          COLOR_TEAL_DARK
        );

        doc.setFont(activeFont, 'bold');
        doc.setFontSize(8.4);
        doc.setTextColor(...COLOR_TEAL_DARK);
        doc.text(
          `+${formatVND(act.amount, false)} đ`,
          marginX + leftColW - 4,
          actY,
          { align: 'right' }
        );
      }
      actY += 5.8;
    });
  }

  // Dòng công thức tính nhanh dưới đáy hộp Quyết toán cá nhân (dùng dấu '-' chuẩn ASCII)
  const formulaY = cursorY + blockH - 3.2;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.18);
  doc.line(marginX + 4.5, formulaY - 3.8, marginX + leftColW - 3.5, formulaY - 3.8);
  doc.setFont(activeFont, 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...COLOR_MUTED);
  doc.text(
    `Tính toán: Đã chi (${formatVND(appendix.paidExpense, false)}) - Phải chịu (${formatVND(appendix.owedExpense, false)}) = ${balPrefix}${formatVND(appendix.balance, false)} đ`,
    marginX + 4.8,
    formulaY
  );

  // Vẽ Cột phải: Biểu đồ Chi phí theo Hạng mục kèm Icon
  if (appendix.byCategory.length > 0) {
    drawCompactChartCard(
      doc,
      activeFont,
      `Chi phí theo Hạng mục (${appendix.memberName})`,
      'PieChart',
      [13, 148, 136],
      [204, 251, 241],
      appendix.byCategory.slice(0, 6).map((c) => {
        const theme = CATEGORY_THEME_MAP[c.categoryIcon] || CATEGORY_THEME_MAP.Package;
        return {
          label: shortenCategoryLabelForTable(c.categoryName),
          iconName: c.categoryIcon || 'Package',
          iconStroke: theme.stroke,
          iconBg: theme.bg,
          barColor: theme.bar,
          amount: c.amount,
          count: c.count,
          percentage: c.percentage,
        };
      }),
      marginX + leftColW + gap,
      cursorY,
      rightColW,
      blockH
    );
  }

  cursorY += blockH + 4.5;

  // Bảng các khoản thành viên đã chi
  cursorY = ensurePageSpace(doc, cursorY, 20);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(...COLOR_INK);
  doc.text(
    `CÁC KHOẢN ${appendix.memberName.toUpperCase()} ĐÃ CHI (${appendix.paidRows.length} KHOẢN)`,
    marginX,
    cursorY + 3
  );
  cursorY += 4.2;

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
      head: [
        [
          { content: '#', styles: { halign: 'center' } },
          'Thời gian',
          'Nội dung khoản chi',
          'Chia cho',
          'Hạng mục',
          { content: 'Số tiền (đ)', styles: { halign: 'right' } },
        ],
      ],
      body:
        paidBody.length > 0
          ? paidBody
          : [['—', '—', `${appendix.memberName} chưa chi khoản nào`, '—', '—', '0']],
      foot:
        paidBody.length > 0
          ? [
              [
                {
                  content: `TỔNG ĐÃ CHI (${appendix.paidRows.length} khoản)`,
                  colSpan: 5,
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_INK },
                },
                {
                  content: formatVND(appendix.paidExpense, false),
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
                },
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX, bottom: 14 },
      styles: {
        font: activeFont,
        fontSize: 7.8,
        cellPadding: 1.65,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.12,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: [30, 41, 59],
        lineWidth: 0.15,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [240, 253, 250],
        textColor: COLOR_TEAL_DARK,
        lineColor: [153, 246, 228],
        lineWidth: 0.2,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 9, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 27 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 32, textColor: COLOR_SLATE },
        4: { cellWidth: 24, textColor: COLOR_SLATE },
        5: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            data.cell.text = [''];
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            const [p1, p2] = raw.split('→').map((s) => s.trim());
            const textX = data.cell.x + data.cell.padding('left');
            const midY = data.cell.y + data.cell.height / 2 + 0.9;
            drawTransferPairWithArrow(
              doc,
              activeFont,
              'normal',
              7.6,
              p1 || '',
              p2 || '',
              textX,
              midY,
              COLOR_SLATE,
              COLOR_TEAL,
              COLOR_SLATE
            );
          }
        }
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
    doc.line(marginX, pageHeight - 10.5, pageWidth - marginX, pageHeight - 10.5);

    doc.setFont(activeFont, 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...COLOR_MUTED);
    doc.text(
      `TdyTrip  •  ${report.tripName}  •  Báo cáo chi tiêu & quyết toán`,
      marginX,
      pageHeight - 6.8
    );
    doc.setFont(activeFont, 'bold');
    doc.text(`Trang ${p} / ${totalPages}`, pageWidth - marginX, pageHeight - 6.8, {
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

  // Trường hợp lọc theo 1 thành viên cụ thể: Xuất báo cáo cá nhân
  if (report.filterMemberId !== 'all' && report.memberAppendices.length > 0) {
    renderMemberAppendixSection(
      doc,
      autoTableFn,
      activeFont,
      report,
      report.memberAppendices[0],
      'BÁO CÁO QUYẾT TOÁN CÁ NHÂN',
      marginX,
      10.5,
      pageWidth
    );
    stampPageFooters(doc, activeFont, report);
    doc.save(report.suggestedFileName);
    return;
  }

  // ==========================================================================
  // TRANG 1: TỔNG QUAN CHUYẾN ĐI & KẾT QUẢ QUYẾT TOÁN
  // ==========================================================================
  let cursorY = drawExecutiveMasthead(
    doc,
    activeFont,
    report,
    'BÁO CÁO CHI TIÊU & QUYẾT TOÁN',
    marginX,
    10,
    pageWidth
  );

  // PHẦN 01: TỔNG QUAN CHI TIÊU
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '01',
    'TỔNG QUAN CHI TIÊU',
    `${report.overview.memberCount} thành viên  •  ${report.overview.expenseCount} khoản chi`,
    marginX,
    cursorY,
    pageWidth
  );

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
        label: 'Tổng chi tiêu',
        value: `${formatVND(report.overview.totalExpenseAmount, false)} đ`,
        subtext: `${report.overview.expenseCount} khoản chi • ${report.overview.byDay.length} ngày`,
        iconName: 'Wallet',
        accentColor: COLOR_TEAL,
        surfaceColor: [240, 253, 250],
        borderColor: [153, 246, 228],
        iconBgColor: [204, 251, 241],
        valueColor: COLOR_TEAL_DARK,
      },
      {
        label: 'Bình quân / người',
        value: `${formatVND(report.overview.averagePerMember, false)} đ`,
        subtext: `Chia cho ${report.overview.memberCount} thành viên`,
        iconName: 'Users',
        accentColor: [37, 99, 235],
        surfaceColor: [239, 246, 255],
        borderColor: [191, 219, 254],
        iconBgColor: [219, 234, 254],
        valueColor: [30, 64, 175],
      },
      {
        label: 'Hạng mục lớn nhất',
        value: topCat ? `${formatVND(topCat.amount, false)} đ` : '0 đ',
        subtext: topCat
          ? `${shortenCategoryLabelForTable(topCat.categoryName)} (${topCat.percentage}%)`
          : 'Chưa phát sinh',
        iconName: topCat?.categoryIcon || 'PieChart',
        accentColor: [217, 119, 6],
        surfaceColor: [255, 251, 235],
        borderColor: [253, 230, 138],
        iconBgColor: [254, 243, 199],
        valueColor: [180, 83, 9],
      },
      report.overview.totalTransferAmount > 0
        ? {
            label: 'Đã chuyển trả',
            value: `${formatVND(report.overview.totalTransferAmount, false)} đ`,
            subtext: `${report.overview.transferCount} giao dịch đã chuyển`,
            iconName: 'ArrowRightLeft',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: [109, 40, 217],
          }
        : {
            label: 'Chi nhiều nhất',
            value: topPayer ? `${formatVND(topPayer.paidExpense, false)} đ` : '0 đ',
            subtext: topPayer
              ? `${topPayer.memberName} (${topPayerPct}% tổng chi)`
              : 'Chưa phát sinh',
            iconName: 'Award',
            accentColor: [124, 58, 237],
            surfaceColor: [245, 243, 255],
            borderColor: [221, 214, 254],
            iconBgColor: [237, 233, 254],
            valueColor: [109, 40, 217],
          },
    ],
    marginX,
    cursorY,
    pageWidth
  );

  // 2 Biểu đồ đặt song song 2 cột (Chi tiêu theo Hạng mục & Chi tiêu theo Ngày) kèm Icon
  cursorY = drawSideBySideOverviewCharts(
    doc,
    activeFont,
    report.overview.byCategory,
    report.overview.byDay,
    marginX,
    cursorY,
    pageWidth
  );

  // PHẦN 02: QUYẾT TOÁN CHIA TIỀN
  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '02',
    'CÂN ĐỐI THU CHI & QUYẾT TOÁN',
    `${report.settlement.simplifiedDebts.length} giao dịch tất toán`,
    marginX,
    cursorY,
    pageWidth
  );

  // Biểu đồ tương quan Đã chi vs. Phải chịu kèm Avatar tròn
  cursorY = drawMemberBalanceComparisonChart(
    doc,
    activeFont,
    report.settlement.balances,
    marginX,
    cursorY,
    pageWidth
  );

  const hasAnyTransfers = report.overview.totalTransferAmount > 0;

  // Bảng 2.1: Bảng cân đối tổng hợp từng thành viên (Cột cuối Trạng thái canh phải)
  if (typeof autoTableFn === 'function') {
    const balanceHead = hasAnyTransfers
      ? [
          [
            'Thành viên',
            { content: 'Đã chi (đ)', styles: { halign: 'right' } },
            { content: 'Phải chịu (đ)', styles: { halign: 'right' } },
            { content: 'Đã chuyển (đ)', styles: { halign: 'right' } },
            { content: 'Số dư cuối (đ)', styles: { halign: 'right' } },
            { content: 'Trạng thái', styles: { halign: 'right' } },
          ],
        ]
      : [
          [
            'Thành viên',
            { content: 'Đã chi (đ)', styles: { halign: 'right' } },
            { content: 'Phải chịu (đ)', styles: { halign: 'right' } },
            { content: 'Số dư cuối (đ)', styles: { halign: 'right' } },
            { content: 'Trạng thái', styles: { halign: 'right' } },
          ],
        ];

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
      margin: { left: marginX, right: marginX, bottom: 14 },
      styles: {
        font: activeFont,
        fontSize: 8.1,
        cellPadding: 1.8,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.12,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: [30, 41, 59],
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: hasAnyTransfers
        ? {
            0: { cellWidth: 34, fontStyle: 'bold' },
            1: { cellWidth: 30, halign: 'right' },
            2: { cellWidth: 30, halign: 'right' },
            3: { cellWidth: 30, halign: 'right' },
            4: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
            5: { cellWidth: 'auto', halign: 'right' },
          }
        : {
            0: { cellWidth: 38, fontStyle: 'bold' },
            1: { cellWidth: 36, halign: 'right' },
            2: { cellWidth: 36, halign: 'right' },
            3: { cellWidth: 38, halign: 'right', fontStyle: 'bold' },
            4: { cellWidth: 'auto', halign: 'right' },
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
            data.cell.styles.textColor = COLOR_ROSE_DARK;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 3.8;
  }

  // Bảng 2.2: DANH SÁCH CHUYỂN KHOẢN QUYẾT TOÁN (Nổi bật nhất trên Trang 1, cột cuối canh phải)
  cursorY = ensurePageSpace(doc, cursorY, 22);
  drawIconBadge(doc, 'Send', marginX, cursorY - 0.5, 4.4, [15, 118, 110], [204, 251, 241]);
  doc.setFont(activeFont, 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...COLOR_TEAL_DARK);
  doc.text(
    'DANH SÁCH CHUYỂN KHOẢN QUYẾT TOÁN',
    marginX + 5.6,
    cursorY + 2.8
  );
  cursorY += 4.2;

  if (typeof autoTableFn === 'function') {
    const hasDebts = report.settlement.simplifiedDebts.length > 0;
    const simplifiedBody = report.settlement.simplifiedDebts.map((d, idx) => [
      `${idx + 1}`,
      `${d.fromMemberName} → ${d.toMemberName}`,
      formatVND(d.amount, false),
      d.toBankInfo || 'Chưa cập nhật STK',
    ]);

    autoTableFn.call(doc, {
      startY: cursorY,
      rowPageBreak: 'avoid',
      head: [
        [
          { content: '#', styles: { halign: 'center' } },
          '', // Vẽ tiêu đề "Người chuyển → Người nhận" bằng vector arrow trong didDrawCell
          { content: 'Số tiền chuyển (đ)', styles: { halign: 'right' } },
          { content: 'Tài khoản nhận', styles: { halign: 'right' } },
        ],
      ],
      body: hasDebts
        ? simplifiedBody
        : [['—', 'Tất cả thành viên đã cân bằng thu chi', '0', '—']],
      margin: { left: marginX, right: marginX, bottom: 14 },
      styles: {
        font: activeFont,
        fontSize: 8.4,
        cellPadding: 2,
        textColor: COLOR_INK,
        lineColor: [153, 246, 228],
        lineWidth: 0.16,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: COLOR_TEAL_DARK,
        textColor: [255, 255, 255],
      },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 56, fontStyle: 'bold' },
        2: { cellWidth: 42, halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
        3: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold', textColor: COLOR_SLATE },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1 && hasDebts) {
          // Xóa text mặc định để vẽ tên + mũi tên vector sắc nét trong didDrawCell
          data.cell.text = [''];
        }
      },
      didDrawCell: (data: any) => {
        if (data.column.index === 1) {
          const textX = data.cell.x + data.cell.padding('left');
          const midY = data.cell.y + data.cell.height / 2 + 1;
          if (data.section === 'head') {
            drawTransferPairWithArrow(
              doc,
              activeFont,
              'bold',
              8.3,
              'Người chuyển',
              'Người nhận',
              textX,
              midY,
              [255, 255, 255],
              [153, 246, 228],
              [255, 255, 255]
            );
          } else if (data.section === 'body' && hasDebts) {
            const debt = report.settlement.simplifiedDebts[data.row.index];
            if (debt) {
              drawTransferPairWithArrow(
                doc,
                activeFont,
                'bold',
                8.5,
                debt.fromMemberName,
                debt.toMemberName,
                textX,
                midY,
                COLOR_ROSE_DARK,
                COLOR_TEAL,
                COLOR_TEAL_DARK
              );
            }
          }
        }
      },
    });
    cursorY = ((doc as any).lastAutoTable?.finalY || cursorY + 14) + 5;
  }

  // ==========================================================================
  // PHẦN 03: DANH SÁCH CHI TIẾT KHOẢN CHI (Tối ưu dòng gọn để 42 mục vừa khít 1 trang)
  // ==========================================================================
  if (cursorY > 195) {
    doc.addPage();
    cursorY = 12;
  }

  cursorY = drawSectionHeading(
    doc,
    activeFont,
    '03',
    'DANH SÁCH CHI TIẾT KHOẢN CHI',
    `${report.rows.length} giao dịch theo thời gian`,
    marginX,
    cursorY,
    pageWidth
  );

  if (typeof autoTableFn === 'function') {
    const tableHead = [
      [
        { content: '#', styles: { halign: 'center' } },
        'Thời gian',
        'Nội dung khoản chi',
        'Người chi',
        'Chia cho',
        'Hạng mục',
        { content: 'Số tiền (đ)', styles: { halign: 'right' } },
      ],
    ];
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
                {
                  content:
                    report.overview.transferCount > 0
                      ? `TỔNG CHI TIÊU CHUYẾN ĐI (${report.overview.expenseCount} khoản chi • Đã chuyển: ${formatVND(report.totalTransferAmount, false)} đ)`
                      : `TỔNG CHI TIÊU CHUYẾN ĐI (${report.overview.expenseCount} khoản chi)`,
                  colSpan: 6,
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_INK },
                },
                {
                  content: formatVND(report.overview.totalExpenseAmount, false),
                  styles: { halign: 'right', fontStyle: 'bold', textColor: COLOR_TEAL_DARK },
                },
              ],
            ]
          : undefined,
      margin: { left: marginX, right: marginX, bottom: 13 },
      styles: {
        font: activeFont,
        fontSize: 7.45,
        cellPadding: 1.25,
        textColor: COLOR_INK,
        lineColor: COLOR_BORDER,
        lineWidth: 0.1,
        valign: 'middle',
      },
      headStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        lineColor: [30, 41, 59],
        lineWidth: 0.15,
      },
      footStyles: {
        font: activeFont,
        fontStyle: 'bold',
        fillColor: [240, 253, 250],
        textColor: COLOR_TEAL_DARK,
        lineColor: [153, 246, 228],
        lineWidth: 0.2,
        halign: 'right',
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: COLOR_MUTED },
        1: { cellWidth: 26 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 22 },
        4: { cellWidth: 31, textColor: COLOR_SLATE },
        5: { cellWidth: 23, textColor: COLOR_SLATE },
        6: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            data.cell.text = [''];
          }
        }
      },
      didDrawCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4) {
          const raw = String(data.cell.raw || '');
          if (raw.includes('→')) {
            const [p1, p2] = raw.split('→').map((s) => s.trim());
            const textX = data.cell.x + data.cell.padding('left');
            const midY = data.cell.y + data.cell.height / 2 + 0.9;
            drawTransferPairWithArrow(
              doc,
              activeFont,
              'normal',
              7.3,
              p1 || '',
              p2 || '',
              textX,
              midY,
              COLOR_SLATE,
              COLOR_TEAL,
              COLOR_SLATE
            );
          }
        }
      },
    });
  }

  // ==========================================================================
  // PHẦN 04: PHỤ LỤC THỐNG KÊ THEO TỪNG CÁ NHÂN (MỖI THÀNH VIÊN 1 TRANG TINH GỌN)
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
      10.5,
      pageWidth
    );
  });

  stampPageFooters(doc, activeFont, report);
  doc.save(report.suggestedFileName);
}
